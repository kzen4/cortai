import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, CheckSquare, Copy, Download, FileText, Hash, Pencil, Star, Trash2, Type, X } from 'lucide-react';
import { chunkWords } from '@shared/captions';
import { clipWords } from '@shared/clipWords';
import { clipPieces, forCopy, outDuration, outStart, outputWords, type Seg } from '@shared/timeline';
import { drawBase } from '../overlay/composite';
import type { Clip, Project, Word } from '@shared/types';
import { ASPECT_SIZE } from '@shared/constants';
import type { Route } from '../app/data';
import { Button, Field, IconButton, ScoreRing, fmtClock, inputCls, scoreTier, textareaCls } from '../components/ui';
import { drawOverlay, loadCaptionFont } from '../overlay/drawOverlay';

export function Results({ id, go }: { id: string; go: (r: Route) => void }) {
  const { t } = useTranslation();
  const [data, setData] = useState<{ project: Project; clips: Clip[]; proxy: string } | null>(null);
  const [words, setWords] = useState<Word[]>([]);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const load = useCallback(() => window.cortai.projects.get(id).then(setData), [id]);
  useEffect(() => {
    load();
    window.cortai.projects.transcript(id).then((tr) => setWords(tr.words));
  }, [id, load]);

  if (!data) return null;
  const clips = [...data.clips].sort((a, b) => b.score - a.score);
  const openClip = clips.find((c) => c.id === open);

  const save = async (c: Clip) => { await window.cortai.clips.save(c); setData({ ...data, clips: data.clips.map((x) => (x.id === c.id ? c : x)) }); };
  const exportClips = async (ids: string[]) => {
    await window.cortai.clips.export(id, ids);
    setNote(t('results.queued'));
    setSelecting(false);
    setSelected(new Set());
  };
  const toggle = (cid: string) => setSelected((s) => { const n = new Set(s); n.has(cid) ? n.delete(cid) : n.add(cid); return n; });

  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col gap-5 overflow-auto px-8 py-6">
        <header className="flex flex-wrap items-center gap-3">
          <IconButton icon={ArrowLeft} label={t('results.back')} onClick={() => go({ name: 'home' })} />
          <h1 className="min-w-0 truncate font-display text-xl font-bold">{data.project.name}</h1>
          <span className="text-muted">{t('results.count', { count: clips.length })}</span>
          <div className="ml-auto flex gap-2">
            <Button icon={CheckSquare} variant={selecting ? 'primary' : 'secondary'} onClick={() => { setSelecting(!selecting); setSelected(new Set()); }}>
              {selecting ? t('results.selectDone') : t('results.select')}
            </Button>
            {!selecting && clips.length > 0 && <Button icon={Download} onClick={() => exportClips(clips.map((c) => c.id))}>{t('results.exportAll')}</Button>}
          </div>
        </header>
        {note && <p role="status" className="rounded-button border border-primary/30 bg-primary/10 px-4 py-2">{note} <button className="ml-2 cursor-pointer underline" onClick={() => go({ name: 'exports' })}>{t('nav.exports')}</button></p>}

        {clips.length === 0 ? <p className="py-16 text-center text-muted">{t('results.empty')}</p> : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4 pb-20">
            {clips.map((c) => (
              <ClipCard key={c.id} clip={c} proxy={data.proxy} project={data.project} words={words}
                selecting={selecting} selected={selected.has(c.id)} active={open === c.id}
                onOpen={() => (selecting ? toggle(c.id) : setOpen(c.id))}
                onFavorite={() => save({ ...c, favorite: !c.favorite })}
                onEdit={() => go({ name: 'editor', projectId: id, clipId: c.id })}
                onExport={() => exportClips([c.id])}
                onDuplicate={async () => { await window.cortai.clips.duplicate(id, c.id); load(); }}
                onDelete={async () => { await window.cortai.clips.remove(id, c.id); if (open === c.id) setOpen(null); load(); }} />
            ))}
          </div>
        )}

        {selected.size > 0 && (
          <div className="fixed bottom-6 left-1/2 z-10 -translate-x-1/2 rounded-button border border-border bg-surface-2 p-2 shadow-2xl">
            <Button variant="primary" icon={Download} onClick={() => exportClips([...selected])}>{t('results.exportSel', { n: selected.size })}</Button>
          </div>
        )}
      </div>

      {openClip && <ClipPanel key={openClip.id} clip={openClip} words={words} onSave={save} onClose={() => setOpen(null)} onExport={() => exportClips([openClip.id])} />}
    </div>
  );
}

/** Card 9:16: miniatura parada no início do corte; ao passar o mouse toca em loop, seguindo o rosto e com a legenda. */
function ClipCard({ clip, proxy, project, words, selecting, selected, active, onOpen, onFavorite, onExport, onDuplicate, onDelete, onEdit }: {
  clip: Clip; proxy: string; project: Project; words: Word[]; selecting: boolean; selected: boolean; active: boolean;
  onOpen: () => void; onFavorite: () => void; onExport: () => void; onDuplicate: () => void; onDelete: () => void; onEdit: () => void;
}) {
  const { t } = useTranslation();
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const base = useRef<HTMLCanvasElement>(null);
  const [W, H] = ASPECT_SIZE[clip.layout.aspect];
  const input = useMemo(() => ({ chunks: chunkWords(outputWords(words, clip), clip.caption.wordsPerLine), caption: clip.caption }), [words, clip]);
  const pieces = useMemo(() => clipPieces(clip), [clip]);
  const segs = useMemo(() => pieces.map((p): Seg => [p.a, p.b]), [pieces]);
  const dur = outDuration(segs);
  const startAt = clip.in + (segs[0]?.[0] ?? 0);
  const idx = useRef(0); // pedaço atual (o mesmo instante do original pode tocar 2×)
  const inSeg = (i: number, rel: number) => !!segs[i] && rel >= segs[i][0] - 0.02 && rel <= segs[i][1] + 0.02;

  // mesmo desenho do editor e do export (drawBase + drawOverlay), pulando os trechos cortados
  const paint = useCallback(() => {
    const v = video.current, c = canvas.current, b = base.current;
    if (!v || !c || !b || !v.videoWidth) return;
    const rel = v.currentTime - clip.in;
    if (!inSeg(idx.current, rel)) idx.current = segs.findIndex((_, i) => inSeg(i, rel));
    const i = idx.current;
    drawBase(b.getContext('2d')!, v, forCopy(clip, pieces[i]?.g ?? 0), rel); // enquadramento da cópia do pedaço
    drawOverlay(c.getContext('2d')!, input, i >= 0 ? outStart(segs, i) + rel - segs[i][0] : -1);
  }, [clip, input, segs]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const v = video.current!;
    const c = canvas.current!, b = base.current!;
    c.width = b.width = Math.round(W / 4); c.height = b.height = Math.round(H / 4);
    let id = 0;
    const loop = () => {
      const rel = v.currentTime - clip.in;
      if (!inSeg(idx.current, rel)) { // num corte: próximo pedaço (ou recomeça)
        const n = segs.findIndex(([a]) => a > rel);
        idx.current = Math.max(0, n);
        v.currentTime = clip.in + (segs[idx.current]?.[0] ?? 0);
      } else if (rel >= segs[idx.current][1] - 0.005) { // fim do pedaço: segue a lista (pode voltar no original)
        idx.current = (idx.current + 1) % segs.length;
        v.currentTime = clip.in + segs[idx.current][0];
      }
      paint();
      id = v.requestVideoFrameCallback(loop);
    };
    const onMeta = () => { v.currentTime = startAt; };
    v.addEventListener('loadedmetadata', onMeta);
    v.addEventListener('seeked', paint);
    id = v.requestVideoFrameCallback(loop);
    loadCaptionFont(clip.caption).then(paint);
    return () => { v.cancelVideoFrameCallback(id); v.removeEventListener('loadedmetadata', onMeta); v.removeEventListener('seeked', paint); };
  }, [clip, paint, segs, startAt, W, H]);

  const play = () => { const v = video.current!; if (v.currentTime < clip.in || v.currentTime > clip.out) { idx.current = 0; v.currentTime = startAt; } void v.play(); };
  const stop = () => { const v = video.current!; v.pause(); idx.current = 0; v.currentTime = startAt; };

  return (
    <article className={`group flex flex-col overflow-hidden rounded-panel border bg-surface transition-colors duration-150 ${active || selected ? 'border-primary' : 'border-border hover:border-muted'}`}>
      <div className="relative cursor-pointer bg-black" style={{ aspectRatio: `${W} / ${H}` }}
        onMouseEnter={play} onMouseLeave={stop} onFocus={play} onBlur={stop} onClick={onOpen}
        role="button" tabIndex={0} aria-label={clip.title} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onOpen())}>
        <video ref={video} src={window.cortai.mediaUrl(proxy)} muted playsInline preload="metadata" aria-hidden="true" className="pointer-events-none absolute size-px opacity-0" />
        <canvas ref={base} aria-hidden="true" className="absolute inset-0 size-full" />
        <canvas ref={canvas} aria-hidden="true" className="pointer-events-none absolute inset-0 size-full" />
        <div className="absolute bottom-2 left-2"><ScoreRing score={clip.score} size={38} /></div>
        <span className="absolute right-2 bottom-2 rounded-input bg-black/70 px-1.5 py-0.5 font-mono text-[11px]">{fmtClock(dur)}</span>
        {selecting && (
          <input type="checkbox" checked={selected} onChange={onOpen} onClick={(e) => e.stopPropagation()} aria-label={t('results.selectClip')}
            className="absolute top-2 left-2 size-5 cursor-pointer accent-[var(--primary)]" />
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <span className={`text-[11px] font-semibold uppercase tracking-wide ${scoreTier(clip.score) === 'high' ? 'text-primary' : scoreTier(clip.score) === 'good' ? 'text-ai' : 'text-muted'}`}>
          {t(`results.tier.${scoreTier(clip.score)}`)}
        </span>
        <h3 className="line-clamp-2 font-medium leading-snug">{clip.title}</h3>
        <div className="mt-auto -mx-1.5 flex items-center pt-1">
          <IconButton icon={Star} label={clip.favorite ? t('results.unfavorite') : t('results.favorite')} active={clip.favorite} onClick={onFavorite} />
          <IconButton icon={Download} label={t('results.export')} onClick={onExport} />
          <IconButton icon={Pencil} label={t('results.edit')} onClick={onEdit} />
          <IconButton icon={Copy} label={t('results.duplicate')} onClick={onDuplicate} />
          <IconButton icon={Trash2} label={t('results.delete')} onClick={onDelete} className="ml-auto hover:text-danger" />
        </div>
      </div>
    </article>
  );
}

function ClipPanel({ clip, words, onSave, onClose, onExport }: { clip: Clip; words: Word[]; onSave: (c: Clip) => void; onClose: () => void; onExport: () => void }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState({ title: clip.title, description: clip.description, tags: clip.hashtags.map((h) => `#${h}`).join(' ') });
  const commit = () => onSave({ ...clip, title: draft.title.trim() || clip.title, description: draft.description.trim(),
    hashtags: draft.tags.split(/\s+/).map((h) => h.replace(/^#/, '')).filter(Boolean) });
  const text = clipWords(words, clip).map((w) => w.text).join(' ');
  return (
    <aside aria-label={t('results.details')} className="flex w-[380px] shrink-0 flex-col gap-5 overflow-auto border-l border-border bg-surface px-5 py-6">
      <header className="flex items-start gap-3">
        <ScoreRing score={clip.score} size={48} />
        <div className="min-w-0 flex-1">
          <p className="text-[12px] text-muted">{t('results.range', { a: fmtClock(clip.in), b: fmtClock(clip.out) })}</p>
          <p className="font-display font-semibold">{t(`results.tier.${scoreTier(clip.score)}`)}</p>
        </div>
        <IconButton icon={X} label={t('results.closePanel')} onClick={onClose} />
      </header>

      <section className="rounded-button border border-ai/30 bg-ai/10 p-3">
        <h3 className="mb-1 text-[12px] font-semibold text-ai">✦ {t('results.reason')}</h3>
        <p>{clip.reason}</p>
      </section>

      <section>
        <h3 className="mb-2 text-[12px] font-medium text-muted">{t('results.scores')}</h3>
        <dl className="flex flex-col gap-2">
          {(['hook', 'value', 'standalone', 'ending'] as const).map((k) => (
            <div key={k} className="grid grid-cols-[110px_1fr_28px] items-center gap-2">
              <dt className="text-[12px]">{t(`results.crit.${k}`)}</dt>
              <dd className="h-1.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full" style={{ width: `${clip.scores[k]}%`, background: 'var(--score-gradient)' }} /></dd>
              <dd className="text-right font-mono text-[12px]">{clip.scores[k]}</dd>
            </div>
          ))}
        </dl>
      </section>

      <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); commit(); }}>
        <Field label={t('results.titleF')} icon={Type}>
          <input className={inputCls} maxLength={60} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} onBlur={commit} />
        </Field>
        <Field label={t('results.descF')} icon={FileText}>
          <textarea className={textareaCls} rows={3} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} onBlur={commit} />
        </Field>
        <Field label={t('results.tagsF')} icon={Hash} hint={t('results.tagsHint')}>
          <input className={inputCls} value={draft.tags} onChange={(e) => setDraft({ ...draft, tags: e.target.value })} onBlur={commit} />
        </Field>
      </form>

      <section>
        <h3 className="mb-1 text-[12px] font-medium text-muted">{t('results.transcript')}</h3>
        <p className="max-h-48 overflow-auto rounded-button bg-surface-2 p-3 text-[13px] leading-relaxed select-text">{text}</p>
      </section>

      <Button variant="primary" icon={Download} onClick={onExport}>{t('results.export')}</Button>
    </aside>
  );
}
