import type { ReframeKeyframe } from './types';

/** Posição (x, y normalizados) da janela de corte no instante t, interpolando os keyframes. */
export function reframeAt(kfs: ReframeKeyframe[], t: number): { x: number; y: number } {
  if (!kfs.length) return { x: 0.5, y: 0.5 };
  if (t <= kfs[0].t) return kfs[0];
  for (let k = 0; k < kfs.length - 1; k++) {
    const a = kfs[k], b = kfs[k + 1];
    if (t < b.t) {
      const f = b.t > a.t ? (t - a.t) / (b.t - a.t) : 1;
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
    }
  }
  return kfs[kfs.length - 1];
}
