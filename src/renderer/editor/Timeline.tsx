import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeftToLine, ArrowRightToLine, BookmarkMinus, BookmarkPlus, Copy, FoldHorizontal, Magnet, Scissors, SquareDashedMousePointer, Trash2, Volume2, VolumeX, ZoomIn, ZoomOut } from 'lucide-react';
import { chunkWords } from '@shared/captions';
import { clipPieces, copyPieces, duplicatePieces, forCopy, insertAt, locateOut, outputWords, removeFromPieces, restoreGap, setIn, setOut, splitPiece, type Clipboard, type Piece, type Seg } from '@shared/timeline';
import type { Clip, Word } from '@shared/types';
import { IconButton, fmtClock } from '../components/ui';
import { isTyping, type Player } from './Editor';

type Update = (fn: (c: Clip) => Clip, merge?: string) => void;
const LABEL = 88; // coluna dos nomes das trilhas
const PAD = 5; // segundos visíveis antes/depois do corte (para estender)
const STEPS = [0.5, 1, 2, 5, 10, 15, 30, 60];
const MIN_PPS = 2, MAX_PPS = 400;
const SNAP_PX = 10;
const key = (p: Piece) => `${p.entry}:${p.a.toFixed(3)}`;
const PREFS = 'cortai.timeline';

/** Preferências da timeline (ímã e ripple), lembradas neste computador. */
function usePrefs() {
  const [prefs, setPrefs] = useState<{ snap: boolean; ripple: boolean }>(() => {
    try { return { snap: true, ripple: true, ...JSON.parse(localStorage.getItem(PREFS) ?? '{}') }; } catch { return { snap: true, ripple: true }; }
  });
  useEffect(() => { try { localStorage.setItem(PREFS, JSON.stringify(prefs)); } catch { /* sem armazenamento: vale só nesta sessão */ } }, [prefs]);
  return [prefs, setPrefs] as const;
}

interface PieceItem { p: Piece; d0: number; d1: number; out0: number }
interface GapItem { prev: Piece; next: Piece; rel0: number; rel1: number; d0: number; d1: number }

/**
 * Desenho da timeline: os pedaços na ordem da lista de edição (podem repetir trechos do original).
 * Ripple ligado: pedaços colados (junção com tesourinha para recolocar). Desligado: o que sumiu entre dois
 * pedaços seguidos aparece como buraco hachurado do tamanho real (o export junta do mesmo jeito).
 * Fora do corte (d < 0 e d > span) é o original antes do 1º / depois do último pedaço, para estender.
 */
function makeView(clip: Clip, ripple: boolean) {
  const pieces = clipPieces(clip);
  const list = pieces.map((p): Seg => [p.a, p.b]);
  const items: PieceItem[] = [], gaps: GapItem[] = [];
  let d = 0, out = 0;
  pieces.forEach((p, i) => {
    const prev = pieces[i - 1];
    if (prev && prev.g === p.g && p.a - prev.b >= 0.05) { // buraco: o que foi apagado entre dois pedaços seguidos da mesma cópia
      const w = ripple ? 0 : p.a - prev.b;
      gaps.push({ prev, next: p, rel0: prev.b, rel1: p.a, d0: d, d1: d + w });
      d += w;
    }
    items.push({ p, d0: d, d1: d + p.b - p.a, out0: out });
    d += p.b - p.a; out += p.b - p.a;
  });
  const last = pieces[pieces.length - 1];
  const span = d;
  const first = pieces[0]?.a ?? 0, end = last?.b ?? clip.out - clip.in;
  const outToDisp = (o: number) => {
    const it = items.find((x, i) => o < x.out0 + x.d1 - x.d0 || i === items.length - 1);
    return it ? it.d0 + Math.max(0, o - it.out0) : 0;
  };
  /** Posição → o que tocar lá: tempo do vídeo final (dentro de um pedaço) ou instante do original. */
  const target = (dd: number): { out: number } | { rel: number } => {
    if (dd < 0) return { rel: first + dd };
    if (dd > span) return { rel: end + dd - span };
    const g = gaps.find((x) => dd >= x.d0 && dd < x.d1);
    if (g) return { rel: g.rel0 + dd - g.d0 };
    const it = items.find((x) => dd >= x.d0 && dd <= x.d1) ?? items[items.length - 1];
    return it ? { out: it.out0 + dd - it.d0 } : { rel: dd };
  };
  const relOf = (dd: number) => { const tg = target(dd); return 'rel' in tg ? tg.rel : locateOut(list, tg.out).rel; };
  /** Instante do original → posição (1ª vez que aparece). */
  const relToDisp = (rel: number) => {
    if (rel < first) return rel - first;
    const it = items.find((x) => rel >= x.p.a && rel <= x.p.b);
    if (it) return it.d0 + rel - it.p.a;
    const g = gaps.find((x) => rel >= x.rel0 && rel <= x.rel1);
    if (g) return g.d0 + Math.min(g.d1 - g.d0, rel - g.rel0);
    return rel > end ? span + rel - end : 0;
  };
  return { pieces, list, items, gaps, span, outToDisp, target, relOf, relToDisp };
}

export function Timeline({ clip, words, peaks, player, update, wordSelected, onPick }: {
  clip: Clip; words: Word[]; peaks: number[]; player: Player; update: Update; wordSelected: boolean; onPick: () => void;
}) {
  const { t } = useTranslation();
  const scroller = useRef<HTMLDivElement>(null);
  const head = useRef<HTMLDivElement>(null);
  const wave = useRef<HTMLCanvasElement>(null);
  const [pps, setPps] = useState(0); // pixels por segundo (0 = ainda não medido)
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [prefs, setPrefs] = usePrefs();
  const [markHere, setMarkHere] = useState(false);
  const anchor = useRef(0);
  const clipboard = useRef<Clipboard | null>(null); // ponytail: copiar/colar só dentro deste editor (sem área de transferência do sistema)

  const view = useMemo(() => makeView(clip, prefs.ripple), [clip, prefs.ripple]);
  const { pieces, items, gaps, span } = view;
  const x = (d: number) => (d + PAD) * pps;
  const live = useRef({ view, pps, clip });
  live.current = { view, pps, clip };

  useLayoutEffect(() => { // começa mostrando o corte inteiro
    const w = (scroller.current?.clientWidth ?? 800) - LABEL - 16;
    setPps(Math.max(4, w / (span + 2 * PAD)));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const chunks = useMemo(() => chunkWords(outputWords(words, clip), clip.caption.wordsPerLine), [words, clip]);
  const marks = useMemo(() => (clip.bookmarks ?? []).map((b) => b - clip.in).filter((r) => r >= -PAD && r <= clip.out - clip.in + PAD), [clip.bookmarks, clip.in, clip.out]);
  const isMuted = (p: Piece) => p.muted;
  const copyNames = useMemo(() => { const m = new Map<number, number>(); pieces.forEach((p) => { if (p.g && !m.has(p.g)) m.set(p.g, m.size + 1); }); return m; }, [pieces]);

  // seleção de palavras na transcrição e de pedaços na timeline não convivem
  useEffect(() => { if (wordSelected) setSel(new Set()); }, [wordSelected]);
  useEffect(() => { // pedaços que deixaram de existir saem da seleção
    setSel((s) => { const ok = new Set(pieces.map(key)); const n = new Set([...s].filter((k) => ok.has(k))); return n.size === s.size ? s : n; });
  }, [pieces]);

  // onda do áudio (picos a cada 50 ms), na mesma conta de posição da timeline
  useEffect(() => {
    const c = wave.current;
    if (!c || !pps) return;
    const w = Math.max(1, Math.min(32000, Math.round(span * pps))); // ponytail: canvas tem limite de largura; acima disso a onda estica (dividir em blocos se incomodar)
    c.width = w; c.height = 40;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = 'rgba(244,244,246,0.55)';
    // normaliza pelo percentil 95 do trecho (um estalo isolado não achata a fala) e usa raiz (mais perto do ouvido)
    const local = peaks.slice(Math.floor(clip.in / 0.05), Math.ceil(clip.out / 0.05)).sort((a, b) => a - b);
    const max = Math.max(1, local[Math.floor(local.length * 0.95)] ?? 1);
    for (let px = 0; px < w; px++) {
      const p = peaks[Math.floor((clip.in + view.relOf((px / w) * span)) / 0.05)] ?? 0;
      const hgt = Math.max(1, Math.sqrt(Math.min(1, p / max)) * 36);
      ctx.fillRect(px, 20 - hgt / 2, 1, hgt);
    }
  }, [peaks, pps, view]); // eslint-disable-line react-hooks/exhaustive-deps

  // playhead sem re-render; acompanha durante a reprodução
  const place = (rel: number, out: number | null) => {
    const { view: v, pps: p, clip: c } = live.current;
    const px = ((out === null ? v.relToDisp(rel) : v.outToDisp(out)) + PAD) * p;
    if (head.current) head.current.style.transform = `translateX(${px}px)`;
    const s = scroller.current;
    if (s && !player.video.current?.paused && (px + LABEL > s.scrollLeft + s.clientWidth - 40 || px + LABEL < s.scrollLeft)) s.scrollLeft = px + LABEL - 120;
    const here = (c.bookmarks ?? []).some((b) => Math.abs(b - c.in - rel) < 0.1);
    setMarkHere((m) => (m === here ? m : here));
  };
  useEffect(() => player.subscribe(place), [player]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { place(player.relNow(), player.outNow()); }, [view, pps]); // eslint-disable-line react-hooks/exhaustive-deps -- zoom/edição

  const dispAt = (clientX: number) => {
    const r = scroller.current!.getBoundingClientRect();
    return (clientX - r.left + scroller.current!.scrollLeft - LABEL) / pps - PAD;
  };
  /** Ímã: gruda nas bordas dos pedaços, nos marcadores e nas pontas do corte. */
  const snapDisp = (d: number) => {
    if (!prefs.snap) return d;
    const edges = [0, span, ...items.flatMap((it) => [it.d0, it.d1]), ...marks.map(view.relToDisp)];
    const best = edges.reduce((b, e) => (Math.abs(e - d) < Math.abs(b - d) ? e : b), Infinity);
    return Math.abs(best - d) * pps < SNAP_PX ? best : d;
  };
  const seekDisp = (d: number) => { const tg = view.target(snapDisp(d)); if ('out' in tg) player.seekOut(tg.out); else player.seekRel(tg.rel); };
  const seek = (e: React.MouseEvent) => { setSel(new Set()); seekDisp(dispAt(e.clientX)); };

  const zoomTo = (next: number, clientX?: number) => {
    const s = scroller.current!;
    const cx = clientX ?? s.getBoundingClientRect().left + LABEL + (s.clientWidth - LABEL) / 2;
    const dAt = dispAt(cx);
    const z = Math.min(MAX_PPS, Math.max(MIN_PPS, next));
    setPps(z);
    requestAnimationFrame(() => { s.scrollLeft = (dAt + PAD) * z + LABEL - (cx - s.getBoundingClientRect().left); });
  };
  const onWheel = (e: React.WheelEvent) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    zoomTo(pps * (e.deltaY < 0 ? 1.2 : 1 / 1.2), e.clientX);
  };
  useEffect(() => { // Ctrl+roda: o React registra wheel como passivo, então bloqueamos o zoom da página aqui
    const s = scroller.current!;
    const block = (e: WheelEvent) => e.ctrlKey && e.preventDefault();
    s.addEventListener('wheel', block, { passive: false });
    return () => s.removeEventListener('wheel', block);
  }, []);

  /** Alça de aparar: arrasta a entrada/saída (conta feita na timeline de quando o arrasto começou); ímã nas bordas das palavras. */
  const trim = (side: 'in' | 'out') => (e: React.PointerEvent) => {
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const c0 = { in: clip.in, relOf: view.relOf };
    const move = (ev: PointerEvent) => {
      let tt = c0.in + c0.relOf(dispAt(ev.clientX));
      if (prefs.snap) {
        const snap = words.reduce((best, w) => { const edge = side === 'in' ? w.start - 0.1 : w.end + 0.15; return Math.abs(edge - tt) < Math.abs(best - tt) ? edge : best; }, tt);
        if (Math.abs(snap - tt) * pps < SNAP_PX) tt = snap;
      }
      update((c) => (side === 'in' ? setIn(c, tt) : setOut(c, tt)), `trim-${side}`);
    };
    const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };

  /** Clique num pedaço: seleciona (Shift = intervalo, Ctrl = um a um) e leva o playhead até ali. */
  const pick = (i: number) => (e: React.MouseEvent) => {
    e.stopPropagation();
    onPick();
    const k = key(pieces[i]);
    setSel((s) => {
      if (e.shiftKey) { const [a, b] = [Math.min(anchor.current, i), Math.max(anchor.current, i)]; return new Set(pieces.slice(a, b + 1).map(key)); }
      anchor.current = i;
      if (e.ctrlKey || e.metaKey) { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; }
      return new Set([k]);
    });
    if (!e.shiftKey && !e.ctrlKey && !e.metaKey) seekDisp(dispAt(e.clientX));
  };

  // ações da barra (as do Flow Me que fazem sentido num corte de uma trilha só)
  /** Pedaço sob o playhead e o instante (rel) dentro dele. */
  const atPlayhead = (margin = 0.1) => {
    const o = player.outNow();
    if (o === null || !pieces.length) return null;
    const { idx, rel } = locateOut(view.list, o);
    const p = pieces[idx];
    return p && rel > p.a + margin && rel < p.b - margin ? { p, rel, out0: items[idx].out0 } : null;
  };
  const chosen = () => pieces.filter((p) => sel.has(key(p)));
  const actions = {
    split: () => { const h = atPlayhead(); if (h) update((c) => splitPiece(c, h.p, h.rel)); },
    splitLeft: () => { // divide e apaga o lado esquerdo do pedaço sob o playhead
      const h = atPlayhead();
      if (!h) return;
      update((c) => removeFromPieces(c, [{ entry: h.p.entry, a: h.p.a, b: h.rel }]));
      requestAnimationFrame(() => player.seekOut(h.out0));
    },
    splitRight: () => { const h = atPlayhead(); if (h) update((c) => removeFromPieces(c, [{ entry: h.p.entry, a: h.rel, b: h.p.b }])); },
    remove: () => {
      const ch = chosen();
      if (!ch.length || ch.length === pieces.length) return; // não deixa apagar tudo; para isso basta excluir o corte
      update((c) => removeFromPieces(c, ch));
      setSel(new Set());
    },
    duplicate: () => { const ch = chosen(); if (ch.length) { update((c) => duplicatePieces(c, ch)); setSel(new Set()); } },
    copy: () => { const ch = chosen(); if (ch.length) clipboard.current = copyPieces(clip, ch); }, // leva as edições junto
    paste: () => { // cola no playhead (no meio do pedaço ou numa emenda)
      const cb = clipboard.current;
      if (!cb || !pieces.length) return;
      const { idx, rel } = locateOut(view.list, player.outNow() ?? 0);
      update((c) => insertAt(c, cb, pieces[idx], rel));
    },
    mute: () => { // só os pedaços selecionados
      const ch = chosen();
      if (!ch.length) return;
      const entries = new Set(ch.map((p) => p.entry));
      const all = ch.every(isMuted);
      update((c) => ({ ...c, order: c.order?.map((it, k) => (entries.has(k) ? { ...it, muted: !all || undefined } : it)) }));
    },
    selectAll: () => { onPick(); setSel(new Set(pieces.map(key))); },
    bookmark: () => {
      const at = clip.in + player.relNow();
      update((c) => {
        const bs = c.bookmarks ?? [];
        const near = bs.find((b) => Math.abs(b - at) < 0.1);
        return { ...c, bookmarks: near === undefined ? [...bs, at].sort((a, b) => a - b) : bs.filter((b) => b !== near) };
      });
    },
    snap: () => setPrefs((p) => ({ ...p, snap: !p.snap })),
    ripple: () => setPrefs((p) => ({ ...p, ripple: !p.ripple })),
  };
  const act = useRef(actions);
  act.current = actions;
  const selRef = useRef(sel);
  selRef.current = sel;
  useEffect(() => { // atalhos do Flow Me: S, Q, W, Delete, N, Ctrl+A/C/V/D, Esc (+ M silenciar, B marcador)
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target as HTMLElement) || e.altKey) return;
      const a = act.current;
      const k = e.key.toLowerCase();
      if (e.ctrlKey || e.metaKey) {
        if (k === 'a') a.selectAll();
        else if (k === 'd' && selRef.current.size) a.duplicate();
        else if (k === 'c' && selRef.current.size && !window.getSelection()?.toString()) a.copy();
        else if (k === 'v' && clipboard.current) a.paste();
        else return;
      }
      else if (k === 's') a.split();
      else if (k === 'q') a.splitLeft();
      else if (k === 'w') a.splitRight();
      else if (k === 'n') a.snap();
      else if (k === 'b') a.bookmark();
      else if (k === 'm' && selRef.current.size) a.mute();
      else if ((e.key === 'Delete' || e.key === 'Backspace') && selRef.current.size) a.remove();
      else if (e.key === 'Escape' && selRef.current.size) setSel(new Set());
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const step = STEPS.find((s) => s * pps >= 70) ?? 60;
  const ticks: number[] = [];
  for (let s = Math.ceil(-PAD / step) * step; s <= span + PAD; s += step) ticks.push(s);
  const width = (span + 2 * PAD) * pps;
  const selMuted = sel.size > 0 && chosen().every(isMuted);
  const zoomPos = pps ? Math.log(pps / MIN_PPS) / Math.log(MAX_PPS / MIN_PPS) : 0;

  return (
    <section aria-label="Timeline" className="flex h-[196px] shrink-0 flex-col border-t border-border bg-surface">
      <div role="toolbar" aria-label={t('editor.tl.toolbar')} className="flex h-10 items-center gap-0.5 border-b border-border px-2">
        <IconButton icon={Scissors} label={t('editor.tl.split')} className="size-8" onClick={actions.split} />
        <IconButton icon={ArrowLeftToLine} label={t('editor.tl.splitLeft')} className="size-8" onClick={actions.splitLeft} />
        <IconButton icon={ArrowRightToLine} label={t('editor.tl.splitRight')} className="size-8" onClick={actions.splitRight} />
        <IconButton icon={selMuted ? Volume2 : VolumeX} label={t(selMuted ? 'editor.tl.unmute' : 'editor.tl.mute')} className="size-8" onClick={actions.mute} disabled={!sel.size} />
        <IconButton icon={Copy} label={t('editor.tl.duplicate')} className="size-8" onClick={actions.duplicate} disabled={!sel.size} />
        <IconButton icon={SquareDashedMousePointer} label={t('editor.tl.selectAll')} className="size-8" onClick={actions.selectAll} />
        <IconButton icon={Trash2} label={t('editor.tl.delete')} className="size-8" onClick={actions.remove} disabled={!sel.size} />
        <span className="mx-1.5 h-6 w-px bg-border" aria-hidden="true" />
        <IconButton icon={markHere ? BookmarkMinus : BookmarkPlus} active={markHere} label={t(markHere ? 'editor.tl.unmark' : 'editor.tl.mark')} className="size-8" onClick={actions.bookmark} />
        <span role="status" className="ml-3 min-w-0 truncate text-[11px] text-muted">{sel.size ? t('editor.piecesSelected', { count: sel.size }) : t('editor.timelineHint')}</span>
        <span className="ml-auto" />
        <IconButton icon={Magnet} active={prefs.snap} aria-pressed={prefs.snap} label={t('editor.tl.snap')} className="size-8" onClick={actions.snap} />
        <IconButton icon={FoldHorizontal} active={prefs.ripple} aria-pressed={prefs.ripple} label={t('editor.tl.ripple')} className="size-8" onClick={actions.ripple} />
        <span className="mx-1.5 h-6 w-px bg-border" aria-hidden="true" />
        <IconButton icon={ZoomOut} label={t('editor.zoomOut')} className="size-8" onClick={() => zoomTo(pps / 1.5)} />
        <input type="range" min={0} max={1} step={0.005} value={zoomPos} aria-label={t('editor.tl.zoom')}
          onChange={(e) => zoomTo(MIN_PPS * (MAX_PPS / MIN_PPS) ** Number(e.target.value))}
          className="mx-1 w-28 cursor-pointer accent-[var(--primary)]" />
        <IconButton icon={ZoomIn} label={t('editor.zoomIn')} className="size-8" onClick={() => zoomTo(pps * 1.5)} />
      </div>
      <div ref={scroller} onWheel={onWheel} className="relative min-h-0 flex-1 overflow-x-auto overflow-y-hidden">
        {pps > 0 && (
          <div className="relative" style={{ width: width + LABEL + 16 }}>
            {/* régua (tempo do vídeo final com ripple; com buracos sem ripple) + marcadores */}
            <div className="relative h-6 cursor-pointer border-b border-border" style={{ marginLeft: LABEL }} onMouseDown={seek}>
              {ticks.map((s) => (
                <span key={s} className="absolute top-0 h-full border-l border-border pl-1 font-mono text-[10px] text-muted" style={{ left: x(s) }}>{s < -0.01 ? `-${fmtClock(-s)}` : fmtClock(s)}</span>
              ))}
              {marks.map((r) => {
                const d = view.relToDisp(r);
                const label = t('editor.tl.gotoMark', { at: fmtClock(Math.max(0, d)) });
                return (
                  <button key={r} type="button" onMouseDown={(e) => { e.stopPropagation(); player.seekRel(r); }} aria-label={label} title={label}
                    className="absolute top-0 z-[1] h-full w-3 -translate-x-1.5 cursor-pointer focus-visible:outline-2 focus-visible:outline-primary" style={{ left: x(d) }}>
                    <span aria-hidden="true" className="absolute top-0.5 left-0.5 h-3.5 w-2 bg-warning [clip-path:polygon(0_0,100%_0,100%_100%,50%_75%,0_100%)]" />
                  </button>
                );
              })}
            </div>
            {/* vídeo */}
            <Track label={t('editor.tracks.video')}>
              <div className="relative h-full" onMouseDown={seek}>
                <canvas ref={wave} className="pointer-events-none absolute inset-y-1 h-[calc(100%-8px)]" style={{ left: x(0), width: span * pps }} aria-hidden="true" />
                {items.map(({ p, d0, d1, out0 }, i) => {
                  const on = sel.has(key(p));
                  const mute = isMuted(p);
                  return (
                    <button key={key(p)} type="button" aria-pressed={on} onMouseDown={pick(i)}
                      aria-label={`${t(mute ? 'editor.pieceMuted' : 'editor.piece', { n: i + 1, from: fmtClock(out0), to: fmtClock(out0 + p.b - p.a) })}${p.g ? ` · ${t('editor.copyN', { n: copyNames.get(p.g) })}` : ''}`}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onPick(); setSel(new Set([key(p)])); anchor.current = i; } }}
                      className={`absolute inset-y-1 cursor-pointer rounded-input ring-inset transition-[background-color,box-shadow] duration-100 focus-visible:outline-2 focus-visible:outline-primary ${on ? 'bg-primary/25 ring-2 ring-primary' : mute ? 'bg-surface-2/70 ring-1 ring-[var(--track-video)]/60 hover:bg-surface-2' : 'bg-[var(--track-video)]/35 ring-1 ring-[var(--track-video)] hover:bg-[var(--track-video)]/50'}`}
                      style={{ left: x(d0) + 1, width: Math.max(3, (d1 - d0) * pps - 2) }}>
                      <span aria-hidden="true" className="absolute top-0.5 left-1 flex items-center gap-1 text-[10px] font-semibold text-text/80">
                        {mute && (d1 - d0) * pps > 22 && <VolumeX size={12} strokeWidth={1.75} className="text-muted" />}
                        {p.g > 0 && (d1 - d0) * pps > 30 && `C${copyNames.get(p.g)}`}
                      </span>
                    </button>
                  );
                })}
                {items.flatMap(({ p, d0 }) => forCopy(clip, p.g).reframe.filter((k) => k.t >= p.a && k.t <= p.b).map((k) => (
                  <span key={`${key(p)}-${k.t}`} aria-hidden="true" className={`pointer-events-none absolute top-0.5 size-2 -translate-x-1 rotate-45 ${k.auto ? 'bg-text/30' : 'bg-primary'}`} style={{ left: x(d0 + k.t - p.a) }} />
                )))}
                {gaps.map((g) => {
                  const label = t('editor.restoreCut', { d: (g.rel1 - g.rel0).toFixed(1) });
                  const restore = () => update((c) => restoreGap(c, g.prev, g.next));
                  return g.d1 - g.d0 < 0.001 ? (
                    <button key={`${g.rel0}-${g.d0}`} type="button" onMouseDown={(e) => e.stopPropagation()} onClick={restore} aria-label={label} title={label}
                      className="absolute -bottom-0.5 z-[1] flex size-4 -translate-x-2 cursor-pointer items-center justify-center rounded-full bg-danger text-on-primary hover:brightness-125 focus-visible:outline-2 focus-visible:outline-primary"
                      style={{ left: x(g.d0) }}>
                      <Scissors size={10} strokeWidth={1.75} aria-hidden="true" />
                    </button>
                  ) : (
                    <button key={`${g.rel0}-${g.d0}`} type="button" onMouseDown={(e) => e.stopPropagation()} onClick={restore} aria-label={label} title={label}
                      className="absolute inset-y-1 cursor-pointer rounded-input bg-[repeating-linear-gradient(45deg,rgba(255,77,109,.45)_0_4px,rgba(11,11,15,.7)_4px_8px)] hover:brightness-125 focus-visible:outline-2 focus-visible:outline-primary"
                      style={{ left: x(g.d0), width: (g.d1 - g.d0) * pps }} />
                  );
                })}
                <div role="slider" aria-label={t('editor.trimIn')} aria-valuenow={Math.round(clip.in)} tabIndex={0} onPointerDown={trim('in')}
                  onKeyDown={(e) => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); const d = e.key === 'ArrowLeft' ? -0.1 : 0.1; update((c) => setIn(c, (c.order?.[0]?.a ?? c.in) + d), 'trim-in'); } }}
                  className="absolute inset-y-0 w-2.5 -translate-x-1 cursor-ew-resize rounded-l-input bg-[var(--track-video)] hover:brightness-125" style={{ left: x(0) }} />
                <div role="slider" aria-label={t('editor.trimOut')} aria-valuenow={Math.round(clip.out)} tabIndex={0} onPointerDown={trim('out')}
                  onKeyDown={(e) => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); const d = e.key === 'ArrowLeft' ? -0.1 : 0.1; update((c) => setOut(c, (c.order?.[c.order.length - 1]?.b ?? c.out) + d), 'trim-out'); } }}
                  className="absolute inset-y-0 w-2.5 -translate-x-1.5 cursor-ew-resize rounded-r-input bg-[var(--track-video)] hover:brightness-125" style={{ left: x(span) }} />
              </div>
            </Track>
            {/* legenda (segue o vídeo: pedaço apagado leva a legenda junto, cópia leva a cópia) */}
            <Track label={t('editor.tracks.caption')}>
              <div className="relative h-full" onMouseDown={seek}>
                {chunks.map((c, i) => {
                  const a = view.outToDisp(c.words[0].start), b = view.outToDisp(c.words[c.words.length - 1].end);
                  return (
                    <span key={`${c.start}-${i}`} className="absolute inset-y-1 truncate rounded-input bg-[var(--track-caption)]/20 px-1 text-[11px] leading-[26px] text-text ring-1 ring-[var(--track-caption)]/60"
                      style={{ left: x(a), width: Math.max(4, (b - a) * pps - 2) }}>
                      {c.words.map((w) => w.text).join(' ')}
                    </span>
                  );
                })}
              </div>
            </Track>
            {/* playhead */}
            <div ref={head} aria-hidden="true" className="pointer-events-none absolute top-0 bottom-0 z-[2] w-px bg-primary" style={{ left: LABEL }}>
              <span className="absolute -top-0.5 -left-1.5 size-3 rotate-45 bg-primary" />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function Track({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex border-b border-border" style={{ height: label.length ? 48 : 36 }}>
      <span className="sticky left-0 z-10 flex shrink-0 items-center border-r border-border bg-surface px-3 text-[11px] font-medium text-muted" style={{ width: LABEL }}>{label}</span>
      <div className="relative flex-1">{children}</div>
    </div>
  );
}
