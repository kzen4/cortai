// Tempo do corte: usado pelo preview, pela timeline e pelo export (mesma conta nos três).
// Convenções: clip.in/out e clip.cuts em segundos do vídeo ORIGINAL; "rel" = segundos desde clip.in;
// "out" = segundos no vídeo exportado (sem os trechos cortados). Keyframes de enquadramento usam "rel".
import { ASPECT_SIZE } from './constants';
import type { AspectRatio, Clip, CopyEdits, EditItem, LayoutSettings, PieceFrame, ReframeKeyframe, Word } from './types';

export type Seg = [number, number];

/** Junta intervalos sobrepostos e ordena. */
export function mergeRanges(r: Seg[]): Seg[] {
  const s = [...r].filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  const out: Seg[] = [];
  for (const [a, b] of s) {
    const last = out[out.length - 1];
    if (last && a <= last[1] + 1e-3) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

/** Trechos mantidos, em tempo "rel". */
export function keptSegments(clip: Pick<Clip, 'in' | 'out' | 'cuts'>): Seg[] {
  const cuts = mergeRanges(clip.cuts.map(([a, b]): Seg => [Math.max(a, clip.in) - clip.in, Math.min(b, clip.out) - clip.in]));
  const out: Seg[] = [];
  let t = 0;
  for (const [a, b] of cuts) {
    if (a > t) out.push([t, a]);
    t = Math.max(t, b);
  }
  const end = clip.out - clip.in;
  if (end > t) out.push([t, end]);
  return out.filter(([a, b]) => b - a > 0.02);
}

export const outDuration = (segs: Seg[]) => segs.reduce((s, [a, b]) => s + b - a, 0);

/** rel → out (1ª vez que o instante aparece no vídeo final); null se ele não aparece. */
export function relToOut(segs: Seg[], rel: number): number | null {
  let acc = 0;
  for (const [a, b] of segs) {
    if (rel >= a && rel <= b) return acc + rel - a;
    acc += b - a;
  }
  return null;
}

/** out → rel. */
export function outToRel(segs: Seg[], out: number): number {
  let acc = 0;
  for (const [a, b] of segs) {
    if (out <= acc + (b - a)) return a + Math.max(0, out - acc);
    acc += b - a;
  }
  return segs.length ? segs[segs.length - 1][1] : 0;
}

/** Palavras que aparecem no vídeo final (na ordem da lista, cada pedaço com as correções da sua cópia), em tempo "out". */
export function outputWords(all: Word[], clip: EditClip & Pick<Clip, 'wordEdits' | 'reframe' | 'copies'>): Word[] {
  const res: Word[] = [];
  let acc = 0;
  for (const p of clipPieces(clip)) {
    const edits = forCopy(clip, p.g).wordEdits;
    for (const w of all) {
      const ws = w.start - clip.in, we = w.end - clip.in, mid = (ws + we) / 2;
      if (mid < p.a || mid > p.b) continue; // palavra fora deste pedaço (ou cortada)
      const text = edits[w.i] ?? w.text;
      if (!text) continue; // apagada só da legenda (o áudio fica)
      const st = acc + Math.max(ws, p.a) - p.a;
      res.push({ ...w, text, start: st, end: Math.max(st + 0.05, acc + Math.min(we, p.b) - p.a) });
    }
    acc += p.b - p.a;
  }
  return res;
}

/** Recorte do quadro original para o formato final (mesma conta do filtro crop do ffmpeg). */
export function cropRect(srcW: number, srcH: number, aspect: AspectRatio, cx: number, cy: number, zoom = 1) {
  const [W, H] = ASPECT_SIZE[aspect];
  const r = W / H;
  const z = Math.max(1, zoom);
  const wide = srcW / srcH > r;
  const sw = (wide ? srcH * r : srcW) / z;
  const sh = (wide ? srcH : srcW / r) / z;
  const clamp = (v: number, max: number) => Math.min(Math.max(0, v), max);
  return { sx: clamp(cx * srcW - sw / 2, srcW - sw), sy: clamp(cy * srcH - sh / 2, srcH - sh), sw, sh };
}

/** Tira [a, b] dos cortes (volta a manter esse trecho). */
export function subtractRange(cuts: Seg[], [a, b]: Seg): Seg[] {
  return mergeRanges(cuts).flatMap(([x, y]): Seg[] => {
    if (y <= a || x >= b) return [[x, y]];
    return ([[x, a], [b, y]] as Seg[]).filter(([p, q]) => q - p > 1e-3);
  });
}

// ---- Lista de edição -------------------------------------------------------------------------------
// clip.order = itens {a, b (segundos do original), g, muted} na ordem em que tocam. Cada item é um pedaço
// da timeline; g = cópia a que ele pertence (0 = original). Cada cópia tem as próprias correções de legenda
// e o próprio enquadramento (clip.copies[g]; a 0 usa clip.wordEdits/clip.reframe) e se comporta como um vídeo
// independente. Sem order (corte que nunca passou pelo editor novo): o corte inteiro dividido em splits, menos
// clip.cuts. O editor converte isso em order ao abrir (normalizeClip). in/out = limites da lista.
type EditClip = Pick<Clip, 'in' | 'out' | 'cuts' | 'order' | 'splits'>;
type CopyClip = Pick<Clip, 'wordEdits' | 'reframe' | 'copies'>;
type OrderClip = EditClip & CopyClip;
export interface Piece { a: number; b: number; entry: number; g: number; muted: boolean; frame?: PieceFrame; keys?: ReframeKeyframe[]; zoom?: number } // a, b em rel; entry = índice no order

/** Itens da lista (segundos do original). */
export function orderItems(clip: EditClip): EditItem[] {
  if (clip.order?.length) return clip.order;
  const pts = [clip.in, ...(clip.splits ?? []).filter((x) => x > clip.in + 0.05 && x < clip.out - 0.05).sort((a, b) => a - b), clip.out];
  const cuts = mergeRanges(clip.cuts);
  return pts.slice(1).flatMap((p, i) => cuts.reduce<Seg[]>((acc, c) => subtractRange(acc, c), [[pts[i], p]]))
    .filter(([x, y]) => y - x > 0.02).map(([a, b]) => ({ a, b, g: 0 }));
}

/** Pedaços do vídeo final, na ordem. */
export const clipPieces = (clip: EditClip): Piece[] =>
  orderItems(clip).map((it, entry) => ({ a: it.a - clip.in, b: it.b - clip.in, entry, g: it.g ?? 0, muted: !!it.muted, frame: it.frame, keys: it.keys, zoom: it.zoom }));

/** Lista de edição (rel): o que toca, na ordem. É a base do preview, das legendas e do export. */
export const editList = (clip: EditClip): Seg[] => clipPieces(clip).map((p): Seg => [p.a, p.b]);

/** Onde começa (tempo out) o pedaço idx. */
export const outStart = (list: Seg[], idx: number) => list.slice(0, idx).reduce((s, [a, b]) => s + b - a, 0);

/** Instante do vídeo final → pedaço e rel (na emenda, vale o pedaço seguinte). */
export function locateOut(list: Seg[], out: number): { idx: number; rel: number } {
  let acc = 0;
  for (let i = 0; i < list.length; i++) {
    const [a, b] = list[i];
    if (out < acc + (b - a) || i === list.length - 1) return { idx: i, rel: a + Math.min(b - a, Math.max(0, out - acc)) };
    acc += b - a;
  }
  return { idx: -1, rel: 0 };
}

/** O corte visto por uma cópia: as correções e o enquadramento dela no lugar dos do original. */
export function forCopy<C extends CopyClip>(clip: C, g: number): C {
  const d = g ? clip.copies?.[g] : undefined;
  return d ? { ...clip, wordEdits: d.wordEdits, reframe: d.reframe } : clip;
}

/** Aplica uma mudança de correções/enquadramento só na cópia g. */
export function inCopy<C extends CopyClip>(c: C, g: number, fn: (v: C) => C): C {
  const v = fn(forCopy(c, g));
  if (!g) return { ...c, wordEdits: v.wordEdits, reframe: v.reframe };
  return { ...c, copies: { ...c.copies, [g]: { wordEdits: v.wordEdits, reframe: v.reframe } } };
}

const copyData = (c: CopyClip, g: number): CopyEdits => {
  const v = forCopy(c, g);
  return { wordEdits: { ...v.wordEdits }, reframe: v.reframe.map((k) => ({ ...k })) };
};

/** Converte um corte antigo (in/out + cuts + splits) para a lista de edição; o editor chama ao abrir. */
export function normalizeClip<C extends OrderClip & Pick<Clip, 'muted'>>(c: C): C {
  if (c.order?.length) return c;
  const muted = mergeRanges(c.muted ?? []);
  const order = orderItems(c).map((it) => (muted.some(([x, y]) => x <= it.a + 0.01 && y >= it.b - 0.01) ? { ...it, muted: true } : it));
  return withOrder({ ...c, cuts: [], muted: undefined }, order);
}

/** Grava uma nova ordem: in/out viram os limites dela e os keyframes (rel) de todas as cópias seguem o mesmo instante do original. */
export function withOrder<C extends OrderClip>(c: C, order: EditItem[]): C {
  const o = order.filter((x) => x.b - x.a > 0.02);
  if (!o.length) return c;
  const nin = Math.min(...o.map((x) => x.a));
  const d = c.in - nin;
  const shift = (r: ReframeKeyframe[]) => (d ? r.map((k) => ({ ...k, t: k.t + d })) : r);
  const used = new Set(o.map((x) => x.g ?? 0));
  const copies = Object.fromEntries(Object.entries(c.copies ?? {}).filter(([g]) => used.has(Number(g))).map(([g, v]) => [g, { ...v, reframe: shift(v.reframe) }]));
  return { ...c, order: o, splits: undefined, in: nin, out: Math.max(...o.map((x) => x.b)), reframe: shift(c.reframe), copies };
}

const replaceEntry = (base: EditItem[], k: number, by: EditItem[]) => [...base.slice(0, k), ...by, ...base.slice(k + 1)];

/** Divide o pedaço p no instante rel (as duas metades continuam na mesma cópia). */
export function splitPiece<C extends OrderClip>(c: C, p: Piece, rel: number): C {
  const base = orderItems(c), it = base[p.entry], t = c.in + rel;
  return withOrder(c, replaceEntry(base, p.entry, [{ ...it, b: t }, { ...it, a: t }]));
}

/** Apaga trechos (rel) de pedaços específicos — só daquele pedaço — e junta o resto (ripple). */
export function removeFromPieces<C extends OrderClip>(c: C, parts: { entry: number; a: number; b: number }[]): C {
  const next = orderItems(c).flatMap((it, k) => parts.filter((p) => p.entry === k)
    .reduce<Seg[]>((acc, p) => subtractRange(acc, [c.in + p.a, c.in + p.b]), [[it.a, it.b]])
    .map(([a, b]) => ({ ...it, a, b })));
  return withOrder(c, next);
}

/** Pedaços copiados (Ctrl+C / duplicar): os itens e as edições das cópias de onde vieram. */
export interface Clipboard { items: EditItem[]; data: Record<number, CopyEdits> }
export function copyPieces(c: OrderClip, ps: Piece[]): Clipboard {
  return {
    items: ps.map((p) => ({ a: c.in + p.a, b: c.in + p.b, g: p.g, ...(p.muted ? { muted: true } : {}), ...(p.frame ? { frame: p.frame } : {}), ...(p.keys ? { keys: p.keys } : {}), ...(p.zoom ? { zoom: p.zoom } : {}) })),
    data: Object.fromEntries([...new Set(ps.map((p) => p.g))].map((g) => [g, copyData(c, g)])),
  };
}

/** Cola no pedaço p, no instante rel: viram cópias novas (começam iguais e depois são independentes). */
export function insertAt<C extends OrderClip>(c: C, clip: Clipboard, p: Piece, rel: number): C {
  if (!clip.items.length) return c;
  const base = orderItems(c), it = base[p.entry], t = c.in + rel;
  let next = Math.max(0, ...base.map((x) => x.g ?? 0), ...Object.keys(c.copies ?? {}).map(Number)) + 1;
  const map = new Map<number, number>();
  const copies = { ...c.copies };
  for (const g of Object.keys(clip.data).map(Number)) { map.set(g, next); copies[next] = clip.data[g]; next++; }
  const items = clip.items.map((x) => ({ ...x, g: map.get(x.g ?? 0) ?? 0 }));
  return withOrder({ ...c, copies }, replaceEntry(base, p.entry, [{ ...it, b: t }, ...items, { ...it, a: t }]));
}

/** Duplica os pedaços (na ordem) logo depois do último deles. */
export function duplicatePieces<C extends OrderClip>(c: C, ps: Piece[]): C {
  const last = ps[ps.length - 1];
  return last ? insertAt(c, copyPieces(c, ps), last, last.b) : c;
}

/** Recoloca o que a timeline apagou entre dois pedaços seguidos da mesma cópia. */
export function restoreGap<C extends OrderClip>(c: C, prev: Piece, next: Piece): C {
  const base = orderItems(c), it = base[prev.entry];
  return withOrder(c, [...base.slice(0, prev.entry + 1), { ...it, a: c.in + prev.b, b: c.in + next.a }, ...base.slice(prev.entry + 1)]);
}

/** O instante t (segundos do original) aparece na cópia g? */
export const inCopyAt = (c: EditClip, g: number, t: number) => orderItems(c).some((it) => (it.g ?? 0) === g && t >= it.a && t <= it.b);

/** Transcrição: corta [a, b] (segundos do original) só da cópia g. */
export function cutWords<C extends OrderClip>(c: C, g: number, [a, b]: Seg): C {
  return withOrder(c, orderItems(c).flatMap((it) => ((it.g ?? 0) !== g ? [it] : subtractRange([[it.a, it.b]], [a, b]).map(([x, y]) => ({ ...it, a: x, b: y })))));
}

/** Transcrição: recoloca [a, b] na cópia g, no lugar certo (depois do último pedaço dela que termina antes). */
export function restoreWords<C extends OrderClip>(c: C, g: number, [a, b]: Seg): C {
  let base = orderItems(c);
  const mine = mergeRanges(base.filter((it) => (it.g ?? 0) === g).map((it): Seg => [it.a, it.b]));
  for (const [x, y] of mine.reduce<Seg[]>((acc, r) => subtractRange(acc, r), [[a, b]])) {
    const k = base.reduce((best, it, i) => ((it.g ?? 0) === g && it.b <= x + 0.01 ? i : best), -1);
    const at = k >= 0 ? k + 1 : Math.max(0, base.findIndex((it) => (it.g ?? 0) === g));
    // funde com os vizinhos colados da mesma cópia (ali era um corte, não uma divisão)
    const prev = base[at - 1], next = base[at];
    const glue = (it: EditItem | undefined, edge: number) => !!it && (it.g ?? 0) === g && !it.muted && Math.abs(edge) < 0.01;
    const lp = glue(prev, (prev?.b ?? 0) - x), ln = glue(next, (next?.a ?? 0) - y);
    const merged: EditItem = { a: lp ? prev.a : x, b: ln ? next.b : y, g };
    base = [...base.slice(0, lp ? at - 1 : at), merged, ...base.slice(ln ? at + 1 : at)];
  }
  return withOrder(c, base);
}

/** Muda a entrada (segundos do original): sem order, mexe no in; com order, no início do 1º pedaço. */
export function setIn<C extends OrderClip>(c: C, v: number): C {
  if (!c.order?.length) {
    const nin = Math.max(0, Math.min(v, c.out - 1)), d = c.in - nin;
    return { ...c, in: nin, reframe: d ? c.reframe.map((k) => ({ ...k, t: k.t + d })) : c.reframe };
  }
  const o = c.order.map((x) => ({ ...x }));
  o[0].a = Math.max(0, Math.min(v, o[0].b - 0.5));
  return withOrder(c, o);
}

/** Muda a saída: sem order, o out; com order, o fim do último pedaço. */
export function setOut<C extends OrderClip>(c: C, v: number): C {
  if (!c.order?.length) return { ...c, out: Math.max(v, c.in + 1) };
  const o = c.order.map((x) => ({ ...x }));
  o[o.length - 1].b = Math.max(v, o[o.length - 1].a + 0.5);
  return withOrder(c, o);
}

// ---- Enquadramento por pedaço ------------------------------------------------------------------------
/** Posições prontas do enquadramento de um pedaço (x do centro da janela; y no meio). */
export const FRAME_PRESETS = { left: { x: 0, y: 0.5 }, center: { x: 0.5, y: 0.5 }, right: { x: 1, y: 0.5 } } as const;
export type FramePreset = keyof typeof FRAME_PRESETS;
export const presetOf = (f?: PieceFrame, keys?: ReframeKeyframe[]): FramePreset | 'auto' | 'custom' =>
  keys?.length ? 'custom' : !f ? 'auto' : (Object.entries(FRAME_PRESETS).find(([, v]) => v.x === f.x && v.y === f.y)?.[0] as FramePreset) ?? 'custom';

type PieceView = { g: number; frame?: PieceFrame; keys?: ReframeKeyframe[]; zoom?: number };
/**
 * O corte visto por um pedaço (keyframes em rel): o movimento próprio dele (keys), senão o fixo (frame), senão os
 * keyframes da cópia. Zoom: o do pedaço, senão o da cópia. Fonte única para prévia, Resultados e export.
 */
export function framingFor<C extends CopyClip & Pick<Clip, 'in'>>(clip: C, p: PieceView): C {
  const v = forCopy(clip, p.g);
  const zoom = p.zoom ?? v.reframe[0]?.zoom ?? 1;
  const reframe = p.keys?.length ? p.keys.map((k) => ({ ...k, t: k.t - clip.in, zoom }))
    : p.frame ? [{ t: 0, x: p.frame.x, y: p.frame.y, zoom, ease: 'linear' as const, auto: false }]
    : p.zoom ? v.reframe.map((k) => ({ ...k, zoom })) : v.reframe;
  return { ...v, reframe };
}

const mapEntries = <C extends OrderClip>(c: C, entries: number[], fn: (it: EditItem) => EditItem): C =>
  ({ ...c, order: c.order?.map((it, k) => (entries.includes(k) ? fn(it) : it)) });

/** Fixa numa posição pronta (ou volta para "seguir rosto", com undefined) os pedaços indicados; apaga o movimento próprio. */
export const setPieceFrame = <C extends OrderClip>(c: C, entries: number[], frame: PieceFrame | undefined): C =>
  mapEntries(c, entries, ({ keys: _k, ...it }) => ({ ...it, frame }));

/** Zoom próprio dos pedaços indicados (os outros mantêm o deles). */
export const setPieceZoom = <C extends OrderClip>(c: C, entries: number[], zoom: number): C =>
  mapEntries(c, entries, (it) => ({ ...it, zoom }));

/**
 * "Ajustar enquadramento" num pedaço: r = keyframes (rel) vistos pelo pedaço depois do arrasto/fixar/centralizar.
 * Viram o movimento próprio SÓ desse pedaço (arrastar em instantes diferentes = movimento; fixar = 1 ponto).
 * Keyframes todos automáticos (= "Seguir rosto") devolvem o pedaço à cópia. Pedaços vizinhos nunca mudam.
 */
export function framePieceFrom<C extends OrderClip>(c: C, entry: number, r: ReframeKeyframe[]): C {
  if (r.every((k) => k.auto)) return setPieceFrame(c, [entry], undefined);
  return mapEntries(c, [entry], ({ frame: _f, ...it }) => ({ ...it, keys: r.map(({ zoom: _z, ...k }) => ({ ...k, zoom: 1, t: k.t + c.in })) }));
}

// ---- Tela + webcam --------------------------------------------------------------------------------------
// Formato final dividido ao meio: em cima o vídeo inteiro (encaixado), embaixo a janela da webcam ampliada.
export const DEFAULT_WEBCAM = { x: 0.85, y: 0.8, w: 0.28 };

/** Janela da webcam no original, com a proporção da metade de baixo do formato final (mesma conta no preview e no ffmpeg). */
export function webcamRect(srcW: number, srcH: number, aspect: AspectRatio, cam: LayoutSettings['webcam'] = DEFAULT_WEBCAM) {
  const [W, H] = ASPECT_SIZE[aspect];
  const r = W / (H - Math.round(H / 2)); // largura/altura da metade de baixo
  let sw = Math.min(srcW, Math.max(0.05, cam.w) * srcW), sh = sw / r;
  if (sh > srcH) { sh = srcH; sw = sh * r; }
  const clamp = (v: number, max: number) => Math.min(Math.max(0, v), max);
  return { sx: clamp(cam.x * srcW - sw / 2, srcW - sw), sy: clamp(cam.y * srcH - sh / 2, srcH - sh), sw, sh };
}

/** Pessoa numa webcam no canto? Rosto parado (pouca variação) e perto de um canto do quadro → centro da webcam. */
export function detectCornerWebcam(kfs: Pick<ReframeKeyframe, 'x' | 'y'>[]): { x: number; y: number } | null {
  if (kfs.length < 1) return null;
  const med = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)];
  const xs = kfs.map((k) => k.x), ys = kfs.map((k) => k.y);
  const x = med(xs), y = med(ys);
  const spread = Math.max(...xs) - Math.min(...xs) + Math.max(...ys) - Math.min(...ys);
  // ponytail: heurística simples (canto + parado); se errar, o usuário troca o modo no painel Layout
  return (x < 0.3 || x > 0.7) && (y < 0.35 || y > 0.65) && spread < 0.15 ? { x, y } : null;
}
