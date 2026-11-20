// Monta o filtergraph do export a partir do clipe. Espelha src/renderer/overlay/composite.ts (preview).
import { ASPECT_SIZE } from '@shared/constants';
import { clipPieces, cropRect, editList, forCopy, outDuration } from '@shared/timeline';
import type { Clip } from '@shared/types';

const f = (n: number) => (Math.round(n * 10000) / 10000).toString();
const even = (n: number) => Math.max(2, Math.floor(n / 2) * 2);

/** Interpolação linear por trechos em função de t, no formato de expressão do ffmpeg (vírgulas escapadas). */
export function lerpExpr(kfs: { t: number; v: number }[]): string {
  let e = f(kfs[kfs.length - 1].v);
  for (let k = kfs.length - 2; k >= 0; k--) {
    const a = kfs[k], b = kfs[k + 1];
    const seg = b.t > a.t ? `${f(a.v)}+(${f(b.v - a.v)})*(t-(${f(a.t)}))/${f(b.t - a.t)}` : f(b.v);
    e = `if(lt(t\\,${f(b.t)})\\,${seg}\\,${e})`;
  }
  return e;
}

type ClipLike = Pick<Clip, 'in' | 'out' | 'cuts' | 'order' | 'splits' | 'layout' | 'reframe' | 'audio' | 'wordEdits' | 'copies'>;
/** atrim de um pedaço (rel); pedaço silenciado na timeline sai mudo. */
const segAudio = (a: number, b: number, muted: boolean) =>
  `atrim=start=${f(a)}:end=${f(b)},asetpts=PTS-STARTPTS` + (muted ? ',volume=0' : '');

/** Medição da 1ª passada do loudnorm (valores que o ffmpeg imprime em JSON). */
export interface Loudness { input_i: string; input_tp: string; input_lra: string; input_thresh: string; target_offset: string }

const loudnorm = (target: number, m?: Loudness) => `loudnorm=I=${target}:TP=-1.5:LRA=11` + (m
  ? `:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`
  : ':print_format=json');

/** Só o áudio dos trechos mantidos (para medir o volume na 1ª passada). Saída: [a]. */
export function audioMeasureGraph(clip: ClipLike): string | null {
  if (!clip.audio.normalizeLufs) return null;
  const segs = editList(clip);
  const n = segs.length;
  const aIn = n > 1 ? segs.map((_, i) => `[sa${i}]`) : ['[0:a]'];
  const parts = n > 1 ? [`[0:a]asplit=${n}${aIn.join('')}`] : [];
  clipPieces(clip).forEach((p, i) => parts.push(`${aIn[i]}${segAudio(p.a, p.b, p.muted)}[a${i}]`));
  const gain = clip.audio.speechGain !== 1 ? `volume=${f(clip.audio.speechGain)},` : '';
  parts.push(`${segs.map((_, i) => `[a${i}]`).join('')}concat=n=${n}:v=0:a=1,${gain}${loudnorm(clip.audio.normalizeLufs)}[a]`);
  return parts.join(';');
}

/** Vídeo base de um trecho que começa em `offset` (tempo "rel"): recorte/fundo + escala para o formato final. */
export function layoutFilter(src: { width: number; height: number }, clip: ClipLike, offset: number, fps: number): string {
  const [W, H] = ASPECT_SIZE[clip.layout.aspect];
  const tail = `setsar=1,fps=${fps}`;
  const fitW = src.width / src.height >= W / H; // o vídeo inteiro cabe pela largura
  const fit = fitW ? `scale=${W}:-2` : `scale=-2:${H}`;
  if (clip.layout.mode === 'blur-bg') {
    const sigma = clip.layout.bgBlur ?? 30;
    return `split[fa][fb];[fa]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},gblur=sigma=${sigma}[bg];[fb]${fit}[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,${tail}`;
  }
  if (clip.layout.mode === 'color-bg') {
    return `${fit},pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=${(clip.layout.bgColor ?? '#0B0B0F').replace('#', '0x')},${tail}`;
  }
  // 'single' (e, por ora, 'split'/'screen-face'): janela que acompanha o rosto
  const kfs = clip.reframe.length ? clip.reframe : [{ t: 0, x: 0.5, y: 0.5, zoom: 1, ease: 'smooth' as const, auto: true }];
  const thin = kfs.length > 80 ? kfs.filter((_, i) => i % Math.ceil(kfs.length / 80) === 0) : kfs;
  const r = cropRect(src.width, src.height, clip.layout.aspect, 0.5, 0.5, kfs[0].zoom);
  const sw = even(r.sw), sh = even(r.sh);
  const ex = lerpExpr(thin.map((k) => ({ t: k.t - offset, v: k.x })));
  const ey = lerpExpr(thin.map((k) => ({ t: k.t - offset, v: k.y })));
  return `crop=${sw}:${sh}:x=max(0\\,min(iw-ow\\,(${ex})*iw-ow/2)):y=max(0\\,min(ih-oh\\,(${ey})*ih-oh/2)),scale=${W}:${H},${tail}`;
}

/**
 * Filtergraph completo. Entrada 0 = original já posicionado em clip.in (-ss), entrada 1 = overlay RGBA.
 * Saídas: [v] e [a].
 */
export function buildGraph(src: { width: number; height: number }, clip: ClipLike, fps: number, measured?: Loudness): { graph: string; duration: number } {
  const segs = editList(clip);
  const n = segs.length;
  const parts: string[] = [];
  const vIn = n > 1 ? segs.map((_, i) => `[sv${i}]`) : ['[0:v]'];
  const aIn = n > 1 ? segs.map((_, i) => `[sa${i}]`) : ['[0:a]'];
  if (n > 1) {
    parts.push(`[0:v]split=${n}${vIn.join('')}`);
    parts.push(`[0:a]asplit=${n}${aIn.join('')}`);
  }
  clipPieces(clip).forEach((p, i) => { // cada pedaço com o enquadramento da sua cópia
    parts.push(`${vIn[i]}trim=start=${f(p.a)}:end=${f(p.b)},setpts=PTS-STARTPTS,${layoutFilter(src, forCopy(clip, p.g), p.a, fps)}[v${i}]`);
    parts.push(`${aIn[i]}${segAudio(p.a, p.b, p.muted)}[a${i}]`);
  });
  parts.push(`${segs.map((_, i) => `[v${i}][a${i}]`).join('')}concat=n=${n}:v=1:a=1[bv][ba0]`);
  const gain = clip.audio.speechGain !== 1 ? `volume=${f(clip.audio.speechGain)},` : '';
  // 2ª passada (linear, exata) quando há medição; senão o modo dinâmico de uma passada
  const norm = clip.audio.normalizeLufs ? `${loudnorm(clip.audio.normalizeLufs, measured).replace(':print_format=json', '')},` : '';
  parts.push(`[ba0]${gain}${norm}aresample=48000[a]`);
  parts.push(`[bv][1:v]overlay=format=auto:shortest=1[v]`);
  return { graph: parts.join(';'), duration: outDuration(segs) };
}
