import { useTranslation } from 'react-i18next';
import { BookmarkPlus, FileText, Megaphone, Hash, LayoutTemplate, LogIn, LogOut, Palette, Sparkles, Tag, Type } from 'lucide-react';
import { allKits, allTemplates, applyTemplate, CTA_POS, ctaPos, findKit, findTemplate, newId } from '@shared/library';
import { clipPieces, DEFAULT_WEBCAM, detectCornerWebcam, editList, FRAME_PRESETS, framingFor, outDuration, presetOf, setIn, setOut, setPieceFrame, setPieceZoom, type FramePreset } from '@shared/timeline';
import type { AspectRatio, CaptionStyle, Clip, LayoutSettings } from '@shared/types';
import { Field, IconButton, Segmented, fmtClock, inputCls, selectCls, textareaCls } from '../components/ui';
import { CaptionControls, Color, Range } from '../components/CaptionControls';
import { kitFonts, saveLibrary, useLibrary } from '../app/library';

export type Tab = 'caption' | 'layout' | 'clip';
type Update = (fn: (c: Clip) => Clip, merge?: string) => void;

/** targets = pedaços (índices em clip.order) que o "Enquadramento do pedaço" altera: os selecionados na timeline ou o do playhead. */
export function Inspector({ clip, tab, onTab, update, copy, targets, targetsLabel }: {
  clip: Clip; tab: Tab; onTab: (t: Tab) => void; update: Update; copy: number; targets: number[]; targetsLabel: string;
}) {
  const { t } = useTranslation();
  const cap = (patch: Partial<CaptionStyle>, merge?: string) => update((c) => ({ ...c, caption: { ...c.caption, ...patch } }), merge);
  const lay = (patch: Partial<LayoutSettings>, merge?: string) => update((c) => ({ ...c, layout: { ...c.layout, ...patch } }), merge);
  const s = clip.caption;
  const lib = useLibrary();
  const kit = findKit(clip.brandKitId, lib?.kits);
  // trocar de kit aplica também o template dele (se tiver)
  const setKit = (id: string) => {
    const k = findKit(id, lib?.kits);
    update((c) => ({ ...c, brandKitId: id || undefined, ...(k?.templateId ? { caption: applyTemplate(c.caption, findTemplate(k.templateId, lib?.templates), k.templateId) } : {}) }));
  };
  // o estilo atual vira um template próprio (renomeia na tela Templates)
  const saveAsTemplate = () => {
    if (!lib) return;
    const id = newId('t');
    void saveLibrary({ ...lib, templates: [...lib.templates, { id, name: t('templates.fromClip', { title: clip.title.slice(0, 30) }), style: { ...s, templateId: id, keywords: [] } }] });
    cap({ templateId: id });
  };
  // modo de layout: tela + webcam já entra com a janela no rosto (se estiver num canto) e a legenda no meio
  const setMode = (mode: LayoutSettings['mode']) => update((c) => mode !== 'screen-face' ? { ...c, layout: { ...c.layout, mode } } : {
    ...c, caption: { ...c.caption, positionY: 50 },
    layout: { ...c.layout, mode, webcam: c.layout.webcam ?? { ...DEFAULT_WEBCAM, ...(detectCornerWebcam(c.reframe) ?? {}) } },
  });
  const frames = targets.map((k) => presetOf(clip.order?.[k]?.frame, clip.order?.[k]?.keys));
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
            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <Field label={t('editor.template')} icon={LayoutTemplate}>
                  <select className={selectCls} value={s.templateId} onChange={(e) => cap(applyTemplate(s, findTemplate(e.target.value, lib?.templates), e.target.value))}>
                    {allTemplates(lib?.templates).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                    {!allTemplates(lib?.templates).some((x) => x.id === s.templateId) && <option value={s.templateId}>{t('templates.custom')}</option>}
                  </select>
                </Field>
              </div>
              <IconButton icon={BookmarkPlus} label={t('templates.saveFromClip')} onClick={saveAsTemplate} />
            </div>
            <CaptionControls s={s} onChange={cap} fonts={kitFonts(lib)} palette={kit?.palette} />
            <Field label={t('editor.keywords')} icon={Sparkles} hint={t('editor.keywordsHint')}>
              <input className={inputCls} defaultValue={s.keywords.join(', ')} key={s.keywords.join()}
                onBlur={(e) => cap({ keywords: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} />
            </Field>
          </>
        )}

        {tab === 'layout' && (
          <>
            <Field label={t('brand.kit')} icon={Palette} hint={t('brand.kitHint')}>
              <select className={selectCls} value={clip.brandKitId ?? ''} onChange={(e) => setKit(e.target.value)}>
                <option value="">{t('brand.none')}</option>
                {allKits(lib?.kits).map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
              </select>
            </Field>
            <Field label={t('brand.clipCta')} icon={Megaphone} hint={t(kit?.cta ? 'brand.clipCtaHintKit' : 'brand.clipCtaHint')}>
              <input className={inputCls} maxLength={80} value={clip.cta?.text ?? ''} placeholder={kit?.cta?.text ?? t('brand.clipCtaPh')}
                onChange={(e) => update((c) => ({ ...c, cta: { text: e.target.value, positionY: c.cta?.positionY ?? kit?.cta?.positionY ?? CTA_POS.bottom } }), 'cta')} />
            </Field>
            {(!!clip.cta?.text.trim() || !!kit?.cta) && (
              <Segmented<'top' | 'bottom'> label={t('brand.ctaPosition')} value={ctaPos(clip.cta?.positionY ?? kit?.cta?.positionY ?? CTA_POS.bottom)}
                onChange={(v) => update((c) => ({ ...c, cta: { text: c.cta?.text ?? '', positionY: CTA_POS[v] } }))}
                options={(['top', 'bottom'] as const).map((v) => ({ value: v, label: t(`brand.ctaPos.${v}`) }))} />
            )}
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
            {clip.layout.mode === 'single' && targets.length > 0 && ( // zoom de cada pedaço: os selecionados ou o do playhead
              <div className="flex flex-col gap-1">
                <Range label={t('editor.zoom')} value={Math.round((framingFor(clip, clipPieces(clip)[targets[0]] ?? { g: copy }).reframe[0]?.zoom ?? 1) * 100)} min={100} max={250} suffix="%"
                  onChange={(v) => update((c) => setPieceZoom(c, targets, v / 100), 'zoom')} />
                <p className="text-[11px] text-muted">{targetsLabel}</p>
              </div>
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
