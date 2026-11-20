import { useTranslation } from 'react-i18next';
import { FileText, Hash, LayoutTemplate, ListOrdered, LogIn, LogOut, Sparkles, Tag, Type, Wand2 } from 'lucide-react';
import { CAPTION_FONTS, CAPTION_TEMPLATES, TEMPLATE_NAMES } from '@shared/templates';
import { DEFAULT_WEBCAM, detectCornerWebcam, editList, forCopy, FRAME_PRESETS, inCopy, outDuration, presetOf, setIn, setOut, setPieceFrame, type FramePreset } from '@shared/timeline';
import type { AspectRatio, CaptionStyle, Clip, LayoutSettings } from '@shared/types';
import { Field, Segmented, fmtClock, inputCls, selectCls, textareaCls } from '../components/ui';

export type Tab = 'caption' | 'layout' | 'clip';
type Update = (fn: (c: Clip) => Clip, merge?: string) => void;
const ANIMS: CaptionStyle['animation'][] = ['none', 'pop', 'bounce', 'fade', 'typewriter', 'highlight'];

/** targets = pedaços (índices em clip.order) que o "Enquadramento do pedaço" altera: os selecionados na timeline ou o do playhead. */
export function Inspector({ clip, tab, onTab, update, copy, targets, targetsLabel }: {
  clip: Clip; tab: Tab; onTab: (t: Tab) => void; update: Update; copy: number; targets: number[]; targetsLabel: string;
}) {
  const { t } = useTranslation();
  const cap = (patch: Partial<CaptionStyle>, merge?: string) => update((c) => ({ ...c, caption: { ...c.caption, ...patch } }), merge);
  const lay = (patch: Partial<LayoutSettings>, merge?: string) => update((c) => ({ ...c, layout: { ...c.layout, ...patch } }), merge);
  const s = clip.caption;
  // modo de layout: tela + webcam já entra com a janela no rosto (se estiver num canto) e a legenda no meio
  const setMode = (mode: LayoutSettings['mode']) => update((c) => mode !== 'screen-face' ? { ...c, layout: { ...c.layout, mode } } : {
    ...c, caption: { ...c.caption, positionY: 50 },
    layout: { ...c.layout, mode, webcam: c.layout.webcam ?? { ...DEFAULT_WEBCAM, ...(detectCornerWebcam(c.reframe) ?? {}) } },
  });
  const frames = targets.map((k) => presetOf(clip.order?.[k]?.frame));
  const frameValue = frames.length && frames.every((f) => f === frames[0]) ? frames[0] : ('' as const);
  const setFrame = (v: FramePreset | 'auto' | 'custom' | '') =>
    update((c) => setPieceFrame(c, targets, v === 'auto' ? undefined : FRAME_PRESETS[v as FramePreset]));

  return (
    <aside className="flex min-h-0 flex-col border-l border-border">
      <div role="tablist" className="flex border-b border-border px-2">
        {(['caption', 'layout', 'clip'] as Tab[]).map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => onTab(k)}
            className={`-mb-px cursor-pointer border-b-2 px-3 py-2.5 text-[13px] font-medium ${tab === k ? 'border-primary text-text' : 'border-transparent text-muted hover:text-text'}`}>
            {t(`editor.tabs.${k}`)}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4">
        {tab === 'caption' && (
          <>
            <Field label={t('editor.template')} icon={LayoutTemplate}>
              <select className={selectCls} value={s.templateId} onChange={(e) => cap({ ...CAPTION_TEMPLATES[e.target.value], keywords: s.keywords })}>
                {Object.keys(CAPTION_TEMPLATES).map((id) => <option key={id} value={id}>{TEMPLATE_NAMES[id]}</option>)}
              </select>
            </Field>
            <Field label={t('editor.font')} icon={Type}>
              <select className={selectCls} value={s.font} onChange={(e) => cap({ font: e.target.value })}>
                {CAPTION_FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </Field>
            <Range label={t('editor.size')} value={s.size} min={30} max={160} onChange={(v) => cap({ size: v }, 'size')} />
            <div className="grid grid-cols-3 gap-2">
              <Color label={t('editor.color')} value={s.color} onChange={(v) => cap({ color: v }, 'color')} />
              <Color label={t('editor.highlight')} value={s.highlightColor} onChange={(v) => cap({ highlightColor: v }, 'hl')} />
              <Color label={t('editor.stroke')} value={s.strokeColor} onChange={(v) => cap({ strokeColor: v }, 'stroke')} />
            </div>
            <Range label={t('editor.strokeWidth')} value={s.strokeWidth} min={0} max={14} onChange={(v) => cap({ strokeWidth: v }, 'sw')} />
            <Range label={t('editor.posY')} value={s.positionY} min={8} max={92} suffix="%" onChange={(v) => cap({ positionY: v }, 'posY')} />
            <div className="grid grid-cols-2 gap-2">
              <Field label={t('editor.wordsPerLine')} icon={ListOrdered}>
                <select className={selectCls} value={s.wordsPerLine} onChange={(e) => cap({ wordsPerLine: Number(e.target.value) })}>
                  {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </Field>
              <Field label={t('editor.animation')} icon={Wand2}>
                <select className={selectCls} value={s.animation} onChange={(e) => cap({ animation: e.target.value as CaptionStyle['animation'] })}>
                  {ANIMS.map((a) => <option key={a} value={a}>{t(`editor.anims.${a}`)}</option>)}
                </select>
              </Field>
            </div>
            <div className="flex flex-col gap-2">
              <Check label={t('editor.uppercase')} checked={s.uppercase} onChange={(v) => cap({ uppercase: v })} />
              <Check label={t('editor.shadow')} checked={!!s.shadow} onChange={(v) => cap({ shadow: v ? { color: 'rgba(0,0,0,0.75)', blur: 12, x: 0, y: 3 } : undefined })} />
              <Check label={t('editor.box')} checked={!!s.box} onChange={(v) => cap({ box: v ? { color: '#FFFFFF', radius: 16, padding: 20 } : undefined })} />
              {s.box && <Color label={t('editor.boxColor')} value={s.box.color} onChange={(v) => cap({ box: { ...s.box!, color: v } }, 'box')} />}
            </div>
            <Field label={t('editor.keywords')} icon={Sparkles} hint={t('editor.keywordsHint')}>
              <input className={inputCls} defaultValue={s.keywords.join(', ')} key={s.keywords.join()}
                onBlur={(e) => cap({ keywords: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} />
            </Field>
          </>
        )}

        {tab === 'layout' && (
          <>
            <Segmented<AspectRatio> label={t('editor.format')} value={clip.layout.aspect} onChange={(v) => lay({ aspect: v })}
              options={(['9:16', '1:1', '4:5', '16:9'] as const).map((v) => ({ value: v, label: v }))} />
            <Segmented<LayoutSettings['mode']> label={t('editor.mode')} value={clip.layout.mode} onChange={setMode}
              options={(['single', 'screen-face', 'blur-bg', 'color-bg'] as const).map((v) => ({ value: v, label: t(`editor.modes.${v}`) }))} />
            {clip.layout.mode === 'single' && targets.length > 0 && (
              <div className="flex flex-col gap-1">
                <Segmented<FramePreset | 'auto' | 'custom' | ''> label={t('editor.pieceFrame')} value={frameValue} onChange={setFrame}
                  options={(['auto', 'left', 'center', 'right'] as const).map((v) => ({ value: v, label: t(`editor.frames.${v}`) }))} />
                <p className="text-[11px] text-muted">{targetsLabel}{frameValue === 'custom' ? ` · ${t('editor.frames.custom')}` : ''}</p>
              </div>
            )}
            {clip.layout.mode === 'screen-face' && (
              <>
                <Range label={t('editor.webcamSize')} value={Math.round((clip.layout.webcam?.w ?? DEFAULT_WEBCAM.w) * 100)} min={10} max={60} suffix="%"
                  onChange={(v) => lay({ webcam: { ...(clip.layout.webcam ?? DEFAULT_WEBCAM), w: v / 100 } }, 'webcam')} />
                <p className="text-[11px] text-muted">{t('editor.webcamHint')}</p>
              </>
            )}
            {clip.layout.mode === 'single' && (
              <Range label={t('editor.zoom')} value={Math.round((forCopy(clip, copy).reframe[0]?.zoom ?? 1) * 100)} min={100} max={250} suffix="%"
                onChange={(v) => update((c) => inCopy(c, copy, (x) => ({ ...x, reframe: (x.reframe.length ? x.reframe : [{ t: 0, x: 0.5, y: 0.5, zoom: 1, ease: 'smooth' as const, auto: false }]).map((k) => ({ ...k, zoom: v / 100 })) })), 'zoom')} />
            )}
            {clip.layout.mode === 'blur-bg' && <Range label={t('editor.blurAmt')} value={clip.layout.bgBlur ?? 30} min={0} max={80} onChange={(v) => lay({ bgBlur: v }, 'blur')} />}
            {clip.layout.mode === 'color-bg' && <Color label={t('editor.bgColor')} value={clip.layout.bgColor ?? '#0B0B0F'} onChange={(v) => lay({ bgColor: v }, 'bg')} />}
          </>
        )}

        {tab === 'clip' && (
          <>
            <Field label={t('results.titleF')} icon={Type}>
              <input className={inputCls} maxLength={60} defaultValue={clip.title} key={`t${clip.title}`} onBlur={(e) => e.target.value.trim() && update((c) => ({ ...c, title: e.target.value.trim() }))} />
            </Field>
            <Field label={t('results.descF')} icon={FileText}>
              <textarea className={textareaCls} rows={3} defaultValue={clip.description} key={`d${clip.description}`} onBlur={(e) => update((c) => ({ ...c, description: e.target.value.trim() }))} />
            </Field>
            <Field label={t('results.tagsF')} icon={Hash} hint={t('results.tagsHint')}>
              <input className={inputCls} defaultValue={clip.hashtags.map((x) => `#${x}`).join(' ')} key={`h${clip.hashtags.join()}`}
                onBlur={(e) => update((c) => ({ ...c, hashtags: e.target.value.split(/\s+/).map((x) => x.replace(/^#/, '')).filter(Boolean) }))} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label={t('editor.inPoint')} icon={LogIn}>
                <input type="number" step={0.1} className={inputCls} value={clip.in.toFixed(1)} onChange={(e) => { const v = Number(e.target.value); if (v >= 0 && v < clip.out - 1) update((c) => setIn(c, v), 'in'); }} />
              </Field>
              <Field label={t('editor.outPoint')} icon={LogOut}>
                <input type="number" step={0.1} className={inputCls} value={clip.out.toFixed(1)} onChange={(e) => { const v = Number(e.target.value); if (v > clip.in + 1) update((c) => setOut(c, v), 'out'); }} />
              </Field>
            </div>
            <p className="text-[12px] text-muted">{t('editor.duration', { d: fmtClock(outDuration(editList(clip))) })}</p>
            <section className="rounded-button border border-ai/30 bg-ai/10 p-3 text-[13px]">
              <h3 className="mb-1 flex items-center gap-1.5 text-[12px] font-semibold text-ai"><Tag size={12} aria-hidden="true" />{t('results.reason')}</h3>
              <p>{clip.reason}</p>
            </section>
          </>
        )}
      </div>
    </aside>
  );
}

function Range({ label, value, min, max, suffix = '', onChange }: { label: string; value: number; min: number; max: number; suffix?: string; onChange: (v: number) => void }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex justify-between text-[12px] font-medium text-muted">{label}<span className="font-mono text-text">{value}{suffix}</span></span>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="accent-[var(--primary)]" />
    </label>
  );
}

function Color({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const hex = /^#[0-9a-f]{6}$/i.test(value) ? value : '#000000';
  return (
    <label className="flex flex-col gap-1.5">
      <span className="truncate text-[12px] font-medium text-muted">{label}</span>
      <span className="flex h-10 items-center gap-2 rounded-input border border-border bg-surface-2 px-2">
        <input type="color" value={hex} onChange={(e) => onChange(e.target.value.toUpperCase())} className="size-6 cursor-pointer rounded border-0 bg-transparent p-0" />
        <span className="font-mono text-[11px] text-muted">{hex.toUpperCase()}</span>
      </span>
    </label>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-[13px]">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-4 cursor-pointer accent-[var(--primary)]" />
      {label}
    </label>
  );
}
