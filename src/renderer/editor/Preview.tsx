import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Crosshair, Focus, Grid2x2, LocateFixed, Pause, Pencil, Pin, Play, SkipBack, StepBack, StepForward } from 'lucide-react';
import { chunkWords } from '@shared/captions';
import { ASPECT_SIZE } from '@shared/constants';
import { reframeAt } from '@shared/reframe';
import { cropRect, forCopy, inCopy, outputWords, type Piece } from '@shared/timeline';
import type { Clip, ReframeKeyframe, Word } from '@shared/types';
import { Button, IconButton, fmtClock } from '../components/ui';
import { drawBase } from '../overlay/composite';
import { drawOverlay, loadCaptionFont } from '../overlay/drawOverlay';
import type { Player } from './Editor';

type Update = (fn: (c: Clip) => Clip, merge?: string) => void;
const CONTROLS = 64; // altura da barra de controles abaixo da prévia

/** Tamanho disponível (px CSS) de um elemento, atualizado quando a janela muda. */
function useSize(ref: React.RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    if (ref.current) ro.observe(ref.current);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

export function Preview({ clip, words, src, player, copy, pieces, playing, safe, onSafe, update, onCaptionClick, projectId, duration }: {
  clip: Clip; words: Word[]; copy: number; pieces: Piece[]; src: { width: number; height: number }; player: Player; playing: boolean; safe: boolean; onSafe: () => void;
  update: Update; onCaptionClick: () => void; projectId: string; duration: number;
}) {
  const { t } = useTranslation();
  const [framing, setFraming] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const time = useRef<HTMLSpanElement>(null);
  const [W, H] = ASPECT_SIZE[clip.layout.aspect];
  const area = useRef<HTMLElement>(null);
  const avail = useSize(area);
  // maior tamanho que cabe mantendo a proporção do formato
  const ph = Math.max(120, Math.floor(Math.min(avail.h - CONTROLS - 24, ((avail.w - 32) * H) / W)));
  const pw = Math.round((ph * W) / H);
  const input = useMemo(() => ({ chunks: chunkWords(outputWords(words, clip), clip.caption.wordsPerLine), caption: clip.caption }), [words, clip]);
  const [fontReady, setFontReady] = useState(0);
  useEffect(() => { void loadCaptionFont(clip.caption).then(() => setFontReady((n) => n + 1)); }, [clip.caption]);

  // desenho: o mesmo código do export (drawBase + drawOverlay)
  useEffect(() => {
    const c = canvas.current, o = overlay.current, v = player.video.current;
    if (framing || !c || !o || !v) return; // no modo enquadramento os canvas da prévia não estão na tela
    const dpr = window.devicePixelRatio || 1;
    c.width = o.width = Math.round(pw * dpr);
    c.height = o.height = Math.round(ph * dpr);
    const cb = c.getContext('2d')!, co = o.getContext('2d')!;
    const draw = (rel: number, out: number | null, idx: number) => {
      drawBase(cb, v, forCopy(clip, pieces[idx]?.g ?? 0), rel); // cada pedaço com o enquadramento da sua cópia
      drawOverlay(co, input, out ?? -1);
      if (time.current) time.current.textContent = `${fmtClock(out ?? 0)} / ${fmtClock(duration)}`;
    };
    draw(player.relNow(), player.outNow(), pieces.findIndex((p) => p.g === copy));
    return player.subscribe(draw);
  }, [clip, input, player, pw, ph, duration, fontReady, framing, pieces, copy]);

  // duplo clique na legenda: edita o texto da frase que está na tela (vira correção das palavras = wordEdits)
  const [editing, setEditing] = useState<{ words: Word[]; text: string } | null>(null);
  const nearCaption = (e: React.MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return Math.abs(((e.clientY - rect.top) / rect.height) * 100 - clip.caption.positionY) <= 9;
  };
  const editCaption = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!nearCaption(e)) return;
    const out = player.outNow();
    if (out === null) return;
    const ch = input.chunks.find((c) => out >= c.words[0].start - 0.05 && out <= c.words[c.words.length - 1].end + 0.3);
    if (!ch) return;
    player.video.current?.pause();
    setEditing({ words: ch.words, text: ch.words.map((w) => w.text).join(' ') });
  };
  const commitCaption = () => {
    if (!editing) return;
    const tokens = editing.text.trim().split(/\s+/).filter(Boolean);
    const ws = editing.words;
    // uma palavra digitada por palavra falada; sobrando, vão para a última; faltando, as últimas somem da legenda
    const edits = Object.fromEntries(ws.map((w, k) => [w.i, k < ws.length - 1 ? (tokens[k] ?? '') : tokens.slice(k).join(' ')]));
    update((c) => inCopy(c, copy, (v) => ({ ...v, wordEdits: { ...v.wordEdits, ...edits } }))); // só nesta cópia
    setEditing(null);
  };

  // arrastar a legenda muda a posição vertical
  const dragCaption = (e: React.PointerEvent<HTMLCanvasElement>) => {
    onCaptionClick();
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const y0 = ((e.clientY - rect.top) / rect.height) * 100;
    if (Math.abs(y0 - clip.caption.positionY) > 9) return; // só quando clica perto da legenda
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const y = Math.min(92, Math.max(8, ((ev.clientY - rect.top) / rect.height) * 100));
      update((c) => ({ ...c, caption: { ...c.caption, positionY: Math.round(y) } }), 'caption-drag');
    };
    const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };

  return (
    <section ref={area} aria-label={t('editor.previewLabel')} className="flex min-h-0 min-w-0 flex-col items-center justify-center gap-3 overflow-hidden bg-bg p-3">
      {framing ? (
        <FramingView clip={forCopy(clip, copy)} src={src} player={player} update={(fn, m) => update((c) => inCopy(c, copy, fn), m)} projectId={projectId} onDone={() => setFraming(false)} maxW={avail.w - 32} maxH={avail.h - CONTROLS - 24} />
      ) : (
        <div className="relative shrink-0 overflow-hidden rounded-panel border border-border bg-black" style={{ width: pw, height: ph }}>
          <canvas ref={canvas} className="absolute inset-0 size-full" />
          <canvas ref={overlay} onPointerDown={dragCaption} onDoubleClick={editCaption} title={t('editor.captionEditHint')} className="absolute inset-0 size-full cursor-ns-resize" />
          {editing && (
            <label className="absolute inset-x-[5%] flex -translate-y-1/2 items-center gap-2 rounded-input border border-primary bg-surface/95 px-2 shadow-lg" style={{ top: `${clip.caption.positionY}%` }}>
              <Pencil size={16} strokeWidth={1.75} aria-hidden="true" className="shrink-0 text-muted" />
              <span className="sr-only">{t('editor.captionEdit')}</span>
              <input autoFocus value={editing.text} onChange={(e) => setEditing({ ...editing, text: e.target.value })}
                onFocus={(e) => e.currentTarget.select()} onBlur={commitCaption}
                onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') commitCaption(); if (e.key === 'Escape') setEditing(null); }}
                className="h-10 min-w-0 flex-1 bg-transparent text-[15px] font-semibold text-text outline-none" />
            </label>
          )}
          {safe && <SafeAreas />}
        </div>
      )}
      <div className="flex items-center gap-1">
        <IconButton icon={SkipBack} label={t('editor.toStart')} onClick={() => player.seekOut(0)} />
        <IconButton icon={StepBack} label={t('editor.prevFrame')} onClick={() => { const o = player.outNow(); if (o === null) player.seekRel(player.relNow() - 1 / 30); else player.seekOut(o - 1 / 30); }} />
        <button onClick={player.toggle} aria-label={playing ? t('editor.pause') : t('editor.play')} title={playing ? t('editor.pause') : t('editor.play')}
          className="flex size-11 cursor-pointer items-center justify-center rounded-full bg-primary text-on-primary hover:brightness-110">
          {playing ? <Pause size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" className="ml-0.5" />}
        </button>
        <IconButton icon={StepForward} label={t('editor.nextFrame')} onClick={() => { const o = player.outNow(); if (o === null) player.seekRel(player.relNow() + 1 / 30); else player.seekOut(o + 1 / 30); }} />
        <span ref={time} className="ml-2 w-28 font-mono text-[12px] text-muted" />
        <IconButton icon={Grid2x2} label={t('editor.safe')} active={safe} onClick={onSafe} />
        {clip.layout.mode === 'single' && !framing && <Button icon={Crosshair} className="ml-2 h-9" onClick={() => setFraming(true)}>{t('editor.framing')}</Button>}
      </div>
    </section>
  );
}

/** Áreas cobertas pela interface do TikTok/Reels (aproximadas). */
function SafeAreas() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      <div className="absolute inset-x-0 top-0 h-[12%] border-b border-dashed border-warning/80 bg-warning/10" />
      <div className="absolute inset-x-0 bottom-0 h-[20%] border-t border-dashed border-warning/80 bg-warning/10" />
      <div className="absolute top-[12%] right-0 bottom-[20%] w-[15%] border-l border-dashed border-warning/80 bg-warning/10" />
    </div>
  );
}

/** Original inteiro com a janela de recorte por cima: arrastar (ou setas) cria keyframe no instante atual. */
function FramingView({ clip, src, player, update, projectId, onDone, maxW, maxH }: { clip: Clip; src: { width: number; height: number }; player: Player; update: Update; projectId: string; onDone: () => void; maxW: number; maxH: number }) {
  const { t } = useTranslation();
  const canvas = useRef<HTMLCanvasElement>(null);
  const win = useRef<HTMLDivElement>(null);
  // cabe junto com a dica e os botões (~110 px) no espaço da prévia
  const BW = Math.max(200, Math.floor(Math.min(maxW, ((maxH - 110) * src.width) / src.height))), BH = Math.round((BW * src.height) / src.width);
  const zoom = clip.reframe[0]?.zoom ?? 1;
  const r0 = cropRect(src.width, src.height, clip.layout.aspect, 0.5, 0.5, zoom);
  const ww = (r0.sw / src.width) * BW, wh = (r0.sh / src.height) * BH;

  useEffect(() => {
    const c = canvas.current!, v = player.video.current!;
    c.width = BW; c.height = BH;
    const ctx = c.getContext('2d')!;
    const draw = (rel: number) => {
      if (v.videoWidth) ctx.drawImage(v, 0, 0, BW, BH);
      const { x, y } = reframeAt(clip.reframe, rel);
      const r = cropRect(src.width, src.height, clip.layout.aspect, x, y, zoom);
      if (win.current) win.current.style.transform = `translate(${(r.sx / src.width) * BW}px, ${(r.sy / src.height) * BH}px)`;
    };
    draw(player.relNow());
    return player.subscribe(draw);
  }, [clip, player, src, zoom, BW, BH]);

  /** Grava (ou atualiza) o keyframe manual no instante atual. */
  const setKey = (x: number, y: number) => update((c) => {
    const rel = player.relNow();
    const kf: ReframeKeyframe = { t: Math.max(0, rel), x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)), zoom, ease: 'smooth', auto: false };
    const rest = c.reframe.filter((k) => Math.abs(k.t - kf.t) > 0.25);
    return { ...c, reframe: [...rest, kf].sort((a, b) => a.t - b.t) };
  }, 'framing');

  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const box = canvas.current!.getBoundingClientRect();
    e.currentTarget.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => setKey((ev.clientX - box.left) / box.width, (ev.clientY - box.top) / box.height);
    const el = e.currentTarget;
    const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };
  const onKey = (e: React.KeyboardEvent) => {
    const d = { ArrowLeft: [-0.01, 0], ArrowRight: [0.01, 0], ArrowUp: [0, -0.01], ArrowDown: [0, 0.01] }[e.key];
    if (!d) return;
    e.preventDefault(); e.stopPropagation();
    const { x, y } = reframeAt(clip.reframe, player.relNow());
    setKey(x + d[0], y + d[1]);
  };
  const single = (x: number, y: number) => update((c) => ({ ...c, reframe: [{ t: 0, x, y, zoom, ease: 'smooth', auto: false }] }));

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative shrink-0 overflow-hidden rounded-panel border border-border bg-black" style={{ width: BW, height: BH }}>
        <canvas ref={canvas} className="absolute inset-0 size-full opacity-60" />
        <div ref={win} role="slider" tabIndex={0} aria-label={t('editor.framingWindow')} aria-valuetext={t('editor.framingHint')}
          onPointerDown={onDown} onKeyDown={onKey}
          className="absolute top-0 left-0 cursor-move rounded-input border-2 border-primary shadow-[0_0_0_9999px_rgba(11,11,15,0.55)]"
          style={{ width: ww, height: wh }} />
        {clip.reframe.map((k, i) => !k.auto && <span key={i} aria-hidden="true" className="absolute top-1 size-2 rotate-45 bg-primary" style={{ left: `${((k.t) / (clip.out - clip.in)) * 100}%` }} />)}
      </div>
      <p className="text-[12px] text-muted">{t('editor.framingHint')}</p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button icon={Focus} className="h-9" onClick={async () => { const auto = await window.cortai.clips.autoReframe(projectId, clip.id); update((c) => ({ ...c, reframe: auto.map((k) => ({ ...k, zoom })) })); }}>{t('editor.follow')}</Button>
        <Button icon={Pin} className="h-9" onClick={() => { const { x, y } = reframeAt(clip.reframe, player.relNow()); single(x, y); }}>{t('editor.pin')}</Button>
        <Button icon={LocateFixed} className="h-9" onClick={() => single(0.5, 0.5)}>{t('editor.center')}</Button>
        <Button variant="primary" className="h-9" onClick={onDone}>{t('editor.framingDone')}</Button>
      </div>
    </div>
  );
}
