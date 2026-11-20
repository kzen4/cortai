// Fonte da verdade: seção 10 do planejamento (docs/SPEC.md). Mudou aqui? Atualize o SPEC.
export type AspectRatio = '9:16' | '1:1' | '4:5' | '16:9';

export interface Word { i: number; text: string; start: number; end: number;
  conf: number; speaker?: string; filler?: boolean }

export interface Transcript { language: string; words: Word[];
  sentences: { start: number; end: number; wordStart: number; wordEnd: number }[] }

export interface Project {
  id: string; name: string; createdAt: string; updatedAt: string;
  source: { path: string; url?: string; duration: number; width: number;
            height: number; fps: number; proxyPath?: string };
  generation: GenerationSettings;
  status: 'importing' | 'processing' | 'ready' | 'error';
  clipIds: string[];
}

export interface GenerationSettings {
  language: 'auto' | string; targetDuration: 'auto' | [number, number];
  maxClips: 'auto' | number; aspect: AspectRatio; captionTemplateId: string;
  range?: [number, number]; prompt?: string; requiredKeywords?: string[];
  brandKitId?: string;
}

export interface Clip {
  id: string; projectId: string; title: string; description: string;
  hashtags: string[]; score: number;
  scores: { hook: number; value: number; standalone: number; ending: number };
  reason: string; favorite: boolean;
  in: number; out: number;            // segundos no vídeo original
  cuts: [number, number][];           // trechos removidos (edição por texto)
  order?: EditItem[];                 // lista de edição: pedaços na ordem em que tocam (pode repetir trechos)
  copies?: Record<number, CopyEdits>; // edições próprias de cada cópia g >= 1 (a 0 usa wordEdits/reframe)
  splits?: number[];                  // legado: divisões antes de existir order
  muted?: [number, number][];         // legado: trechos silenciados (hoje é EditItem.muted)
  bookmarks?: number[];               // marcadores da timeline (segundos no original; só visual)
  wordEdits: Record<number, string>;  // índice da palavra -> texto corrigido
  layout: LayoutSettings; reframe: ReframeKeyframe[];
  caption: CaptionStyle; tracks: Track[]; audio: AudioSettings;
}

export interface EditItem { a: number; b: number; g: number; muted?: boolean } // a, b = segundos do original; g = cópia
export interface CopyEdits { wordEdits: Record<number, string>; reframe: ReframeKeyframe[] }
export interface ReframeKeyframe { t: number; x: number; y: number;
  zoom: number; ease: 'linear' | 'smooth'; auto: boolean }

export interface LayoutSettings { aspect: AspectRatio;
  mode: 'single' | 'split' | 'blur-bg' | 'color-bg' | 'screen-face';
  smoothing: number; bgColor?: string; bgBlur?: number }

export interface CaptionStyle {
  templateId: string; font: string; size: number; color: string;
  highlightColor: string; strokeColor: string; strokeWidth: number;
  shadow?: { color: string; blur: number; x: number; y: number };
  box?: { color: string; radius: number; padding: number };
  positionY: number; wordsPerLine: number; uppercase: boolean;
  animation: 'none' | 'pop' | 'bounce' | 'fade' | 'typewriter' | 'highlight';
  emojis: boolean; keywords: string[];
}

export type Track =
  | { id: string; kind: 'card'; items: CardItem[] }
  | { id: string; kind: 'effect'; items: EffectItem[] }
  | { id: string; kind: 'overlay'; items: OverlayItem[] }
  | { id: string; kind: 'music' | 'sfx'; items: AudioItem[] };

export interface CardItem { id: string; preset: string; start: number;
  end: number; props: Record<string, unknown>;  // texto, cores, posição...
  enter: AnimationSpec; exit: AnimationSpec }
export interface AnimationSpec { type: string; duration: number; easing: string }
export interface EffectItem { id: string; type: 'zoom' | 'shake' | 'flash';
  start: number; end: number; intensity: number }
export interface OverlayItem { id: string; src: string; start: number;
  end: number; x: number; y: number; w: number; h: number; opacity: number }
export interface AudioItem { id: string; src: string; start: number;
  end: number; volume: number; fadeIn: number; fadeOut: number; duck?: boolean }
export interface AudioSettings { speechGain: number; normalizeLufs?: number;
  denoise: boolean }

// --- IPC (contrato do window.cortai) ---
export type EngineStatus = 'starting' | 'ok' | 'down';
export type UpdateState = { state: 'idle' } | { state: 'downloading'; version: string; percent: number } | { state: 'ready'; version: string };
export interface SystemInfo { userName: string; gpu: string | null; platform: string }
export interface PocResult { method: 'canvas' | 'ass'; outPath: string; seconds: number; encoder: string }

// --- Fase 1: componentes, fila, projetos ---
export type ComponentId = 'ffmpeg' | 'ytdlp' | 'engine' | 'whisper' | 'ollama' | 'llm';
export interface ComponentState {
  id: ComponentId; sizeMB: number;
  state: 'missing' | 'downloading' | 'paused' | 'installing' | 'ready' | 'error';
  progress: number;            // 0–1
  detail?: string;             // "do sistema", versão, modelo, erro…
}
export type Profile = 'light' | 'balanced' | 'max';
export interface Settings {
  setupDone: boolean; profile: Profile; whisper: string; llm: string;
  outputDir: string; lastGeneration?: GenerationSettings;
}
export interface SetupInfo {
  gpu: string | null; ramGB: number; diskFreeGB: number; recommended: Profile;
  whisperOptions: { name: string; sizeMB: number; installed: boolean }[];
  llmOptions: { name: string; sizeMB: number; installed: boolean }[];
}
export type JobKind = 'ingest' | 'transcribe' | 'analyze' | 'reframe' | 'finalize' | 'render';
export type JobStatus = 'queued' | 'running' | 'done' | 'error' | 'cancelled';
export interface Job {
  id: number; projectId: string; kind: JobKind; status: JobStatus; progress: number;
  detail?: string; error?: string; payload?: { clipId?: string; outPath?: string; speed?: string };
  startedAt?: string; updatedAt: string;
}
export interface ProjectSummary {
  id: string; name: string; status: Project['status'] | 'cancelled'; thumb?: string;
  clipCount: number; duration: number; createdAt: string; error?: string;
}
export interface SourceInfo { path?: string; url?: string; name: string; duration: number; width: number; height: number; fps: number; thumb?: string }
export interface FoundClip { title: string; score: number }
