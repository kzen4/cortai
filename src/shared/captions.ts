import type { Word } from './types';

export interface CaptionChunk { words: Word[]; start: number; end: number }

const BREAK = /[.,:;!?…]$/;
const PAUSE = 0.8; // s: pausa maior que isso começa outra linha (legenda não fica parada no silêncio)

/** Agrupa palavras em linhas de até `perLine`, quebrando também em pontuação e em pausas. */
export function chunkWords(words: Word[], perLine: number): CaptionChunk[] {
  const out: CaptionChunk[] = [];
  let cur: Word[] = [];
  words.forEach((w, k) => {
    cur.push(w);
    const next = words[k + 1];
    if (cur.length >= perLine || BREAK.test(w.text) || (next && next.start - w.end > PAUSE)) { out.push(mk(cur)); cur = []; }
  });
  if (cur.length) out.push(mk(cur));
  // a linha fica na tela até a próxima começar, se a pausa for curta
  for (let k = 0; k < out.length - 1; k++) {
    const gap = out[k + 1].start - out[k].end;
    out[k].end = gap < 0.6 ? out[k + 1].start : out[k].end + 0.3;
  }
  if (out.length) out[out.length - 1].end += 0.3;
  return out;
}
const mk = (ws: Word[]): CaptionChunk => ({ words: ws, start: ws[0].start, end: ws[ws.length - 1].end });

/** Linha visível no tempo t e índice (dentro da linha) da palavra ativa. */
export function captionAt(chunks: CaptionChunk[], t: number): { chunk: CaptionChunk; active: number } | null {
  const chunk = chunks.find((c) => t >= c.start && t < c.end);
  if (!chunk) return null;
  let active = 0;
  chunk.words.forEach((w, k) => { if (t >= w.start) active = k; });
  return { chunk, active };
}

/** Animação "pop" da palavra ativa: 0.7 → 1.0 em 180 ms, curva p^0.5 (igual ao \t(...,0.5,...) do ASS). */
export const POP_MS = 180;
export function popScale(sinceStart: number): number {
  const p = Math.min(1, Math.max(0, sinceStart / (POP_MS / 1000)));
  return 0.7 + 0.3 * Math.sqrt(p);
}

export const displayText = (text: string, uppercase: boolean) =>
  uppercase ? text.toLocaleUpperCase('pt-BR') : text;
