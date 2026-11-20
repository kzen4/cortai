import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Clock, Hash, Languages, Palette, Scissors, Sparkles, X } from 'lucide-react';
import { allKits, allTemplates, defaultKitId, findKit } from '@shared/library';
import { DEFAULT_TEMPLATE } from '@shared/templates';
import type { AspectRatio, GenerationSettings, SourceInfo } from '@shared/types';
import { Button, Field, IconButton, Modal, Segmented, fmtDuration, inputCls, selectCls, textareaCls } from '../components/ui';
import { TemplatePreview } from '../components/TemplatePreview';
import { useLibrary } from '../app/library';

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
  const [loaded, setLoaded] = useState(false);
  const lib = useLibrary();
  const templates = allTemplates(lib?.templates);
  // sem escolha = o kit padrão (Brand kits → Tornar padrão; senão o Cortaí); '' = o usuário escolheu "Nenhum"
  const kitId = gen.brandKitId === '' ? undefined : findKit(gen.brandKitId ?? defaultKitId(lib), lib?.kits)?.id;
  const tplId = templates.some((x) => x.id === gen.captionTemplateId) ? gen.captionTemplateId : DEFAULT_TEMPLATE;
  const setKit = (id: string) => {
    const k = findKit(id, lib?.kits);
    setGen({ ...gen, brandKitId: id, captionTemplateId: k?.templateId ?? gen.captionTemplateId });
  };

  useEffect(() => {
    // lembra as últimas escolhas, menos o kit: cada geração nova começa no kit padrão
    window.cortai.settings.get().then((s) => {
      if (s.lastGeneration) setGen({ ...s.lastGeneration, brandKitId: undefined, range: undefined, prompt: undefined });
      setLoaded(true);
    });
  }, []);
  // ...e com o template do kit padrão (uma vez, depois das duas leituras)
  const applied = useRef(false);
  useEffect(() => {
    if (!lib || !loaded || applied.current) return;
    applied.current = true;
    const tpl = findKit(defaultKitId(lib), lib.kits)?.templateId;
    if (tpl) setGen((g) => ({ ...g, captionTemplateId: tpl }));
  }, [lib, loaded]);

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
    for (const src of sources) ids.push(await window.cortai.projects.create(src, { ...gen, captionTemplateId: tplId, brandKitId: kitId ?? '', range: sources.length === 1 && !full ? [a!, b!] : undefined, prompt: gen.prompt?.trim() || undefined }));
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
            {lib && (
              <Field label={t('brand.kit')} icon={Palette}>
                <select className={selectCls} value={kitId ?? ''} onChange={(e) => setKit(e.target.value)}>
                  <option value="">{t('brand.none')}</option>
                  {allKits(lib.kits).map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
                </select>
              </Field>
            )}
            <fieldset>
              <legend className="mb-2 text-[12px] font-medium text-muted">{t('gen.template')}</legend>
              <div className="flex gap-3 overflow-x-auto pb-1">
                {templates.map((x) => (
                  <label key={x.id} className={`flex w-[81px] shrink-0 cursor-pointer flex-col items-center gap-1.5 rounded-button border p-2 has-[:focus-visible]:shadow-[var(--focus-ring)] ${tplId === x.id ? 'border-primary' : 'border-border'}`}>
                    <input type="radio" className="sr-only" checked={tplId === x.id} onChange={() => setGen({ ...gen, captionTemplateId: x.id })} />
                    <TemplatePreview style={x.style} play={tplId === x.id} width={63} />
                    <span className="w-full truncate text-center text-[12px] font-medium">{x.name}</span>
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
