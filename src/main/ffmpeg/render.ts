import { BrowserWindow, ipcMain } from 'electron';
import { execFileSync, spawn } from 'node:child_process';
import type { Writable } from 'node:stream';
import type { BrandKit, CaptionStyle, Word } from '@shared/types';
import { ASPECT_SIZE } from '@shared/constants';
import { ffmpegPath, ffprobePath } from '../components';
import { Cancelled } from '../engine/sidecar';
import { audioMeasureGraph, buildGraph, type Loudness } from './graph';

type ClipLike = Parameters<typeof buildGraph>[1];

let encoderCache: string | null = null;
/** Encoder H.264 por GPU quando existir; senão os de software disponíveis na build (LGPL não tem x264). */
export function pickEncoder(): string {
  if (encoderCache) return encoderCache;
  for (const enc of ['h264_nvenc', 'h264_videotoolbox', 'h264_qsv', 'h264_amf', 'h264_mf', 'libopenh264', 'libx264']) {
    try {
      execFileSync(ffmpegPath(), ['-hide_banner', '-f', 'lavfi', '-i', 'color=black:s=256x256:d=0.1', '-c:v', enc, '-f', 'null', '-'], { stdio: 'ignore', windowsHide: true });
      return (encoderCache = enc);
    } catch { /* tenta o próximo */ }
  }
  throw new Error('Nenhum encoder H.264 disponível no FFmpeg.');
}

export const encodeArgs = (quality: 'high' | 'proxy' = 'high') => {
  const enc = pickEncoder();
  const hi = quality === 'high';
  const q: Record<string, string[]> = {
    h264_nvenc: ['-preset', 'p4', '-cq', hi ? '21' : '28'],
    libx264: ['-preset', 'veryfast', '-crf', hi ? '20' : '28'],
  };
  return ['-c:v', enc, ...(q[enc] ?? ['-b:v', hi ? '10M' : '2M']), '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart'];
};

export interface Probe { duration: number; width: number; height: number; fps: number; hasAudio: boolean }
export function probe(path: string): Probe {
  const out = JSON.parse(execFileSync(ffprobePath(), ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', path], { windowsHide: true }).toString());
  const v = out.streams.find((s: { codec_type: string }) => s.codec_type === 'video');
  if (!v) throw new Error('Esse arquivo não tem vídeo.');
  const [n, d] = String(v.avg_frame_rate || v.r_frame_rate || '30/1').split('/').map(Number);
  // vídeo de celular gravado em pé: largura/altura vêm trocadas pela rotação
  const rot = Math.abs(Number(v.tags?.rotate ?? v.side_data_list?.find((s: { rotation?: number }) => s.rotation !== undefined)?.rotation ?? 0));
  const [width, height] = rot === 90 || rot === 270 ? [v.height, v.width] : [v.width, v.height];
  return {
    duration: Number(out.format.duration), width, height, fps: d ? Math.round((n / d) * 100) / 100 : 30,
    hasAudio: out.streams.some((s: { codec_type: string }) => s.codec_type === 'audio'),
  };
}

/** Roda o ffmpeg reportando progresso (0–1) a partir do `-progress`. Abortar mata o processo. */
export function run(args: string[], o: { duration?: number; onProgress?: (p: number, speed?: string) => void; signal?: AbortSignal; stdin?: boolean } = {}) {
  const p = spawn(ffmpegPath(), ['-hide_banner', '-loglevel', 'error', '-nostats', '-progress', 'pipe:1', '-y', ...args], { windowsHide: true });
  let err = '';
  p.stderr.on('data', (d) => (err += d));
  p.stdout.on('data', (d) => {
    const s = String(d);
    const t = /out_time_us=(\d+)/.exec(s);
    const sp = /speed=\s*([\d.]+x)/.exec(s);
    if (t && o.duration) o.onProgress?.(Math.min(1, Number(t[1]) / 1e6 / o.duration), sp?.[1]);
  });
  const onAbort = () => p.kill();
  o.signal?.addEventListener('abort', onAbort);
  const done = new Promise<void>((res, rej) =>
    p.on('exit', (c) => {
      o.signal?.removeEventListener('abort', onAbort);
      if (o.signal?.aborted) rej(new Cancelled());
      else if (c === 0) res();
      else rej(new Error(err.trim().split('\n').slice(-3).join(' ') || `ffmpeg saiu com ${c}`));
    }));
  const stdin = p.stdin as Writable;
  const write = (buf: Buffer) => new Promise<void>((res) => (stdin.write(buf) ? res() : stdin.once('drain', () => res())));
  return { done, write, end: () => { stdin.end(); return done; } };
}

// ---------- overlay: janela oculta roda o MESMO drawOverlay do preview, quadro a quadro ----------
export interface OverlayJob { width: number; height: number; fps: number; duration: number; words: Word[]; caption: CaptionStyle; brand?: BrandKit }
let current: { job: OverlayJob; sink: ReturnType<typeof run>; last: Buffer | null; frames: number; onFrame: (n: number) => void; finish: () => void } | null = null;
ipcMain.handle('render:job', () => current?.job);
ipcMain.handle('render:frame', (_e, buf: Uint8Array | null) => {
  if (!current) return;
  if (buf) current.last = Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength);
  current.onFrame(++current.frames);
  return current.last && current.sink.write(current.last);
});
ipcMain.handle('render:end', () => current?.finish());

/** 1ª passada do loudnorm: mede o volume só do áudio do corte (rápido). Falhou? Usa a passada única. */
function measureLoudness(spec: RenderSpec): Promise<Loudness | undefined> {
  const g = audioMeasureGraph(spec.clip);
  if (!g) return Promise.resolve(undefined);
  return new Promise((res) => {
    const p = spawn(ffmpegPath(), ['-hide_banner', '-nostats', '-ss', String(spec.clip.in), '-t', String(spec.clip.out - spec.clip.in), '-i', spec.source,
      '-vn', '-filter_complex', g, '-map', '[a]', '-f', 'null', '-'], { windowsHide: true });
    let err = '';
    p.stderr.on('data', (d) => (err += d));
    p.on('exit', () => {
      const m = /\{[^{}]*"input_i"[^{}]*\}/.exec(err);
      try { res(m ? JSON.parse(m[0]) : undefined); } catch { res(undefined); }
    });
  });
}

export interface RenderSpec {
  source: string; src: { width: number; height: number }; clip: ClipLike;
  /** palavras já no tempo do vídeo final (outputWords) */
  words: Word[]; caption: CaptionStyle; out: string; fps?: number; brand?: BrandKit;
}

/** Exporta um corte. `openWorker` carrega o renderer em modo #export numa janela oculta. */
export async function renderClip(spec: RenderSpec, preload: string, openWorker: (w: BrowserWindow) => void, onProgress: (p: number) => void, signal?: AbortSignal) {
  if (current) throw new Error('Já existe um export em andamento.');
  const fps = spec.fps ?? 30;
  const [W, H] = ASPECT_SIZE[spec.clip.layout.aspect];
  const { graph, duration } = buildGraph(spec.src, spec.clip, fps, await measureLoudness(spec));
  const total = Math.round(duration * fps);
  const sink = run([
    '-ss', String(spec.clip.in), '-t', String(spec.clip.out - spec.clip.in), '-i', spec.source,
    '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(fps), '-i', 'pipe:0',
    '-filter_complex', graph, '-map', '[v]', '-map', '[a]', '-t', String(duration), ...encodeArgs('high'), spec.out,
  ], { signal });
  const win = new BrowserWindow({ show: false, width: 400, height: 400, webPreferences: { preload, sandbox: true, contextIsolation: true, backgroundThrottling: false } });
  const onAbort = () => win.destroy();
  signal?.addEventListener('abort', onAbort);
  try {
    await new Promise<void>((finish, fail) => {
      current = { job: { width: W, height: H, fps, duration, words: spec.words, caption: spec.caption, brand: spec.brand }, sink, last: null, frames: 0, onFrame: (n) => onProgress(n / total), finish };
      sink.done.catch(fail); // ffmpeg morreu antes de terminar os quadros
      win.webContents.on('render-process-gone', () => fail(new Error('O desenho das legendas parou.')));
      openWorker(win);
    });
    await sink.end();
  } finally {
    signal?.removeEventListener('abort', onAbort);
    current = null;
    if (!win.isDestroyed()) win.destroy();
  }
}
