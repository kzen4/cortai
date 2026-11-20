import { Notification, type BrowserWindow } from 'electron';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { toSrt } from '@shared/clipWords';
import { DEFAULT_WEBCAM, detectCornerWebcam, editList, outDuration, outputWords } from '@shared/timeline';
import { clipBrand, findKit, findTemplate } from '@shared/library';
import type { Clip, Job, ReframeKeyframe } from '@shared/types';
import { getSettings } from '../db';
import { ensureOllamaRunning, ffmpegPath, toolPath } from '../components';
import { Cancelled, type Sidecar } from '../engine/sidecar';
import { encodeArgs, probe, renderClip, run } from '../ffmpeg/render';
import { clipPath, recordExport, loadClip, loadProject, loadTranscript, projectDir, proxyPath, saveClip, saveProject } from '../projects';

export interface Ctx {
  signal: AbortSignal;
  progress: (p: number, detail?: string) => void;
  sidecar: Sidecar;
  preload: string;
  openWorker: (w: BrowserWindow) => void;
  emit: (channel: string, data: unknown) => void;
  setPayload: (payload: Job['payload']) => void;
}

/** Gera `final` só se ainda não existir; escreve num .part e renomeia (retomar nunca usa arquivo pela metade). */
async function once(final: string, make: (part: string) => Promise<void>) {
  if (existsSync(final)) return;
  const part = final.replace(/(\.\w+)$/, '.part$1');
  await make(part);
  renameSync(part, final);
}

function ytdlp(url: string, dir: string, ctx: Ctx): Promise<string> {
  const bin = toolPath('yt-dlp');
  if (!bin) throw new Error('Para colar links, instale o componente yt-dlp (Configurações → Componentes).');
  return new Promise((res, rej) => {
    const ff = ffmpegPath();
    const args = ['-f', 'bv*[height<=1080]+ba/b', '--merge-output-format', 'mp4', '--newline', '--no-playlist',
      '-o', join(dir, 'source.%(ext)s'), ...(ff !== 'ffmpeg' ? ['--ffmpeg-location', ff] : []), url];
    const p = spawn(bin, args, { windowsHide: true });
    let err = '';
    p.stdout.on('data', (d) => {
      const m = /\[download\]\s+([\d.]+)%/.exec(String(d));
      if (m) ctx.progress((Number(m[1]) / 100) * 0.5, 'baixando');
    });
    p.stderr.on('data', (d) => (err += d));
    ctx.signal.addEventListener('abort', () => p.kill());
    p.on('exit', (c) => {
      if (ctx.signal.aborted) return rej(new Cancelled());
      const f = readdirSync(dir).find((x) => x.startsWith('source.') && !x.endsWith('.part'));
      c === 0 && f ? res(join(dir, f)) : rej(new Error(`Não consegui baixar o link. ${err.trim().split('\n').pop() ?? ''}`));
    });
  });
}

export async function ingest(job: Job, ctx: Ctx) {
  const p = loadProject(job.projectId);
  const dir = projectDir(p.id);
  const hasUrl = !!p.source.url;
  if (hasUrl && !existsSync(p.source.path)) p.source.path = await ytdlp(p.source.url!, join(dir, 'source'), ctx);
  if (!existsSync(p.source.path)) throw new Error('Não encontrei o vídeo original. Ele foi movido ou apagado?');
  const info = probe(p.source.path);
  if (!info.hasAudio) throw new Error('Esse vídeo não tem áudio, então não dá para transcrever.');
  Object.assign(p.source, { duration: info.duration, width: info.width, height: info.height, fps: info.fps });
  const base = hasUrl ? 0.5 : 0;
  const thumb = join(dir, 'cache', 'thumb.jpg');
  await once(thumb, (part) => run(['-ss', String(info.duration * 0.1), '-i', p.source.path, '-frames:v', '1', '-vf', 'scale=480:-2', part], { signal: ctx.signal }).done);
  saveProject(p, { thumb });
  await once(join(dir, 'cache', 'audio.wav'), (part) =>
    run(['-i', p.source.path, '-vn', '-ac', '1', '-ar', '16000', part], { duration: info.duration, signal: ctx.signal,
      onProgress: (x) => ctx.progress(base + x * (1 - base) * 0.2, 'áudio') }).done);
  // proxy 540p com keyframe a cada 1 s: preview fluido na grade e no editor
  await once(proxyPath(p.id), (part) =>
    run(['-i', p.source.path, '-vf', 'scale=-2:540', '-g', String(Math.round(info.fps)), ...encodeArgs('proxy'), part], { duration: info.duration, signal: ctx.signal,
      onProgress: (x) => ctx.progress(base + (1 - base) * (0.2 + x * 0.8), 'proxy') }).done);
  p.status = 'processing';
  saveProject(p);
}

export async function transcribe(job: Job, ctx: Ctx) {
  const p = loadProject(job.projectId);
  await ctx.sidecar.stream('/transcribe', { dir: projectDir(p.id), model: getSettings().whisper, language: p.generation.language },
    (ev) => typeof ev.progress === 'number' && ctx.progress(ev.progress, `${ev.words} palavras`), ctx.signal);
}

export async function analyze(job: Job, ctx: Ctx) {
  const p = loadProject(job.projectId);
  if (!(await ensureOllamaRunning())) throw new Error('O Ollama não está rodando. Abra Configurações → Componentes.');
  await ctx.sidecar.stream('/analyze', { dir: projectDir(p.id), llm: getSettings().llm, settings: p.generation }, (ev) => {
    if (typeof ev.progress === 'number') ctx.progress(ev.progress, `${ev.window}/${ev.windows}`);
    if (Array.isArray(ev.clips) && ev.clips.length) ctx.emit('project:found', { projectId: p.id, clips: ev.clips });
  }, ctx.signal);
}

type Candidate = { in: number; out: number; title: string; description: string; hashtags: string[]; score: number; scores: Clip['scores']; reason: string; keywords: string[] };
const candidates = (id: string): (Candidate & { id: string })[] =>
  (JSON.parse(readFileSync(join(projectDir(id), 'analysis', 'candidates.json'), 'utf8')) as Candidate[])
    .map((c, k) => ({ ...c, id: `c${String(k + 1).padStart(2, '0')}` }));

export async function reframe(job: Job, ctx: Ctx) {
  const p = loadProject(job.projectId);
  await ctx.sidecar.stream('/reframe', { dir: projectDir(p.id), source: p.source.path, clips: candidates(p.id).map(({ id, in: a, out }) => ({ id, in: a, out })) },
    (ev) => typeof ev.progress === 'number' && ctx.progress(ev.progress, `${ev.clip}/${ev.clips}`), ctx.signal);
}

export async function finalize(job: Job) {
  const p = loadProject(job.projectId);
  const kfs = JSON.parse(readFileSync(join(projectDir(p.id), 'analysis', 'reframe.json'), 'utf8')) as Record<string, ReframeKeyframe[]>;
  const tpl = findTemplate(p.generation.captionTemplateId, getSettings().captionTemplates);
  const list = candidates(p.id);
  for (const c of list) {
    if (existsSync(clipPath(p.id, c.id))) continue; // edições do usuário nunca são sobrescritas
    // pessoa numa webcam no canto (rosto parado perto de um canto) → tela + webcam, com a legenda no meio
    const cam = detectCornerWebcam(kfs[c.id] ?? []);
    saveClip({
      id: c.id, projectId: p.id, title: c.title, description: c.description, hashtags: c.hashtags, score: c.score,
      scores: c.scores, reason: c.reason, favorite: false, in: c.in, out: c.out, cuts: [], wordEdits: {},
      layout: { aspect: p.generation.aspect, mode: cam ? 'screen-face' : 'single', smoothing: 0.5, ...(cam ? { webcam: { ...DEFAULT_WEBCAM, ...cam } } : {}) },
      reframe: kfs[c.id] ?? [], ...(p.generation.brandKitId ? { brandKitId: p.generation.brandKitId } : {}),
      caption: { ...tpl, keywords: c.keywords, ...(cam ? { positionY: 50 } : {}) }, tracks: [], audio: { speechGain: 1, normalizeLufs: -14, denoise: false },
    });
  }
  p.clipIds = list.map((c) => c.id);
  p.status = 'ready';
  saveProject(p);
  new Notification({ title: 'Cortaí', body: `${p.clipIds.length} cortes prontos. Bora postar?` }).show();
}

const safe = (s: string) => s.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'corte';

export async function render(job: Job, ctx: Ctx) {
  const clipId = job.payload!.clipId!;
  const p = loadProject(job.projectId);
  const clip = loadClip(p.id, clipId);
  const words = outputWords(loadTranscript(p.id).words, clip);
  const dir = join(getSettings().outputDir, safe(p.name));
  mkdirSync(dir, { recursive: true });
  const base = join(dir, `${String(p.clipIds.indexOf(clipId) + 1).padStart(2, '0')} - ${safe(clip.title)}`);
  const out = `${base}.mp4`;
  const part = `${base}.part.mp4`;
  const t0 = Date.now();
  const duration = outDuration(editList(clip));
  ctx.setPayload({ clipId, outPath: out });
  try {
    await renderClip({ source: p.source.path, src: p.source, clip, words, caption: clip.caption, out: part, brand: clipBrand(findKit(clip.brandKitId, getSettings().brandKits), clip.cta) }, ctx.preload, ctx.openWorker, (x) => {
      const secs = (Date.now() - t0) / 1000;
      ctx.progress(x, secs > 1 ? `${((x * duration) / secs).toFixed(1).replace('.', ',')}× tempo real` : undefined);
    }, ctx.signal);
  } catch (e) {
    rmSync(part, { force: true });
    throw e;
  }
  rmSync(out, { force: true });
  renameSync(part, out);
  recordExport(p.id, out);
  writeFileSync(`${base}.srt`, toSrt(words));
  writeFileSync(`${base}.txt`, `${clip.title}\n\n${clip.description}\n\n${clip.hashtags.map((h) => `#${h}`).join(' ')}\n`);
}

export const RUNNERS = { ingest, transcribe, analyze, reframe, finalize, render } as const;
