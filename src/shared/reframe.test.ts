import { expect, it } from 'vitest';
import { reframeAt } from './reframe';

const k = (t: number, x: number) => ({ t, x, y: 0.5, zoom: 1, ease: 'smooth' as const, auto: true });
it('interpola entre keyframes e segura nas pontas', () => {
  const kfs = [k(0, 0.5), k(1, 0.5), k(2, 0.7)];
  expect(reframeAt(kfs, 0.5).x).toBe(0.5);
  expect(reframeAt(kfs, 1.5).x).toBeCloseTo(0.6);
  expect(reframeAt(kfs, 9).x).toBe(0.7);
  expect(reframeAt([], 3)).toEqual({ x: 0.5, y: 0.5 });
});
