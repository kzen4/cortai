import { expect, it } from 'vitest';
import { clipWords, toSrt } from './clipWords';

const words = [0, 1, 2, 3, 4].map((i) => ({ i, text: `w${i}`, start: 10 + i, end: 10.8 + i, conf: 1 }));

it('recorta, desloca e aplica correções', () => {
  const w = clipWords(words, { in: 11, out: 13.9, wordEdits: { 2: 'corrigida' } });
  expect(w.map((x) => x.text)).toEqual(['w1', 'corrigida', 'w3']);
  expect(w[0].start).toBe(0);
});

it('gera srt válido', () => {
  expect(toSrt(clipWords(words, { in: 10, out: 15, wordEdits: {} }), 2)).toContain('00:00:00,000 --> 00:00:01,800\nw0 w1');
});
