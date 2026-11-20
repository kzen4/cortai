import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type {
  BrandKit, CaptionStyle, Clip, ComponentState, EngineStatus, FoundClip, GenerationSettings, Job, PocResult, Profile, Project,
  ProjectSummary, ReframeKeyframe, Settings, SetupInfo, SourceInfo, SystemInfo, Transcript, UpdateState, Word,
} from '@shared/types';

const inv = <T>(ch: string, ...a: unknown[]) => ipcRenderer.invoke(ch, ...a) as Promise<T>;
/** Assina um evento do Main; devolve a função para cancelar. */
const on = <T>(ch: string) => (cb: (data: T) => void) => {
  const h = (_: unknown, d: T) => cb(d);
  ipcRenderer.on(ch, h);
  return () => { ipcRenderer.off(ch, h); };
};

/** API única e tipada exposta ao renderer (seção 9.2). */
const api = {
  system: { info: () => inv<SystemInfo>('system:info') },
  engine: { status: () => inv<EngineStatus>('engine:status'), onStatus: on<EngineStatus>('engine:status') },
  updates: { state: () => inv<UpdateState>('updates:state'), onState: on<UpdateState>('updates:state'), install: () => inv<void>('updates:install') },
  settings: {
    get: () => inv<Settings>('settings:get'),
    set: (patch: Partial<Settings>) => inv<Settings>('settings:set', patch),
  },
  components: {
    list: () => inv<ComponentState[]>('components:list'),
    setupInfo: () => inv<SetupInfo>('components:setupInfo'),
    profile: (p: Profile) => inv<{ whisper: string; llm: string }>('components:profile', p),
    installAll: () => inv<void>('components:installAll'),
    pause: () => inv<void>('components:pause'),
    onChange: on<ComponentState[]>('components:changed'),
  },
  dialog: { openVideos: () => inv<string[]>('dialog:openVideos') },
  source: {
    probe: (path: string) => inv<SourceInfo>('source:probe', path),
    probeUrl: (url: string) => inv<SourceInfo>('source:probeUrl', url),
  },
  projects: {
    list: () => inv<ProjectSummary[]>('projects:list'),
    create: (src: SourceInfo, gen: GenerationSettings) => inv<string>('projects:create', src, gen),
    get: (id: string) => inv<{ project: Project; clips: Clip[]; proxy: string }>('projects:get', id),
    found: (id: string) => inv<FoundClip[]>('projects:found', id),
    transcript: (id: string) => inv<Transcript>('projects:transcript', id),
    peaks: (id: string) => inv<number[]>('projects:peaks', id),
    cancel: (id: string) => inv<void>('projects:cancel', id),
    resume: (id: string) => inv<void>('projects:resume', id),
    remove: (id: string) => inv<void>('projects:delete', id),
    onChange: on<null>('projects:changed'),
    onFound: on<{ projectId: string; clips: FoundClip[] }>('project:found'),
  },
  clips: {
    save: (c: Clip) => inv<void>('clips:save', c),
    get: (projectId: string, clipId: string) => inv<Clip>('clips:get', projectId, clipId),
    autoReframe: (projectId: string, clipId: string) => inv<ReframeKeyframe[]>('clips:autoReframe', projectId, clipId),
    remove: (projectId: string, clipId: string) => inv<void>('clips:delete', projectId, clipId),
    duplicate: (projectId: string, clipId: string) => inv<Clip>('clips:duplicate', projectId, clipId),
    export: (projectId: string, clipIds: string[]) => inv<void>('clips:export', projectId, clipIds),
  },
  jobs: {
    list: () => inv<Job[]>('jobs:list'),
    cancel: (id: number) => inv<void>('jobs:cancel', id),
    clear: () => inv<void>('jobs:clear'),
    onChange: on<Job[]>('jobs:changed'),
  },
  brand: {
    pickFile: (kind: 'image' | 'font') => inv<{ name: string; data: string } | { error: 'tooBig' } | null>('brand:pickFile', kind),
    saveFile: (name: string, text: string) => inv<boolean>('brand:saveFile', name, text),
    openFile: () => inv<string | null>('brand:openFile'),
  },
  shell: {
    showItem: (p: string) => inv<void>('shell:showItem', p),
    openPath: (p: string) => inv<string>('shell:openPath', p),
    openOutput: () => inv<string>('shell:openOutput'),
  },
  /** Janela oculta do export (#export). null em frame = repetir o quadro anterior. */
  render: {
    job: () => inv<{ width: number; height: number; fps: number; duration: number; words: Word[]; caption: CaptionStyle; brand?: BrandKit } | undefined>('render:job'),
    frame: (buf: Uint8ClampedArray | null) => inv<void>('render:frame', buf),
    end: () => inv<void>('render:end'),
  },
  poc: {
    sample: () => inv<string>('poc:sample'),
    run: (method: 'canvas' | 'ass') => inv<PocResult>('poc:run', method),
  },
  /** Caminho real de um arquivo solto na janela (File.path não existe mais no Electron). */
  pathForFile: (f: File) => webUtils.getPathForFile(f),
  /** URL que o <video>/<img> pode usar sem dar acesso ao disco. */
  mediaUrl: (path: string) => `cortai-media://local/${encodeURIComponent(path)}`,
};

contextBridge.exposeInMainWorld('cortai', api);
export type CortaiApi = typeof api;
