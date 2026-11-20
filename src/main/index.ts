import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { execFile } from 'node:child_process';
import { userInfo } from 'node:os';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import type { Clip, EngineStatus, GenerationSettings, Settings, SourceInfo, SystemInfo } from '@shared/types';
import { Components, stopOllama, toolPath } from './components';
import { getSettings, setSettings } from './db';
import { Sidecar } from './engine/sidecar';
import { probe } from './ffmpeg/render';
import { Queue } from './jobs/queue';
import { ensureSample, runPoc } from './poc';
import { handleMediaScheme, registerMediaScheme } from './protocol';
import * as projects from './projects';
import { initUpdater } from './updater';

const PRELOAD = join(__dirname, '../preload/index.js');
// ícone da janela/barra de tarefas: sem ele, em dev (electron.exe) aparece o do Electron. Instalado vem de resources/icons.
const ICON = join(app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'resources'), 'icons', process.platform === 'win32' ? 'icon.ico' : 'icon.png');
if (process.platform === 'win32') app.setAppUserModelId('br.lab.cortai'); // mesmo appId do instalador: agrupa janela, atalho e notificações
registerMediaScheme();

let mainWin: BrowserWindow | null = null;
const send = (ch: string, data: unknown) => mainWin?.webContents.send(ch, data);

const sidecar = new Sidecar((s: EngineStatus) => send('engine:status', s));
const components = new Components(sidecar, (list) => send('components:changed', list));

/** Carrega o renderer (dev: servidor do Vite; build: arquivo). `hash` escolhe o modo (ex.: export). */
function loadRenderer(win: BrowserWindow, hash = '') {
  const dev = process.env.ELECTRON_RENDERER_URL;
  if (dev) win.loadURL(dev + (hash ? `#${hash}` : ''));
  else win.loadFile(join(__dirname, '../renderer/index.html'), { hash });
}
const queue = new Queue({ sidecar, preload: PRELOAD, openWorker: (w) => loadRenderer(w, 'export'), emit: send });

function createWindow() {
  const mac = process.platform === 'darwin';
  mainWin = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1280, minHeight: 760,
    backgroundColor: '#0B0B0F', show: false, icon: ICON,
    titleBarStyle: 'hidden',
    // botões nativos da janela: à direita no Windows/Linux, semáforo à esquerda no macOS
    ...(mac ? { trafficLightPosition: { x: 14, y: 13 } } : { titleBarOverlay: { color: '#0B0B0F', symbolColor: '#9A9AAB', height: 40 } }),
    webPreferences: { preload: PRELOAD, contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  mainWin.once('ready-to-show', () => mainWin?.show());
  mainWin.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  loadRenderer(mainWin);
}

function detectGpu(): Promise<string | null> {
  if (process.platform === 'darwin') return Promise.resolve(process.arch === 'arm64' ? 'Apple Silicon' : null);
  return new Promise((res) =>
    execFile('nvidia-smi', ['--query-gpu=name', '--format=csv,noheader'], { windowsHide: true }, (err, out) =>
      res(err ? null : out.split('\n')[0].trim() || null)));
}

const h = (ch: string, fn: (...a: never[]) => unknown) => ipcMain.handle(ch, (_e, ...a) => fn(...(a as never[])));

// sistema / configurações
h('system:info', async (): Promise<SystemInfo> => ({ userName: userInfo().username.split(/[\s.]/)[0], gpu: await detectGpu(), platform: process.platform }));
h('engine:status', () => sidecar.status);
h('settings:get', () => getSettings());
h('settings:set', async (patch: Partial<Settings>) => { setSettings(patch); await components.refresh(); return getSettings(); });

// componentes (assistente de 1ª execução)
h('components:list', () => components.refresh());
h('components:setupInfo', () => components.setupInfo());
h('components:profile', (p: Settings['profile']) => components.profileModels(p));
h('components:installAll', () => { void components.installAll(); });
h('components:pause', () => components.pause());

// importação
h('dialog:openVideos', async () => {
  const r = await dialog.showOpenDialog(mainWin!, { properties: ['openFile', 'multiSelections'], filters: [{ name: 'Vídeos', extensions: ['mp4', 'mov', 'mkv', 'webm', 'm4v'] }] });
  return r.canceled ? [] : r.filePaths;
});
h('source:probe', (path: string): SourceInfo => ({ path, name: basename(path).replace(/\.[^.]+$/, ''), ...probe(path) }));
h('source:probeUrl', (url: string) => new Promise<SourceInfo>((res, rej) => {
  const bin = toolPath('yt-dlp');
  if (!bin) return rej(new Error('Instale o componente yt-dlp para usar links.'));
  execFile(bin, ['-J', '--no-playlist', url], { windowsHide: true, maxBuffer: 64 * 1024 * 1024 }, (err, out) => {
    if (err) return rej(new Error('Não consegui ler esse link. Confira se ele está público.'));
    const j = JSON.parse(out);
    res({ url, name: j.title ?? url, duration: j.duration ?? 0, width: j.width ?? 1920, height: j.height ?? 1080, fps: j.fps ?? 30, thumb: j.thumbnail });
  });
}));

// projetos e cortes
h('projects:list', () => projects.listProjects());
h('projects:create', (src: SourceInfo, gen: GenerationSettings) => {
  const p = projects.createProject(src, gen);
  setSettings({ lastGeneration: gen });
  queue.enqueuePipeline(p.id);
  send('projects:changed', null);
  return p.id;
});
h('projects:get', (id: string) => {
  const project = projects.loadProject(id);
  return { project, clips: project.clipIds.length ? projects.loadClips(id) : [], proxy: projects.proxyPath(id) };
});
h('projects:found', (id: string) => projects.foundClips(id));
h('projects:transcript', (id: string) => projects.loadTranscript(id));
h('projects:cancel', (id: string) => { queue.cancelProject(id); send('projects:changed', null); });
h('projects:resume', (id: string) => { queue.enqueuePipeline(id); send('projects:changed', null); });
h('projects:delete', (id: string) => { queue.cancelProject(id); projects.deleteProject(id); send('projects:changed', null); });
h('clips:save', (c: Clip) => projects.saveClip(c));
h('clips:get', (projectId: string, clipId: string) => projects.loadClip(projectId, clipId));
h('clips:autoReframe', (projectId: string, clipId: string) => projects.autoReframe(projectId, clipId));
h('projects:peaks', (id: string) => projects.peaks(id));
h('clips:delete', (projectId: string, clipId: string) => projects.deleteClip(projectId, clipId));
h('clips:duplicate', (projectId: string, clipId: string) => projects.duplicateClip(projectId, clipId));
h('clips:export', (projectId: string, clipIds: string[]) => queue.enqueueRender(projectId, clipIds));

// fila
h('jobs:list', () => queue.list());
h('jobs:cancel', (id: number) => queue.cancelJob(id));
h('jobs:clear', () => queue.clearFinished());

// templates e brand kits: arquivos viram data URL (o renderer não lê o disco)
const MIME: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff2': 'font/woff2', '.woff': 'font/woff' };
h('brand:pickFile', async (kind: 'image' | 'font') => {
  const ext = kind === 'image' ? ['png', 'jpg', 'jpeg', 'webp', 'svg'] : ['ttf', 'otf', 'woff2', 'woff'];
  const r = await dialog.showOpenDialog(mainWin!, { properties: ['openFile'], filters: [{ name: kind === 'image' ? 'Imagens' : 'Fontes', extensions: ext }] });
  if (r.canceled) return null;
  const p = r.filePaths[0];
  if (statSync(p).size > (kind === 'image' ? 2 : 5) * 1024 * 1024) return { error: 'tooBig' as const };
  return { name: basename(p).replace(/\.[^.]+$/, ''), data: `data:${MIME[extname(p).toLowerCase()]};base64,${readFileSync(p).toString('base64')}` };
});
h('brand:saveFile', async (name: string, text: string) => {
  const r = await dialog.showSaveDialog(mainWin!, { defaultPath: `${name.replace(/[<>:"/\\|?*]/g, '')}.cortai-template`, filters: [{ name: 'Template do Cortaí', extensions: ['cortai-template'] }] });
  if (r.canceled || !r.filePath) return false;
  writeFileSync(r.filePath, text);
  return true;
});
h('brand:openFile', async () => {
  const r = await dialog.showOpenDialog(mainWin!, { properties: ['openFile'], filters: [{ name: 'Template do Cortaí', extensions: ['cortai-template', 'json'] }] });
  if (r.canceled || statSync(r.filePaths[0]).size > 30 * 1024 * 1024) return null;
  return readFileSync(r.filePaths[0], 'utf8');
});

// sistema de arquivos (só o que o renderer precisa)
h('shell:showItem', (p: string) => shell.showItemInFolder(p));
h('shell:openPath', (p: string) => shell.openPath(p));
h('shell:openOutput', () => shell.openPath(getSettings().outputDir));

// Lab de render (Fase 0)
h('poc:sample', () => ensureSample());
h('poc:run', (method: 'canvas' | 'ass') => runPoc(method, PRELOAD, (w) => loadRenderer(w, 'export')));

app.whenReady().then(async () => {
  handleMediaScheme();
  createWindow();
  initUpdater(send);
  await sidecar.start();
  await components.refresh();
  queue.tick(); // retoma o que ficou na fila quando o app fechou
});

app.on('before-quit', () => { queue.shutdown(); sidecar.stop(); stopOllama(); });
app.on('window-all-closed', () => app.quit());
