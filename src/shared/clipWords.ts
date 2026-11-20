import type { Clip, Word } from './types';

/** Palavras do corte com tempo relativo ao início do corte e correções de texto aplicadas. */
export function clipWords(all: Word[], clip: Pick<Clip, 'in' | 'out' | 'wordEdits'>): Word[] {
  return all
    .filter((w) => w.start >= clip.in - 0.05 && w.end <= clip.out + 0.05)
    .map((w) => ({ ...w, text: clip.wordEdits[w.i] ?? w.text, start: Math.max(0, w.start - clip.in), end: w.end - clip.in }));
}

const srtTime = (t: number) => {
  const ms = Math.round(t * 1000);
  const p = (n: number, l = 2) => String(n).padStart(l, '0');
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};

/** Legenda .srt em blocos de até `perLine` palavras. */
export function toSrt(words: Word[], perLine = 6): string {
  const out: string[] = [];
  for (let i = 0, n = 1; i < words.length; i += perLine, n++) {
    const g = words.slice(i, i + perLine);
    out.push(`${n}\n${srtTime(g[0].start)} --> ${srtTime(g[g.length - 1].end)}\n${g.map((w) => w.text).join(' ')}\n`);
  }
  return out.join('\n');
}
