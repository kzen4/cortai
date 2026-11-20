import { describe, expect, it } from 'vitest';
import { captionAt, chunkWords, popScale } from './captions';
import { POC_WORDS } from './poc';

describe('legendas', () => {
  const chunks = chunkWords(POC_WORDS, 3);
  it('nenhuma linha passa do limite e todas as palavras aparecem', () => {
    expect(chunks.every((c) => c.words.length <= 3)).toBe(true);
    expect(chunks.flatMap((c) => c.words).length).toBe(POC_WORDS.length);
  });
  it('quebra na pontuação', () => {
    for (const c of chunks) c.words.slice(0, -1).forEach((w) => expect(w.text).not.toMatch(/[.,:!?]$/));
  });
  it('pausa longa quebra a linha e a legenda some no silêncio', () => {
    const w = [
      { i: 0, text: 'A', start: 17, end: 17.2, conf: 1 },
      { i: 1, text: 'gente', start: 51, end: 51.3, conf: 1 },
      { i: 2, text: 'vai', start: 51.3, end: 51.6, conf: 1 },
    ];
    const c = chunkWords(w, 3);
    expect(c.map((x) => x.words.length)).toEqual([1, 2]);
    expect(captionAt(c, 30)).toBeNull();
  });
  it('palavra ativa acompanha o tempo', () => {
    const w = POC_WORDS[10];
    const hit = captionAt(chunks, w.start + 0.01)!;
    expect(hit.chunk.words[hit.active]).toBe(w);
  });
  it('pop vai de 0.7 a 1', () => {
    expect(popScale(0)).toBeCloseTo(0.7);
    expect(popScale(1)).toBe(1);
  });
});
