import { expect, it } from 'vitest';
import { push, redo, undo, type History } from './history';

it('desfaz, refaz e junta arrastes do mesmo controle', () => {
  let h: History<number> = { past: [], present: 0, future: [] };
  h = push(h, 1);
  h = push(h, 2, 'size', 1000);
  h = push(h, 3, 'size', 1500); // mesmo slider, logo em seguida: um passo só
  h = push(h, 4, 'size', 5000); // muito depois: passo novo
  expect(h.past).toEqual([0, 1, 3]);
  h = undo(h);
  expect(h.present).toBe(3);
  h = undo(undo(h));
  expect(h.present).toBe(0);
  expect(undo(h)).toBe(h);
  h = redo(h);
  expect(h.present).toBe(1);
  h = push(h, 9);
  expect(h.future).toEqual([]); // editar depois de desfazer descarta o "refazer"
});
