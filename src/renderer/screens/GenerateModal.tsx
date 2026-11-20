import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Clock, Hash, Languages, Scissors, Sparkles, X } from 'lucide-react';
import { chunkWords } from '@shared/captions';
import { POC_DURATION, POC_WORDS } from '@shared/poc';
import { CAPTION_TEMPLATES, DEFAULT_TEMPLATE } from '@shared/templates';
import type { AspectRatio, GenerationSettings, SourceInfo } from '@shared/types';
import { Button, Field, IconButton, Modal, Segmented, fmtDuration, inputCls, selectCls, textareaCls } from '../components/ui';
import { drawOverlay, loadCaptionFont } from '../overlay/drawOverlay';

const DURATIONS: Record<string, GenerationSettings['targetDuration']> = { auto: 'auto', '<30s': [10, 30], '30–60s': [30, 60], '60–90s': [60, 90], '90s–3min': [90, 180] };
const CHIPS = ['fun', 'polemic', 'tips', 'stories', 'quotes'] as const;
const toSec = (s: string) => { const m = /^(\d+):([0-5]\d)$/.exec(s.trim()); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
const toClock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function GenerateModal({ sources, gpu, onClose, onCreated }: { sources: SourceInfo[]; gpu: boolean; onClose: () => void; onCreated: (ids: string[]) => void }) {
  const { t } = useTranslation();
  const first = sources[0];
  const [gen, setGen] = useState<GenerationSettings>({ language: 'auto', targetDuration: 'auto', maxClips: 'auto', aspect: '9:16', captionTemplateId: DEFAULT_TEMPLATE });
  const [start, setStart] = useState('0:00');
  const [end, setEnd] = useState(toClock(first.duration));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    window.cortai.settings.get().then((s) => s.lastGeneration && setGen({ ...s.lastGeneration, range: undefined, prompt: undefined }));
  }, []);

  const durKey = Object.keys(DURATIONS).find((k) => JSON.stringify(DURATIONS[k]) === JSON.stringify(gen.targetDuration)) ?? 'auto';
  const a = toSec(start), b = toSec(end);
  const rangeOk = a !== null && b !== null && a < b && b <= Math.ceil(first.duration);
  const minutes = ((b ?? first.duration) - (a ?? 0)) / 60;
  // estimativa grosseira: transcrição + LLM por janela de 3 min + reenquadramento (calibrar com benchmark depois)
  const estimate = Math.max(1, Math.round(sources.length * (gpu ? minutes * 0.35 + 1 : minutes * 1.2 + 2)));

  const addChip = (k: (typeof CHIPS)[number]) => {
    const txt = t(`gen.chipText.${k}`);
    const cur = gen.prompt?.trim() ?? '';
    if (!cur.includes(txt)) setGen({ ...gen, prompt: cur ? `${cur}, ${txt}` : txt.charAt(0).toUpperCase() + txt.slice(1) });
  };

  const submit = async () => {
    if (!rangeOk) return;
    setBusy(true);
    const full = a === 0 && b! >= Math.floor(first.duration);
    const ids: string[] = [];
    for (const src of sources) ids.push(await window.cortai.projects.create(src, { ...gen, range: sources.length === 1 && !full ? [a!, b!] : undefined, prompt: gen.prompt?.trim() || undefined }));
    onCreated(ids);
  };

  return (
    <Modal open onClose={onClose} labelledBy="gen-title" className="w-[880px] max-w-[95vw]">
      <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="flex flex-col gap-5 p-6">
        <header className="flex items-start justify-between gap-4">
          <h2 id="gen-title" className="min-w-0 truncate font-display text-[16px] font-semibold">
            {first.name}
            <span className="ml-2 font-ui text-[13px] font-normal text-muted">
              {sources.length > 1 ? t('gen.many', { count: sources.length }) : `${fmtDuration(first.duration)} · ${first.width}×${first.height} · ${Math.round(first.fps)} fps`}
            </span>
          </h2>
          <IconButton icon={X} label={t('gen.close')} type="button" onClick={onClose} />
        </header>

        <div className="grid grid-cols-[300px_1fr] gap-6">
          <div className="flex flex-col gap-3">
            <div className="aspect-video overflow-hidden rounded-panel border border-border bg-black">
              {first.path ? <video src={window.cortai.mediaUrl(first.path)} controls muted className="size-full object-contain" />
                : first.thumb ? <img src={first.thumb} alt="" className="size-full object-cover" /> : null}
            </div>
            {sources.length === 1 && (
              <div className="grid grid-cols-2 gap-2">
                <Field label={t('gen.start')} icon={Clock}><input className={inputCls} value={start} onChange={(e) => setStart(e.target.value)} inputMode="numeric" aria-invalid={!rangeOk} /></Field>
                <Field label={t('gen.end')} icon={Clock}><input className={inputCls} value={end} onChange={(e) => setEnd(e.target.value)} inputMode="numeric" aria-invalid={!rangeOk} /></Field>
                {!rangeOk && <p className="col-span-2 text-[12px] text-danger" role="alert">{t('gen.badTime')}</p>}
              </div>
            )}
            <div className="flex flex-col gap-2">
              <Field label={t('gen.prompt')} icon={Sparkles}>
                <textarea className={textareaCls} rows={3} value={gen.prompt ?? ''} placeholder={t('gen.promptPh')} onChange={(e) => setGen({ ...gen, prompt: e.target.value })} />
              </Field>
              <div className="flex flex-wrap gap-1.5">
                {CHIPS.map((k) => (
                  <button key={k} type="button" onClick={() => addChip(k)} className="cursor-pointer rounded-full border border-ai/40 bg-ai/10 px-3 py-1 text-[12px] text-text transition-colors duration-150 hover:border-ai">
                    {t(`gen.chips.${k}`)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('gen.language')} icon={Languages}>
                <select className={selectCls} value={gen.language} onChange={(e) => setGen({ ...gen, language: e.target.value })}>
                  <option value="auto">{t('gen.langAuto')}</option><option value="pt">{t('gen.langPt')}</option>
                  <option value="en">{t('gen.langEn')}</option><option value="es">{t('gen.langEs')}</option>
                </select>
              </Field>
              <Field label={t('gen.quantity')} icon={Hash}>
                <select className={selectCls} value={String(gen.maxClips)} onChange={(e) => setGen({ ...gen, maxClips: e.target.value === 'auto' ? 'auto' : Number(e.target.value) })}>
                  <option value="auto">{t('gen.qAuto')}</option>
                  {[5, 10, 15, 20, 30, 50].map((n) => <option key={n} value={n}>{t('gen.qN', { n })}</option>)}
                </select>
              </Field>
            </div>
            <Segmented label={t('gen.duration')} value={durKey} onChange={(k) => setGen({ ...gen, targetDuration: DURATIONS[k] })}
              options={Object.keys(DURATIONS).map((k) => ({ value: k, label: k === 'auto' ? t('gen.auto') : k }))} />
            <Segmented<AspectRatio> label={t('gen.format')} value={gen.aspect} onChange={(v) => setGen({ ...gen, aspect: v })}
              options={(['9:16', '1:1', '4:5', '16:9'] as const).map((v) => ({ value: v, label: v }))} />
            <fieldset>
              <legend className="mb-2 text-[12px] font-medium text-muted">{t('gen.template')}</legend>
              <div className="flex gap-3">
                {Object.keys(CAPTION_TEMPLATES).map((id) => (
                  <label key={id} className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-button border p-2 has-[:focus-visible]:shadow-[var(--focus-ring)] ${gen.captionTemplateId === id ? 'border-primary' : 'border-border'}`}>
                    <input type="radio" className="sr-only" checked={gen.captionTemplateId === id} onChange={() => setGen({ ...gen, captionTemplateId: id })} />
                    <TemplatePreview id={id} />
                    <span className="text-[12px] font-medium capitalize">{id}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        </div>

        <footer className="flex items-center justify-between border-t border-border pt-4">
          <span className="text-muted">{t('gen.estimate', { min: estimate, hw: gpu ? 'GPU' : 'CPU' })}</span>
          <Button variant="primary" type="submit" icon={Scissors} disabled={busy || !rangeOk}>{t('home.generate')}</Button>
        </footer>
      </form>
    </Modal>
  );
}

/** Mini-preview animado do template: a mesma função de desenho do export (respeita "reduzir movimento"). */
function TemplatePreview({ id }: { id: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const input = useMemo(() => ({ chunks: chunkWords(POC_WORDS, CAPTION_TEMPLATES[id].wordsPerLine), caption: { ...CAPTION_TEMPLATES[id], positionY: 50, size: CAPTION_TEMPLATES[id].size * 1.8 } }), [id]);
  useEffect(() => {
    const c = ref.current!;
    c.width = 108 * 2; c.height = 192 * 2;
    const ctx = c.getContext('2d')!;
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    const t0 = performance.now();
    const frame = (now: number) => {
      drawOverlay(ctx, input, still ? 2.2 : ((now - t0) / 1000) % POC_DURATION);
      if (!still) raf = requestAnimationFrame(frame);
    };
    loadCaptionFont(input.caption).then(() => { raf = requestAnimationFrame(frame); });
    return () => cancelAnimationFrame(raf);
  }, [input]);
  return <canvas ref={ref} aria-hidden="true" className="h-[112px] w-[63px] rounded-input bg-gradient-to-b from-[#2a2a36] to-[#0b0b0f]" />;
}
