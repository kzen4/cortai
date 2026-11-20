import { describe, expect, it } from 'vitest';
import { clipPieces, copyPieces, detectCornerWebcam, FRAME_PRESETS, framingFor, presetOf, setPieceFrame, webcamRect, cropRect, cutWords, duplicatePieces, editList, forCopy, inCopy, inCopyAt, insertAt, keptSegments, locateOut, mergeRanges, normalizeClip, outDuration, outToRel, outputWords, relToOut, removeFromPieces, restoreGap, restoreWords, setIn, splitPiece, subtractRange } from './timeline';

const clip = { in: 100, out: 130, order: undefined, splits: undefined, reframe: [], copies: undefined, cuts: [[105, 108], [107, 110], [125, 140]] as [number, number][], wordEdits: { 2: 'certo' } };

describe('linha do tempo do corte', () => {
  it('junta cortes e calcula trechos mantidos', () => {
    expect(mergeRanges([[5, 8], [1, 2], [7, 10]])).toEqual([[1, 2], [5, 10]]);
    expect(keptSegments(clip)).toEqual([[0, 5], [10, 25]]);
    expect(outDuration(keptSegments(clip))).toBe(20);
  });
  it('descorta só o trecho pedido', () => {
    expect(subtractRange([[0, 10]], [3, 5])).toEqual([[0, 3], [5, 10]]);
    expect(subtractRange([[0, 2], [4, 6]], [0, 6])).toEqual([]);
  });
  it('converte tempos nos dois sentidos', () => {
    const s = keptSegments(clip);
    expect(relToOut(s, 3)).toBe(3);
    expect(relToOut(s, 7)).toBeNull();
    expect(relToOut(s, 12)).toBe(7);
    expect(outToRel(s, 7)).toBe(12);
    expect(outToRel(s, 5)).toBe(5);
  });
  it('tira palavras cortadas, remapeia e aplica correções', () => {
    const words = [
      { i: 1, text: 'a', start: 101, end: 101.5, conf: 1 },
      { i: 2, text: 'errado', start: 102, end: 102.5, conf: 1 },
      { i: 3, text: 'some', start: 106, end: 106.5, conf: 1 },
      { i: 4, text: 'b', start: 111, end: 111.5, conf: 1 },
    ];
    const w = outputWords(words, clip);
    expect(w.map((x) => x.text)).toEqual(['a', 'certo', 'b']);
    expect(w[2].start).toBeCloseTo(6);
  });
  it('recorte 9:16 de um vídeo 16:9 segue o centro e não sai do quadro', () => {
    const c = cropRect(1920, 1080, '9:16', 0.5, 0.5);
    expect(c.sw).toBeCloseTo(607.5);
    expect(c.sx).toBeCloseTo((1920 - 607.5) / 2);
    expect(cropRect(1920, 1080, '9:16', 0.99, 0.5).sx).toBeCloseTo(1920 - 607.5);
    expect(cropRect(1920, 1080, '9:16', 0.5, 0.5, 2).sh).toBe(540);
  });
});

describe('lista de edição com cópias independentes', () => {
  const kf = (x: number) => [{ t: 0, x, y: 0.5, zoom: 1, ease: 'smooth' as const, auto: true }];
  const legacy = { in: 10, out: 40, cuts: [[15, 18]] as [number, number][], splits: [12, 25, 16], muted: [[25, 40]] as [number, number][], wordEdits: { 1: 'oi' } as Record<number, string>, reframe: kf(0.3) };
  const c = normalizeClip(legacy);
  const at = (cc: typeof c, i: number) => clipPieces(cc)[i];
  it('corte antigo vira lista: divide nos splits, tira os cortes e leva o silêncio para o pedaço', () => {
    expect(editList(c)).toEqual([[0, 2], [2, 5], [8, 15], [15, 30]]);
    expect(c.cuts).toEqual([]);
    expect(clipPieces(c).map((p) => p.muted)).toEqual([false, false, false, true]);
  });
  it('apagar um pedaço junta o resto', () => {
    expect(editList(removeFromPieces(c, [at(c, 2)]))).toEqual([[0, 2], [2, 5], [15, 30]]);
  });
  it('dividir; dividir e apagar a esquerda', () => {
    const p = at(c, 3);
    expect(editList(splitPiece(c, p, 20))).toEqual([[0, 2], [2, 5], [8, 15], [15, 20], [20, 30]]);
    expect(editList(removeFromPieces(c, [{ ...p, b: 20 }]))).toEqual([[0, 2], [2, 5], [8, 15], [20, 30]]);
  });
  it('duplicar cria uma cópia nova com as edições da original, e depois cada uma segue a sua', () => {
    const d = duplicatePieces(c, [at(c, 1)]);
    expect(editList(d)).toEqual([[0, 2], [2, 5], [2, 5], [8, 15], [15, 30]]);
    const g = at(d, 2).g;
    expect(g).toBe(1);
    expect(forCopy(d, g).wordEdits).toEqual({ 1: 'oi' });
    const e = inCopy(d, g, (v) => ({ ...v, wordEdits: { ...v.wordEdits, 1: 'olá' }, reframe: kf(0.9) }));
    expect(forCopy(e, g).wordEdits[1]).toBe('olá');
    expect(e.wordEdits[1]).toBe('oi'); // a original não mudou
    expect(forCopy(e, 0).reframe[0].x).toBe(0.3);
    expect(forCopy(e, g).reframe[0].x).toBe(0.9);
  });
  it('legenda: cada pedaço usa as correções da sua cópia', () => {
    const words = [{ i: 1, text: 'a', start: 13, end: 13.5, conf: 1 }];
    const d = duplicatePieces(c, [at(c, 1)]);
    const e = inCopy(d, 1, (v) => ({ ...v, wordEdits: { 1: 'cópia' } }));
    expect(outputWords(words, e).map((w) => [w.text, w.start])).toEqual([['oi', 3], ['cópia', 6]]);
  });
  it('silenciar e cortar palavras valem só para a cópia', () => {
    const d = duplicatePieces(c, [at(c, 1)]);
    const cut = cutWords(d, 1, [13, 14]);
    expect(editList(cut)).toEqual([[0, 2], [2, 5], [2, 3], [4, 5], [8, 15], [15, 30]]);
    expect(inCopyAt(cut, 0, 13.5)).toBe(true);
    expect(inCopyAt(cut, 1, 13.5)).toBe(false);
    expect(editList(restoreWords(cut, 1, [13, 14]))).toEqual(editList(d));
  });
  it('colar no meio de um pedaço vira cópia nova', () => {
    const r = insertAt(c, copyPieces(c, [at(c, 0)]), at(c, 3), 20);
    expect(editList(r)).toEqual([[0, 2], [2, 5], [8, 15], [15, 20], [0, 2], [20, 30]]);
    expect(at(r, 4).g).toBe(1);
  });
  it('apagar o começo move a entrada e os keyframes de todas as cópias seguem o mesmo instante', () => {
    const d = duplicatePieces(c, [at(c, 1)]);
    const r = removeFromPieces(d, [at(d, 0)]);
    expect(r.in).toBe(12);
    expect(r.reframe[0].t).toBe(-2);
    expect(forCopy(r, 1).reframe[0].t).toBe(-2);
  });
  it('recolocar o que a timeline apagou entre dois pedaços da mesma cópia', () => {
    const r = removeFromPieces(c, [at(c, 1)]);
    expect(editList(restoreGap(r, at(r, 0), at(r, 1)))).toEqual([[0, 2], [2, 8], [8, 15], [15, 30]]);
  });
  it('entrada com order mexe no 1º pedaço', () => {
    expect(editList(setIn(c, 11))[0]).toEqual([0, 1]);
  });
  it('locateOut acha pedaço e instante (na emenda vale o seguinte)', () => {
    const l = editList(duplicatePieces(c, [at(c, 1)]));
    expect(locateOut(l, 3)).toEqual({ idx: 1, rel: 3 });
    expect(locateOut(l, 5)).toEqual({ idx: 2, rel: 2 });
    expect(locateOut(l, 99).idx).toBe(4);
  });
});

describe('enquadramento por pedaço e tela + webcam', () => {
  const kf = (x: number) => [{ t: 0, x, y: 0.5, zoom: 1.4, ease: 'smooth' as const, auto: true }];
  const c = normalizeClip({ in: 0, out: 30, cuts: [] as [number, number][], wordEdits: {}, reframe: kf(0.3) });
  it('pedaço com enquadramento fixo usa o dele (com o zoom da cópia); sem, segue a cópia', () => {
    const s = splitPiece(splitPiece(c, clipPieces(c)[0], 10), clipPieces(splitPiece(c, clipPieces(c)[0], 10))[1], 20);
    const f = setPieceFrame(s, [0], FRAME_PRESETS.left);
    const [p0, p1] = clipPieces(f);
    expect(framingFor(f, p0).reframe).toEqual([{ t: 0, x: 0, y: 0.5, zoom: 1.4, ease: 'linear', auto: false }]);
    expect(framingFor(f, p1).reframe[0].x).toBe(0.3);
    expect(presetOf(p0.frame)).toBe('left');
    expect(presetOf(p1.frame)).toBe('auto');
  });
  it('dividir um pedaço enquadrado mantém o enquadramento nas duas metades', () => {
    const f = setPieceFrame(c, [0], FRAME_PRESETS.right);
    expect(clipPieces(splitPiece(f, clipPieces(f)[0], 12)).map((p) => p.frame)).toEqual([FRAME_PRESETS.right, FRAME_PRESETS.right]);
  });
  it('janela da webcam: proporção da metade de baixo e dentro do quadro', () => {
    const r = webcamRect(1920, 1080, '9:16', { x: 0.95, y: 0.95, w: 0.28 });
    expect(r.sw / r.sh).toBeCloseTo(1080 / 960);
    expect(r.sx + r.sw).toBeCloseTo(1920);
    expect(r.sy + r.sh).toBeCloseTo(1080);
  });
  it('detecta webcam no canto só com rosto parado perto de um canto', () => {
    expect(detectCornerWebcam([{ x: 0.86, y: 0.8 }, { x: 0.87, y: 0.81 }])).toEqual({ x: 0.87, y: 0.81 });
    expect(detectCornerWebcam([{ x: 0.5, y: 0.5 }])).toBeNull();
    expect(detectCornerWebcam([{ x: 0.2, y: 0.8 }, { x: 0.6, y: 0.5 }])).toBeNull();
  });
});
