import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, Eye, EyeOff, Pencil } from 'lucide-react';
import { clipPieces, cutWords, forCopy, inCopy, inCopyAt, outStart, restoreWords, setIn, setOut } from '@shared/timeline';
import type { Clip, Word } from '@shared/types';
import { fmtClock } from '../components/ui';
import { isTyping, type Player } from './Editor';

type Update = (fn: (c: Clip) => Clip, merge?: string) => void;

/** Transcrição da cópia sob o playhead (copy; 0 = original): cortar, recolocar e corrigir valem só para ela. */
export function TranscriptPanel({ clip, words, player, selection, onSelect, update, copy, copyName }: {
  clip: Clip; words: Word[]; player: Player; selection: [number, number] | null; onSelect: (s: [number, number] | null) => void; update: Update; copy: number; copyName: number;
}) {
  const edits = forCopy(clip, copy).wordEdits;
  const inCut = (c: Clip, w: Word) => !inCopyAt(c, copy, (w.start + w.end) / 2);
  const pieces = useMemo(() => clipPieces(clip), [clip]);
  /** Vai até a palavra dentro desta cópia (o mesmo trecho pode tocar em outras). */
  const seekWord = (t: number) => {
    const rel = t - clip.in;
    const k = pieces.findIndex((p) => p.g === copy && rel >= p.a && rel <= p.b);
    if (k < 0) return player.seekRel(rel);
    player.seekOut(outStart(pieces.map((p): [number, number] => [p.a, p.b]), k) + rel - pieces[k].a);
  };
  const { t } = useTranslation();
  const [context, setContext] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [active, setActive] = useState(-1);
  const drag = useRef<number | null>(null);
  const box = useRef<HTMLDivElement>(null);

  const inside = (w: Word) => w.end > clip.in + 0.05 && w.start < clip.out - 0.05;
  const shown = context ? words : words.filter(inside);
  // parágrafos: quebra em pausa longa ou fim de frase
  const paras = useMemo(() => {
    const out: Word[][] = [];
    shown.forEach((w, k) => {
      const prev = shown[k - 1];
      if (!prev || w.start - prev.end > 1.2 || (/[.!?…]$/.test(prev.text) && out[out.length - 1].length > 25) || inside(prev) !== inside(w)) out.push([]);
      out[out.length - 1].push(w);
    });
    return out;
  }, [shown]); // eslint-disable-line react-hooks/exhaustive-deps

  // palavra falada agora (só re-renderiza quando muda)
  useEffect(() => player.subscribe((rel) => {
    const tt = clip.in + rel;
    let lo = 0, hi = words.length - 1, idx = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (words[m].start <= tt) { idx = m; lo = m + 1; } else hi = m - 1; }
    const i = idx >= 0 && tt <= words[idx].end + 0.3 ? words[idx].i : -1;
    setActive((a) => (a === i ? a : i));
  }), [player, words, clip.in]);

  useEffect(() => { // mantém a palavra ativa visível
    box.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  // Delete corta a seleção; se ela já está toda cortada, recoloca
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!selection || (e.key !== 'Delete' && e.key !== 'Backspace')) return;
      if (isTyping(e.target as HTMLElement)) return;
      e.preventDefault();
      const sel = words.filter((w) => w.i >= selection[0] && w.i <= selection[1]);
      if (!sel.length) return;
      const range: [number, number] = [sel[0].start, sel[sel.length - 1].end];
      update((c) => (sel.every((w) => inCut(c, w)) ? restoreWords(c, copy, range) : cutWords(c, copy, range)));
      onSelect(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selection, words, update, onSelect, copy]); // eslint-disable-line react-hooks/exhaustive-deps

  const extendTo = (w: Word) => update((c) => (w.start < c.in ? setIn(c, w.start - 0.1) : setOut(c, w.end + 0.15)));
  const sel = (i: number) => selection && i >= selection[0] && i <= selection[1];

  return (
    <section aria-label={t('editor.transcript')} className="flex min-h-0 flex-col border-r border-border">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <h2 className="flex items-center gap-2 text-[12px] font-semibold tracking-wide text-muted uppercase">
          {t('editor.transcript')}
          {copyName > 0 && <span className="flex items-center gap-1 whitespace-nowrap rounded-full bg-ai/20 px-2 py-0.5 text-[11px] font-medium tracking-normal text-text normal-case" title={t('editor.copyHint')}><Copy size={11} aria-hidden="true" />{t('editor.copyN', { n: copyName })}</span>}
        </h2>
        <button onClick={() => setContext(!context)} className="flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap text-[12px] text-muted hover:text-text">
          {context ? <EyeOff size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}{context ? t('editor.hideContext') : t('editor.context')}
        </button>
      </div>
      <p className="border-b border-border px-4 py-2 text-[11px] leading-snug text-muted">{t('editor.hint')}</p>
      <div ref={box} className="min-h-0 flex-1 overflow-auto px-4 py-3 text-[14px] leading-7" onMouseUp={() => (drag.current = null)} onMouseLeave={() => (drag.current = null)}>
        {paras.map((p) => {
          const out = !inside(p[0]);
          return (
            <p key={p[0].i} className={`mb-3 ${out ? 'cursor-pointer text-muted/50 hover:text-muted' : ''}`} title={out ? t('editor.extendHint') : undefined}
              onClick={out ? () => extendTo(p[0].start < clip.in ? p[0] : p[p.length - 1]) : undefined}>
              <button className="mr-2 cursor-pointer font-mono text-[11px] text-muted hover:text-primary" onClick={(e) => { e.stopPropagation(); seekWord(p[0].start); }}>
                {fmtClock(Math.max(0, p[0].start - clip.in))}
              </button>
              {p.map((w) => out ? <span key={w.i}>{edits[w.i] ?? w.text} </span> : editing === w.i ? (
                <input key={w.i} autoFocus defaultValue={edits[w.i] ?? w.text} aria-label={t('editor.editWord')}
                  className="w-24 rounded-input border border-primary bg-surface-2 px-1 text-[14px]"
                  onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== (edits[w.i] ?? w.text)) update((c) => inCopy(c, copy, (x) => ({ ...x, wordEdits: { ...x.wordEdits, [w.i]: v } }))); setEditing(null); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setEditing(null); }} />
              ) : (
                <WordSpan key={w.i} w={w} text={edits[w.i] ?? w.text} edited={w.i in edits} cut={inCut(clip, w)} active={w.i === active} selected={!!sel(w.i)}
                  onDown={(e) => { if (e.shiftKey && selection) onSelect([Math.min(selection[0], w.i), Math.max(selection[1], w.i)]); else { drag.current = w.i; onSelect([w.i, w.i]); } }}
                  onEnter={() => { if (drag.current !== null) onSelect([Math.min(drag.current, w.i), Math.max(drag.current, w.i)]); }}
                  onClick={() => seekWord(w.start)}
                  onDouble={() => setEditing(w.i)} />
              ))}
            </p>
          );
        })}
      </div>
    </section>
  );
}

const WordSpan = memo(function WordSpan({ text, edited, cut, active, selected, onDown, onEnter, onClick, onDouble }: {
  w: Word; text: string; edited: boolean; cut: boolean; active: boolean; selected: boolean;
  onDown: (e: React.MouseEvent) => void; onEnter: () => void; onClick: () => void; onDouble: () => void;
}) {
  return (
    <span data-active={active} onMouseDown={onDown} onMouseEnter={onEnter} onClick={onClick} onDoubleClick={onDouble}
      className={`cursor-text rounded-[3px] px-[1px] ${cut ? 'text-muted line-through decoration-danger/70' : ''} ${selected ? 'bg-ai/35' : active ? 'bg-primary/25 text-text' : ''} ${edited ? 'underline decoration-ai decoration-dotted underline-offset-4' : ''}`}>
      {text}{edited && <Pencil size={9} aria-hidden="true" className="ml-0.5 inline align-super text-ai" />}{' '}
    </span>
  );
});
