// Roda o filtergraph no ffmpeg de verdade (pula se não houver ffmpeg no PATH): pega erro de sintaxe e rótulo repetido.
import { spawnSync } from 'node:child_process';
import { expect, it } from 'vitest';
import { buildGraph } from './graph';

const temFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;
const base = {
  in: 0, out: 6, cuts: [] as [number, number][], wordEdits: {},
  order: [ // pedaço com movimento próprio, pedaço fixo com zoom 2×, cópia
    { a: 0, b: 2, g: 0, keys: [{ t: 0, x: 0.1, y: 0.5, zoom: 1, ease: 'smooth' as const, auto: false }, { t: 2, x: 0.9, y: 0.5, zoom: 1, ease: 'smooth' as const, auto: false }] },
    { a: 2, b: 4, g: 0, frame: { x: 0, y: 0.5 }, zoom: 2 }, { a: 1, b: 3, g: 1 }],
  copies: { 1: { wordEdits: {}, reframe: [{ t: 0, x: 0.8, y: 0.5, zoom: 1.2, ease: 'smooth' as const, auto: false }] } },
  reframe: [{ t: 0, x: 0.3, y: 0.5, zoom: 1, ease: 'smooth' as const, auto: true }],
  audio: { speechGain: 1, denoise: false },
};

for (const mode of ['single', 'blur-bg', 'color-bg', 'screen-face'] as const) {
  it.skipIf(!temFfmpeg)(`ffmpeg aceita o layout ${mode} com 3 pedaços`, () => {
    const clip = { ...base, layout: { aspect: '9:16' as const, mode, smoothing: 0.5, webcam: { x: 0.85, y: 0.8, w: 0.28 } } };
    const { graph } = buildGraph({ width: 1920, height: 1080 }, clip, 30);
    const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error',
      '-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=30:duration=6[out0];sine=duration=6[out1]',
      '-f', 'lavfi', '-i', 'color=c=black@0.0:s=1080x1920:d=6,format=rgba',
      '-filter_complex', graph, '-map', '[v]', '-map', '[a]', '-t', '1', '-f', 'null', '-']);
    expect(String(r.stderr)).toBe('');
    if (mode === 'single') expect(new Set(graph.match(/crop=\d+:\d+/g)).size).toBe(3); // zoom 1, 2 e 1,2 (cópia): 3 recortes
    expect(r.status).toBe(0);
  }, 30_000);
}
