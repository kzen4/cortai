import { execFile, spawn, spawnSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statfsSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { homedir, totalmem, tmpdir } from 'node:os';
import { join } from 'node:path';
import { shell } from 'electron';
import type { ComponentId, ComponentState, Profile, SetupInfo } from '@shared/types';
import { getSettings } from '../db';
import { componentsDir, engineDir, engineVenv, exe } from '../paths';
import type { Sidecar } from '../engine/sidecar';
import { download, fetchSha } from './download';

export const OLLAMA_URL = 'http://127.0.0.1:11434';
const WIN = process.platform === 'win32';
const MAC = process.platform === 'darwin';
const binDir = () => join(componentsDir(), 'bin');

// ---------- caminhos das ferramentas: baixada pelo app > instalada no sistema ----------
const sysCache = new Map<string, boolean>();
export function toolPath(name: 'ffmpeg' | 'ffprobe' | 'yt-dlp' | 'uv'): string | null {
  const local = join(binDir(), exe(name));
  if (existsSync(local)) return local;
  if (!sysCache.has(name)) sysCache.set(name, spawnSync(name, [name.startsWith('ff') ? '-version' : '--version'], { windowsHide: true }).status === 0);
  return sysCache.get(name) ? name : null;
}
export const ffmpegPath = () => toolPath('ffmpeg') ?? 'ffmpeg';
export const ffprobePath = () => toolPath('ffprobe') ?? 'ffprobe';

// ---------- origem dos arquivos por sistema ----------
// ponytail: só Windows x64 foi testado; macOS (Apple Silicon) segue as mesmas regras, Linux entra na V1.
const GH = 'https://github.com';
const FFMPEG: { url: string; sums?: string }[] = WIN
  ? [{ url: `${GH}/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-lgpl.zip`, sums: `${GH}/BtbN/FFmpeg-Builds/releases/download/latest/checksums.sha256` }]
  : [{ url: 'https://evermeet.cx/ffmpeg/getrelease/zip' }, { url: 'https://evermeet.cx/ffmpeg/getrelease/ffprobe/zip' }];
const UV_FILE = WIN ? 'uv-x86_64-pc-windows-msvc.zip' : 'uv-aarch64-apple-darwin.tar.gz';
const YTDLP_FILE = WIN ? 'yt-dlp.exe' : 'yt-dlp_macos';

function modelsJson(): { profiles: Record<Profile, { whisper: string; llm: string }>; whisper: Record<string, { repo: string; sizeMB: number }>; llm: Record<string, { sizeMB: number }> } {
  return JSON.parse(readFileSync(join(engineDir(), 'models.json'), 'utf8'));
}

function whisperInstalled(name: string): boolean {
  const repo = modelsJson().whisper[name]?.repo ?? name;
  const hub = process.env.HF_HUB_CACHE || join(process.env.HF_HOME || join(homedir(), '.cache', 'huggingface'), 'hub');
  const snaps = join(hub, `models--${repo.replace('/', '--')}`, 'snapshots');
  return existsSync(snaps) && readdirSync(snaps).some((s) => existsSync(join(snaps, s, 'model.bin')));
}

async function ollamaTags(): Promise<{ name: string; size: number }[] | null> {
  try {
    const r = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(1500) });
    return ((await r.json()) as { models: { name: string; size: number }[] }).models;
  } catch { return null; }
}
/** Manifesto do modelo em ~/.ollama/models (existe mesmo com o Ollama parado). */
function llmManifest(name: string): string {
  const [model, tag = 'latest'] = name.split(':');
  const full = model.includes('/') ? model : `library/${model}`;
  const root = process.env.OLLAMA_MODELS || join(homedir(), '.ollama', 'models');
  return join(root, 'manifests', 'registry.ollama.ai', ...full.split('/'), tag);
}
const llmOnDisk = (name: string) => existsSync(llmManifest(name));
/** Tamanho do modelo baixado (soma das camadas do manifesto), em MB; 0 se não achar. */
function llmDiskMB(name: string): number {
  try {
    const m = JSON.parse(readFileSync(llmManifest(name), 'utf8')) as { layers?: { size: number }[] };
    return Math.round((m.layers ?? []).reduce((s, l) => s + l.size, 0) / 1e6);
  } catch { return 0; }
}
const sameModel = (a: string, b: string) => a.replace(/:latest$/, '') === b.replace(/:latest$/, '');

function ollamaBinary(): string | null {
  const c = WIN ? [join(process.env.LOCALAPPDATA ?? '', 'Programs', 'Ollama', 'ollama.exe')] : ['/Applications/Ollama.app/Contents/Resources/ollama', '/usr/local/bin/ollama'];
  return c.find(existsSync) ?? (spawnSync('ollama', ['--version'], { windowsHide: true }).status === 0 ? 'ollama' : null);
}

let ollamaProc: ReturnType<typeof spawn> | null = null;
/** Ollama instalado mas parado: sobe o `ollama serve` escondido (e o encerra ao sair, se fomos nós que subimos). */
export async function ensureOllamaRunning(): Promise<boolean> {
  if (await ollamaTags()) return true;
  const bin = ollamaBinary();
  if (!bin) return false;
  ollamaProc = spawn(bin, ['serve'], { windowsHide: true, detached: false, stdio: 'ignore' });
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (await ollamaTags()) return true;
  }
  return false;
}
export function stopOllama() { ollamaProc?.kill(); }

const lockHash = () => createHash('sha256').update(readFileSync(join(engineDir(), 'uv.lock'))).digest('hex');
const engineMarker = () => join(engineVenv(), '.cortai-ok');
const engineReady = () => existsSync(engineMarker()) && readFileSync(engineMarker(), 'utf8') === lockHash();

// ---------- gerenciador ----------
const ORDER: ComponentId[] = ['ffmpeg', 'ytdlp', 'engine', 'whisper', 'ollama', 'llm'];

export class Components {
  private states = new Map<ComponentId, ComponentState>();
  private abort: AbortController | null = null;
  private running = false;

  constructor(private sidecar: Sidecar, private onChange: (s: ComponentState[]) => void) {}

  list = () => ORDER.map((id) => this.states.get(id)!).filter(Boolean);
  private set(id: ComponentId, patch: Partial<ComponentState>) {
    this.states.set(id, { ...this.states.get(id)!, ...patch });
    this.onChange(this.list());
  }

  async refresh(): Promise<ComponentState[]> {
    const s = getSettings();
    const m = modelsJson();
    const tags = await ollamaTags();
    const keep = (id: ComponentId) => this.states.get(id)?.state;
    const base = (id: ComponentId, sizeMB: number, ready: boolean, detail?: string): ComponentState =>
      ['downloading', 'installing'].includes(keep(id) ?? '') ? this.states.get(id)! : { id, sizeMB, state: ready ? 'ready' : keep(id) === 'paused' ? 'paused' : 'missing', progress: ready ? 1 : (this.states.get(id)?.progress ?? 0), detail };
    const ff = toolPath('ffmpeg');
    this.states.set('ffmpeg', base('ffmpeg', 179, !!ff && !!toolPath('ffprobe'), ff === 'ffmpeg' ? 'system' : undefined));
    const yt = toolPath('yt-dlp');
    this.states.set('ytdlp', base('ytdlp', 23, !!yt, yt === 'yt-dlp' ? 'system' : undefined));
    this.states.set('engine', base('engine', MAC ? 400 : 2400, engineReady()));
    this.states.set('whisper', base('whisper', m.whisper[s.whisper]?.sizeMB ?? 1500, whisperInstalled(s.whisper), s.whisper));
    this.states.set('ollama', base('ollama', 1100, !!tags || !!ollamaBinary(), tags ? 'running' : undefined));
    const llmTag = tags?.find((t) => sameModel(t.name, s.llm));
    this.states.set('llm', base('llm', m.llm[s.llm]?.sizeMB ?? (Math.round((llmTag?.size ?? 0) / 1e6) || llmDiskMB(s.llm)), !!llmTag || llmOnDisk(s.llm), s.llm));
    const out = this.list();
    this.onChange(out);
    return out;
  }

  async setupInfo(): Promise<SetupInfo> {
    const m = modelsJson();
    const tags = (await ollamaTags()) ?? [];
    const gpuLine = WIN ? spawnSync('nvidia-smi', ['--query-gpu=name,memory.total', '--format=csv,noheader,nounits'], { windowsHide: true }).stdout?.toString().trim() : '';
    const [gpuName, vram] = gpuLine ? gpuLine.split(',').map((x) => x.trim()) : [MAC && process.arch === 'arm64' ? 'Apple Silicon' : null, '0'];
    const ramGB = Math.round(totalmem() / 1e9);
    const fs = statfsSync(homedir());
    const vramGB = Number(vram) / 1024;
    const recommended: Profile = gpuName && (vramGB >= 11 || (MAC && ramGB >= 32)) && ramGB >= 24 ? 'max' : gpuName && (vramGB >= 5.5 || MAC) && ramGB >= 12 ? 'balanced' : 'light';
    const llmNames = [...new Set([...Object.keys(m.llm), ...tags.map((t) => t.name)])];
    return {
      gpu: gpuName ?? null, ramGB, diskFreeGB: Math.round((fs.bavail * fs.bsize) / 1e9), recommended,
      whisperOptions: Object.entries(m.whisper).map(([name, v]) => ({ name, sizeMB: v.sizeMB, installed: whisperInstalled(name) })),
      llmOptions: llmNames.map((name) => {
        const t = tags.find((x) => sameModel(x.name, name));
        return { name, sizeMB: m.llm[name]?.sizeMB ?? (Math.round((t?.size ?? 0) / 1e6) || llmDiskMB(name)), installed: !!t || llmOnDisk(name) };
      }),
    };
  }

  profileModels = (p: Profile) => modelsJson().profiles[p];

  pause() { this.abort?.abort(); }

  /** Instala tudo o que falta, em ordem. Pausar aborta o atual; chamar de novo retoma (downloads continuam do .part). */
  async installAll() {
    if (this.running) return;
    this.running = true;
    this.abort = new AbortController();
    const signal = this.abort.signal;
    try {
      await this.refresh();
      for (const id of ORDER) {
        if (signal.aborted) break;
        if (this.states.get(id)?.state === 'ready') continue;
        try {
          this.set(id, { state: 'downloading', progress: 0, detail: undefined });
          await this.install(id, signal);
          this.set(id, { state: 'ready', progress: 1 });
        } catch (e) {
          if (signal.aborted) { this.set(id, { state: 'paused' }); break; }
          this.set(id, { state: 'error', detail: (e as Error).message });
        }
      }
    } finally {
      this.running = false;
      await this.refresh();
    }
  }

  private progress = (id: ComponentId) => {
    let last = 0;
    return (got: number, total: number) => {
      if (Date.now() - last < 250) return;
      last = Date.now();
      this.set(id, { progress: total ? got / total : 0 });
    };
  };

  private async install(id: ComponentId, signal: AbortSignal) {
    const tmp = join(tmpdir(), 'cortai-dl');
    mkdirSync(tmp, { recursive: true });
    mkdirSync(binDir(), { recursive: true });
    const s = getSettings();

    if (id === 'ffmpeg') {
      for (const [k, a] of FFMPEG.entries()) {
        const file = join(tmp, `ffmpeg-${k}.zip`);
        const sha = a.sums ? await fetchSha(a.sums, a.url.split('/').pop()!) : undefined;
        await download(a.url, file, { signal, sha256: sha, onProgress: this.progress(id) });
        extractBinaries(file, ['ffmpeg', 'ffprobe']);
      }
      sysCache.clear();
    }

    if (id === 'ytdlp') {
      const url = `${GH}/yt-dlp/yt-dlp/releases/latest/download/${YTDLP_FILE}`;
      const sha = await fetchSha(`${GH}/yt-dlp/yt-dlp/releases/latest/download/SHA2-256SUMS`, YTDLP_FILE);
      const dest = join(binDir(), exe('yt-dlp'));
      await download(url, dest, { signal, sha256: sha, onProgress: this.progress(id) });
      if (!WIN) chmodSync(dest, 0o755);
    }

    if (id === 'engine') {
      if (!toolPath('uv')) {
        const file = join(tmp, UV_FILE);
        const base = `${GH}/astral-sh/uv/releases/latest/download/${UV_FILE}`;
        await download(base, file, { signal, sha256: await fetchSha(`${base}.sha256`, UV_FILE), onProgress: this.progress(id) });
        extractBinaries(file, ['uv']);
        sysCache.clear();
      }
      this.set(id, { state: 'installing', progress: 0 });
      // uv baixa o Python 3.11 e as bibliotecas (CUDA incluso) para dentro da pasta do app
      await runWithLines(toolPath('uv')!, ['sync', '--frozen', '--no-dev', '--directory', engineDir()], {
        UV_PYTHON_INSTALL_DIR: join(componentsDir(), 'python'), UV_PYTHON_PREFERENCE: 'managed', UV_PROJECT_ENVIRONMENT: engineVenv(),
      }, signal, (line) => this.set(id, { detail: line.slice(0, 80) }));
      writeFileSync(engineMarker(), lockHash());
      await this.sidecar.restart();
    }

    if (id === 'whisper') {
      if (!(await this.sidecar.waitReady())) throw new Error('O motor de IA não iniciou.');
      await this.sidecar.stream('/models/whisper', { name: s.whisper }, (ev) => typeof ev.progress === 'number' && this.set(id, { progress: ev.progress }), signal);
    }

    if (id === 'ollama') {
      if (!ollamaBinary()) {
        if (!WIN) { shell.openExternal('https://ollama.com/download'); throw new Error('Instale o Ollama pela página que abrimos e volte aqui.'); }
        // ponytail: sem hash publicado pelo Ollama; o instalador é assinado (Authenticode) e vem por HTTPS
        const file = join(tmp, 'OllamaSetup.exe');
        await download(`${GH}/ollama/ollama/releases/latest/download/OllamaSetup.exe`, file, { signal, onProgress: this.progress(id) });
        this.set(id, { state: 'installing' });
        await runWithLines(file, ['/VERYSILENT', '/NORESTART', '/SUPPRESSMSGBOXES'], {}, signal, () => {});
      }
      if (!(await ensureOllamaRunning())) throw new Error('Não consegui iniciar o Ollama.');
    }

    if (id === 'llm') {
      if (!(await ensureOllamaRunning())) throw new Error('O Ollama não está rodando.');
      const res = await fetch(`${OLLAMA_URL}/api/pull`, { method: 'POST', body: JSON.stringify({ model: s.llm, stream: true }), signal });
      const layers = new Map<string, [number, number]>();
      for await (const ev of ndjson(res)) {
        if (ev.error) throw new Error(String(ev.error));
        if (ev.digest && ev.total) layers.set(String(ev.digest), [Number(ev.completed ?? 0), Number(ev.total)]);
        const [got, total] = [...layers.values()].reduce((a, b) => [a[0] + b[0], a[1] + b[1]], [0, 0]);
        this.progress(id)(got, total);
      }
    }
  }
}

// tar do sistema (bsdtar) abre .zip e .tar.gz no Windows 10+ e no macOS. Caminho fixo no Windows:
// um GNU tar no PATH (ex.: Git Bash) não abre .zip.
export const TAR = WIN ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar';

/** Extrai o arquivo e copia só os executáveis pedidos para components/bin. */
function extractBinaries(archive: string, names: string[]) {
  const out = archive + '-x';
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const r = spawnSync(TAR, ['-xf', archive, '-C', out], { windowsHide: true });
  if (r.status !== 0) throw new Error(`Não consegui extrair ${archive}: ${r.stderr}`);
  const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
  const files = walk(out);
  for (const n of names) {
    const f = files.find((p) => p.endsWith(`/${exe(n)}`) || p.endsWith(`\\${exe(n)}`));
    if (!f) throw new Error(`${exe(n)} não veio no pacote`);
    cpSync(f, join(binDir(), exe(n)));
    if (!WIN) chmodSync(join(binDir(), exe(n)), 0o755);
  }
  rmSync(out, { recursive: true, force: true });
  rmSync(archive, { force: true });
}

function runWithLines(cmd: string, args: string[], env: Record<string, string>, signal: AbortSignal, onLine: (l: string) => void): Promise<void> {
  return new Promise((res, rej) => {
    const p = execFile(cmd, args, { env: { ...process.env, ...env }, windowsHide: true, maxBuffer: 64 * 1024 * 1024, signal }, (err) => (err ? rej(err) : res()));
    const feed = (d: Buffer) => String(d).split(/\r?\n/).filter(Boolean).forEach(onLine);
    p.stdout?.on('data', feed);
    p.stderr?.on('data', feed);
  });
}

export async function* ndjson(res: Response): AsyncGenerator<Record<string, unknown>> {
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const dec = new TextDecoder();
  let buf = '';
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    buf += dec.decode(chunk, { stream: true });
    let i: number;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (line) yield JSON.parse(line);
    }
  }
  if (buf.trim()) yield JSON.parse(buf);
}
