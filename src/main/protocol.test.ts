import { describe, expect, it, vi } from 'vitest';
vi.mock('electron', () => ({ protocol: {} }));
const { parseRange } = await import('./protocol');

describe('parseRange', () => {
  it('intervalos comuns do <video>', () => {
    expect(parseRange('bytes=0-', 1000)).toEqual([0, 999]);
    expect(parseRange('bytes=100-199', 1000)).toEqual([100, 199]);
    expect(parseRange('bytes=-100', 1000)).toEqual([900, 999]);
    expect(parseRange('bytes=900-5000', 1000)).toEqual([900, 999]);
  });
  it('sem Range ou inválido = arquivo inteiro', () => {
    expect(parseRange(null, 1000)).toBeNull();
    expect(parseRange('bytes=2000-', 1000)).toBeNull();
    expect(parseRange('lixo', 1000)).toBeNull();
  });
});
