import { expect, it } from 'vitest';
import { audioMeasureGraph, buildGraph, lerpExpr } from './graph';

const clip = {
  in: 10, out: 40, cuts: [[15, 18]] as [number, number][],
  layout: { aspect: '9:16' as const, mode: 'single' as const, smoothing: 0.5 },
  reframe: [{ t: 0, x: 0.3, y: 0.5, zoom: 1, ease: 'smooth' as const, auto: true }, { t: 10, x: 0.6, y: 0.5, zoom: 1, ease: 'smooth' as const, auto: true }],
  audio: { speechGain: 1, normalizeLufs: -14, denoise: false }, wordEdits: {},
};

it('um trecho por parte mantida, concatenados, com o enquadramento deslocado', () => {
  const { graph, duration } = buildGraph({ width: 1920, height: 1080 }, clip, 30);
  expect(duration).toBe(27);
  expect(graph).toContain('split=2');
  expect(graph).toContain('trim=start=0:end=5');
  expect(graph).toContain('trim=start=8:end=30');
  expect(graph).toContain('concat=n=2:v=1:a=1');
  expect(graph).toContain('crop=606:1080');
  expect(graph).toContain('t-(-8)'); // keyframes do 2º trecho deslocados 8 s
  expect(graph).toContain('loudnorm=I=-14');
});

it('fundo desfocado e de cor', () => {
  expect(buildGraph({ width: 1920, height: 1080 }, { ...clip, cuts: [], layout: { ...clip.layout, mode: 'blur-bg', bgBlur: 20 } }, 30).graph).toContain('gblur=sigma=20');
  expect(buildGraph({ width: 1920, height: 1080 }, { ...clip, cuts: [], layout: { ...clip.layout, mode: 'color-bg', bgColor: '#112233' } }, 30).graph).toContain('color=0x112233');
});

it('expressão linear por trechos', () => {
  expect(lerpExpr([{ t: 0, v: 0.5 }])).toBe('0.5');
  expect(lerpExpr([{ t: 0, v: 0 }, { t: 2, v: 1 }])).toBe('if(lt(t\\,2)\\,0+(1)*(t-(0))/2\\,1)');
});

it('loudnorm em duas passadas: mede só o áudio e depois aplica linear', () => {
  expect(audioMeasureGraph(clip)).toContain('print_format=json');
  expect(audioMeasureGraph({ ...clip, audio: { ...clip.audio, normalizeLufs: undefined } })).toBeNull();
  const m = { input_i: '-20.1', input_tp: '-3.2', input_lra: '6.0', input_thresh: '-30.5', target_offset: '0.2' };
  const g = buildGraph({ width: 1920, height: 1080 }, clip, 30, m).graph;
  expect(g).toContain('measured_I=-20.1');
  expect(g).toContain('linear=true');
});

it('pedaço silenciado sai mudo; cópia usa o próprio enquadramento', () => {
  const kf = (x: number) => [{ t: 0, x, y: 0.5, zoom: 1, ease: 'linear' as const, auto: false }];
  const c = { ...clip, cuts: [], wordEdits: {}, reframe: kf(0.2), order: [{ a: 10, b: 20, g: 0 }, { a: 12, b: 15, g: 1, muted: true }], copies: { 1: { wordEdits: {}, reframe: kf(0.8) } } };
  const { graph, duration } = buildGraph({ width: 1920, height: 1080 }, c, 30);
  expect(duration).toBe(13);
  expect(graph).toContain('[sa1]atrim=start=2:end=5,asetpts=PTS-STARTPTS,volume=0[a1]');
  expect(graph).toContain('[sa0]atrim=start=0:end=10,asetpts=PTS-STARTPTS[a0]');
  const v1 = graph.split(';').find((x) => x.startsWith('[sv1]'))!;
  expect(v1).toContain('(0.8)*iw');
  expect(graph.split(';').find((x) => x.startsWith('[sv0]'))).toContain('(0.2)*iw');
});

it('pedaço duplicado: o mesmo trecho do original entra duas vezes, na ordem da lista', () => {
  const { graph, duration } = buildGraph({ width: 1920, height: 1080 }, { ...clip, cuts: [], order: [{ a: 10, b: 20, g: 0 }, { a: 12, b: 15, g: 1 }, { a: 20, b: 40, g: 0 }] }, 30);
  expect(duration).toBe(33);
  const trims = [...graph.matchAll(/\[sv\d\]trim=start=([\d.]+):end=([\d.]+)/g)].map((m) => `${m[1]}-${m[2]}`);
  expect(trims).toEqual(['0-10', '2-5', '10-30']);
  expect(graph).toContain('concat=n=3:v=1:a=1');
});
