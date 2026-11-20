import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Check, Download, Keyboard, Loader2, Redo2, Undo2 } from 'lucide-react';
import { clipPieces, locateOut, normalizeClip, outDuration, outStart, setIn, setOut, type Piece, type Seg } from '@shared/timeline';
import type { Clip, Word } from '@shared/types';
import type { Route } from '../app/data';
import { Button, IconButton, Modal, ScoreRing } from '../components/ui';
import { useHistory } from './history';
import { Inspector, type Tab } from './Inspector';
import { Preview } from './Preview';
import { Timeline } from './Timeline';
import { TranscriptPanel } from './TranscriptPanel';

/** rel = segundos desde clip.in no original; out = segundos no vídeo final (null fora da lista de edição); idx = pedaço (-1 fora). */
export type Sub = (fn: (rel: number, out: number | null, idx: number) => void) => () => void;
export interface Player {
  video: React.RefObject<HTMLVideoElement | null>;
  subscribe: Sub;
  seekRel: (rel: number) => void;
  seekOut: (out: number) => void;
  toggle: () => void;
  relNow: () => number;
  outNow: () => number | null;
}

const FRAME = 1 / 30;
const TEXT_INPUTS = new Set(['text', 'number', 'search', 'url', 'email', 'password', 'tel']);
/** Só campos de digitação bloqueiam os atalhos (radio, checkbox, slider e cor não). */
export const isTyping = (el: HTMLElement) =>
  el.isContentEditable || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || (el.tagName === 'INPUT' && TEXT_INPUTS.has((el as HTMLInputElement).type));

export function Editor({ projectId, clipId, go }: { projectId: string; clipId: string; go: (r: Route) => void }) {
  const [data, setData] = useState<{ clip: Clip; words: Word[]; proxy: string; src: { width: number; height: number }; peaks: number[] } | null>(null);
  useEffect(() => {
    Promise.all([window.cortai.clips.get(projectId, clipId), window.cortai.projects.transcript(projectId), window.cortai.projects.get(projectId), window.cortai.projects.peaks(projectId)])
      .then(([clip, tr, p, peaks]) => setData({ clip, words: tr.words, proxy: p.proxy, src: p.project.source, peaks }));
  }, [projectId, clipId]);
  if (!data) return null;
  return <EditorLoaded key={clipId} {...data} projectId={projectId} go={go} />;
}

function EditorLoaded({ clip: initial, words, proxy, src, peaks, projectId, go }: {
  clip: Clip; words: Word[]; proxy: string; src: { width: number; height: number }; peaks: number[]; projectId: string; go: (r: Route) => void;
}) {
  const { t } = useTranslation();
  const save = useCallback((c: Clip) => window.cortai.clips.save(c), []);
  const h = useHistory<Clip>(useMemo(() => normalizeClip(initial), [initial]), save);
  const clip = h.value;
  const clipRef = useRef(clip);
  clipRef.current = clip;
  const video = useRef<HTMLVideoElement>(null);
  const listeners = useRef(new Set<(rel: number, out: number | null, idx: number) => void>());
  const [tab, setTab] = useState<Tab>('caption');
  const [selection, setSelection] = useState<[number, number] | null>(null); // índices de palavra (inclusivo)
  const [safe, setSafe] = useState(false);
  const [help, setHelp] = useState(false);
  const [note, setNote] = useState('');
  const [playing, setPlaying] = useState(false);

  // palavras na janela do corte (+ contexto de 30 s para estender)
  const nearby = useMemo(() => words.filter((w) => w.end > clip.in - 31 && w.start < clip.out + 31), [words, clip.in, clip.out]);

  // relógio único do editor: rAF lê o vídeo, segue a lista de edição (pula cortes, volta para tocar cópias)
  // e avisa quem desenha (sem re-render do React). idx = pedaço atual: o mesmo instante do original pode tocar 2×.
  const pieces = useMemo(() => clipPieces(clip), [clip]);
  const piecesRef = useRef<Piece[]>(pieces);
  piecesRef.current = pieces;
  const list = useMemo(() => pieces.map((p): Seg => [p.a, p.b]), [pieces]);
  // cópia sob o playhead: transcrição, legenda na prévia e enquadramento editam só ela
  const [copy, setCopy] = useState(0);
  const [curEntry, setCurEntry] = useState(-1); // pedaço sob o playhead (índice em clip.order)
  const [selEntries, setSelEntries] = useState<number[]>([]); // pedaços selecionados na timeline
  const copyNames = useMemo(() => { const m = new Map<number, number>(); pieces.forEach((p) => { if (p.g && !m.has(p.g)) m.set(p.g, m.size + 1); }); return m; }, [pieces]);
  const listRef = useRef<Seg[]>(list);
  listRef.current = list;
  const idx = useRef(0);
  const outNow = useRef<number | null>(0);
  const inside = (sg: Seg | undefined, rel: number) => !!sg && rel >= sg[0] - 0.02 && rel <= sg[1] + 0.02;
  const emit = useCallback((force = false) => {
    const v = video.current, c = clipRef.current, l = listRef.current;
    if (!v) return;
    const rel = v.currentTime - c.in;
    if (!inside(l[idx.current], rel)) idx.current = l.findIndex((sg) => inside(sg, rel));
    const sg = l[idx.current];
    const out = sg ? outStart(l, idx.current) + Math.min(sg[1], Math.max(sg[0], rel)) - sg[0] : null;
    const pc = piecesRef.current[idx.current];
    if (pc) { setCopy((x) => (x === pc.g ? x : pc.g)); setCurEntry((x) => (x === pc.entry ? x : pc.entry)); }
    if (force || out !== outNow.current || !v.paused) { outNow.current = out; listeners.current.forEach((fn) => fn(rel, out, idx.current)); }
  }, []);
  useEffect(() => {
    let id = 0;
    const loop = () => {
      const v = video.current, c = clipRef.current, l = listRef.current;
      if (v && v.readyState >= 2) {
        const rel = v.currentTime - c.in;
        if (!v.paused) {
          const sg = inside(l[idx.current], rel) ? l[idx.current] : undefined;
          if (!sg) { // tocando fora da lista (num corte): vai para o próximo pedaço
            const n = l.findIndex((x) => x[0] > rel);
            if (n >= 0) { idx.current = n; v.currentTime = c.in + l[n][0]; } else v.pause();
          } else if (rel >= sg[1] - 0.005) { // fim do pedaço: o seguinte pode estar em qualquer lugar do original
            if (idx.current + 1 < l.length) { idx.current++; v.currentTime = c.in + l[idx.current][0]; } else v.pause();
          }
        }
        const mute = !!piecesRef.current[idx.current]?.muted; // pedaço silenciado na timeline
        if (v.muted !== mute) v.muted = mute;
        emit();
      }
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [emit]);
  // edição mudou: redesenha mesmo pausado
  useEffect(() => { emit(true); }, [clip, emit]);

  const player: Player = useMemo(() => ({
    video,
    subscribe: (fn) => { listeners.current.add(fn); return () => { listeners.current.delete(fn); }; },
    seekRel: (rel) => {
      const v = video.current, c = clipRef.current;
      if (!v) return;
      idx.current = listRef.current.findIndex((sg) => inside(sg, rel)); // 1ª vez que esse instante toca
      v.currentTime = c.in + Math.max(-30, Math.min(rel, c.out - c.in + 30));
    },
    seekOut: (out) => {
      const v = video.current, c = clipRef.current, l = listRef.current;
      if (!v || !l.length) return;
      const r = locateOut(l, Math.max(0, Math.min(out, outDuration(l))));
      idx.current = r.idx;
      v.currentTime = c.in + r.rel;
    },
    relNow: () => (video.current?.currentTime ?? 0) - clipRef.current.in,
    outNow: () => outNow.current,
    toggle: () => {
      const v = video.current;
      if (!v) return;
      if (!v.paused) return v.pause();
      const o = outNow.current, l = listRef.current;
      if (o === null || o >= outDuration(l) - 0.05) { const r = locateOut(l, 0); idx.current = r.idx; v.currentTime = clipRef.current.in + r.rel; }
      void v.play();
    },
  }), []);

  const doExport = useCallback(async () => {
    await window.cortai.clips.save(clipRef.current);
    await window.cortai.clips.export(projectId, [clipRef.current.id]);
    setNote(t('editor.exported'));
  }, [projectId, t]);

  // atalhos (SPEC §7.5); ignorados enquanto se digita
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (isTyping(el)) return;
      // botão/controle focado: Espaço e Enter ficam com o próprio controle
      if ((e.key === ' ' || e.key === 'Enter') && el.closest('button, [role="slider"], [role="tab"], input, label')) return;
      const ctrl = e.ctrlKey || e.metaKey;
      const v = video.current;
      const c = clipRef.current;
      const rel = player.relNow();
      const step = (d: number) => { const o = player.outNow(); if (o === null) player.seekRel(rel + d); else player.seekOut(o + d); };
      const near = words.filter((w) => w.start >= c.in - 0.05 && w.end <= c.out + 0.05);
      const k = e.key.toLowerCase();
      let handled = true;
      if (ctrl && k === 'z') (e.shiftKey ? h.redo : h.undo)();
      else if (ctrl && k === 'y') h.redo();
      else if (ctrl && k === 'e') void doExport();
      else if (e.key === ' ') player.toggle();
      else if (e.key === 'ArrowLeft' && e.shiftKey) step(-5)
      else if (e.key === 'ArrowRight' && e.shiftKey) step(5)
      else if (e.key === 'Home') { v?.pause(); player.seekOut(0); }
      else if (e.key === 'End') { v?.pause(); player.seekOut(outDuration(listRef.current)); }
      else if (e.key === 'ArrowLeft' && e.altKey) { const w = [...near].reverse().find((x) => x.start < c.in + rel - 0.05); if (w) player.seekRel(w.start - c.in); }
      else if (e.key === 'ArrowRight' && e.altKey) { const w = near.find((x) => x.start > c.in + rel + 0.05); if (w) player.seekRel(w.start - c.in); }
      else if (e.key === 'ArrowLeft') { v?.pause(); step(-FRAME); }
      else if (e.key === 'ArrowRight') { v?.pause(); step(FRAME); }
      else if (k === 'i' && !ctrl) h.update((x) => setIn(x, x.in + rel));
      else if (k === 'o' && !ctrl) h.update((x) => setOut(x, x.in + rel));
      else if (k === 'j') step(-2);
      else if (k === 'k') v?.pause();
      else if (k === 'l') void v?.play();
      else if (k === 'g') setSafe((s) => !s);
      else if (e.key === '?') setHelp(true);
      else handled = false;
      if (handled) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [h, player, words, doExport]);

  const dur = outDuration(list);

  return (
    <div className="flex h-full flex-col">
      <video ref={video} src={window.cortai.mediaUrl(proxy)} preload="auto" playsInline aria-hidden="true" tabIndex={-1}
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
        onLoadedMetadata={(e) => { e.currentTarget.currentTime = clipRef.current.in + (listRef.current[0]?.[0] ?? 0); }}
        className="pointer-events-none absolute size-px opacity-0" />

      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4">
        <IconButton icon={ArrowLeft} label={t('editor.back')} onClick={() => go({ name: 'results', id: projectId })} />
        <h1 className="min-w-0 truncate font-display text-[15px] font-semibold">{clip.title}</h1>
        <ScoreRing score={clip.score} size={30} />
        <div className="ml-auto flex items-center gap-1">
          {note && <span role="status" className="mr-2 text-[12px] text-primary">{note}</span>}
          <IconButton icon={Undo2} label={t('editor.undo')} onClick={h.undo} disabled={!h.canUndo} />
          <IconButton icon={Redo2} label={t('editor.redo')} onClick={h.redo} disabled={!h.canRedo} />
          <span className="mx-2 flex w-20 items-center gap-1 text-[12px] text-muted" role="status">
            {h.saved ? <><Check size={14} aria-hidden="true" className="text-success" />{t('editor.saved')}</> : <><Loader2 size={14} aria-hidden="true" className="animate-spin motion-reduce:animate-none" />{t('editor.saving')}</>}
          </span>
          <IconButton icon={Keyboard} label={t('editor.shortcuts')} onClick={() => setHelp(true)} />
          <Button variant="primary" icon={Download} onClick={doExport} className="ml-1 h-9">{t('editor.export')}</Button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[300px_1fr_330px]">
        <TranscriptPanel clip={clip} words={nearby} player={player} selection={selection} onSelect={setSelection} update={h.update} copy={copy} copyName={copyNames.get(copy) ?? 0} />
        <Preview clip={clip} words={words} src={src} player={player} copy={copy} pieces={pieces} playing={playing} safe={safe} onSafe={() => setSafe((s) => !s)}
          update={h.update} onCaptionClick={() => setTab('caption')} projectId={projectId} duration={dur} />
        <Inspector clip={clip} tab={tab} onTab={setTab} update={h.update} copy={copy}
          targets={selEntries.length ? selEntries : curEntry >= 0 ? [curEntry] : []}
          targetsLabel={selEntries.length ? t('editor.frameTargetsSel', { count: selEntries.length }) : t('editor.frameTargetCur', { n: curEntry + 1 })} />
      </div>

      <Timeline clip={clip} words={words} peaks={peaks} player={player} update={h.update} wordSelected={!!selection} onPick={() => setSelection(null)} onSelection={setSelEntries} />

      <Modal open={help} onClose={() => setHelp(false)} labelledBy="sc-title" className="w-[520px]">
        <div className="max-h-[80vh] overflow-y-auto p-6">
          <h2 id="sc-title" className="mb-4 font-display text-lg font-semibold">{t('editor.shortcutsTitle')}</h2>
          <dl className="grid grid-cols-[150px_1fr] gap-x-4 gap-y-2 text-[13px]">
            {([['Espaço', 'play'], ['← / →', 'frame'], ['Shift + ← / →', 'jump'], ['Alt + ← / →', 'word'], ['Home / End', 'ends'], ['I / O', 'inout'], ['J / K / L', 'jkl'],
              ['S', 'split'], ['Q / W', 'splitSide'], ['Delete', 'del'], ['Ctrl+D', 'dup'], ['Ctrl+C / Ctrl+V', 'copy'], ['M', 'mute'], ['B', 'mark'], ['N', 'snap'], ['Ctrl+A', 'all'], ['Shift / Ctrl + clique', 'multi'], ['Esc', 'deselect'],
              ['Ctrl+Z / Ctrl+Shift+Z', 'undo'], ['Ctrl+E', 'export'], ['G', 'safe'], ['Ctrl + roda do mouse', 'zoom'], ['?', 'help']] as const).map(([key, d]) => (
              <div key={d} className="contents"><dt><kbd className="rounded-input border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[12px]">{key}</kbd></dt><dd className="text-muted">{t(`editor.sc.${d}`)}</dd></div>
            ))}
          </dl>
        </div>
      </Modal>
    </div>
  );
}
