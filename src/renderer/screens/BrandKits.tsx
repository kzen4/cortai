import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Copy, Download, ImagePlus, LayoutTemplate, Megaphone, Pencil, Plus, Star, StarOff, Trash2, Type, Upload, X } from 'lucide-react';
import { allKits, allTemplates, CTA_POS, ctaPos, defaultKitId, exportFile, findTemplate, importFile, isBuiltinKit, NEW_KIT, newId, removeKit, safeFamily, type Library } from '@shared/library';
import { CAPTION_FONTS } from '@shared/templates';
import type { BrandKit } from '@shared/types';
import { Button, Field, IconButton, Modal, Segmented, inputCls, selectCls } from '../components/ui';
import { Check, Color, Range } from '../components/CaptionControls';
import { TemplatePreview } from '../components/TemplatePreview';
import { kitFonts, saveLibrary, useBrand, useLibrary } from '../app/library';

type Msg = { ok: boolean; text: string } | null;

/** Brand kits (SPEC §4.8 V1): logo, paleta, fontes, template padrão e CTA final; aplicados ao gerar e no editor. */
export function BrandKits() {
  const { t } = useTranslation();
  const lib = useLibrary();
  const [draft, setDraft] = useState<BrandKit | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [deleting, setDeleting] = useState<BrandKit | null>(null);
  if (!lib) return null;
  const def = defaultKitId(lib);

  const save = (k: BrandKit) => {
    const exists = lib.kits.some((x) => x.id === k.id);
    void saveLibrary({ ...lib, kits: exists ? lib.kits.map((x) => (x.id === k.id ? k : x)) : [...lib.kits, k] });
    setDraft(null);
    setMsg({ ok: true, text: t('brand.saved', { name: k.name }) });
  };
  const remove = (k: BrandKit) => {
    void saveLibrary(removeKit(lib, k.id));
    setDraft(null); setDeleting(null);
    setMsg({ ok: true, text: t(k.id === def ? 'brand.deletedWasDefault' : 'brand.deleted', { name: k.name }) });
  };
  // o do sistema é guardado como "" (sem escolha) para continuar padrão mesmo se o id mudar um dia
  const makeDefault = (k: BrandKit) => {
    void saveLibrary({ ...lib, defaultKit: k.id });
    setMsg({ ok: true, text: t('brand.nowDefault', { name: k.name }) });
  };
  const clearDefault = () => {
    void saveLibrary({ ...lib, defaultKit: undefined });
    setMsg({ ok: true, text: t('brand.noDefault') });
  };
  const doExport = async (k: BrandKit) => {
    if (await window.cortai.brand.saveFile(k.name, JSON.stringify(exportFile('brandkit', k.id, lib)))) setMsg({ ok: true, text: t('templates.exported') });
  };
  const doImport = async () => {
    const text = await window.cortai.brand.openFile();
    if (text === null) return;
    try {
      const r = importFile(text, lib);
      await saveLibrary(r.lib);
      setMsg({ ok: true, text: t('templates.imported', { name: r.name }) });
    } catch { setMsg({ ok: false, text: t('templates.badFile') }); }
  };

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-6 px-8 py-8">
      <header className="flex flex-wrap items-center gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold">{t('brand.title')}</h1>
          <p className="text-muted">{t('brand.subtitle')}</p>
        </div>
        <div className="ml-auto flex gap-2">
          <Button icon={Upload} onClick={() => void doImport()}>{t('templates.import')}</Button>
          <Button variant="primary" icon={Plus} onClick={() => setDraft(NEW_KIT(t('brand.newName', { n: lib.kits.length + 1 })))}>{t('brand.new')}</Button>
        </div>
      </header>
      {msg && (
        <p role={msg.ok ? 'status' : 'alert'} className={`flex items-center gap-2 rounded-button border px-3 py-2 text-[13px] ${msg.ok ? 'border-success/40 bg-success/10' : 'border-danger/40 bg-danger/10'}`}>
          <span className="flex-1">{msg.text}</span>
          <IconButton icon={X} label={t('gen.close')} className="size-7" onClick={() => setMsg(null)} />
        </p>
      )}
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
        {allKits(lib.kits).map((k) => <KitCard key={k.id} k={k} lib={lib} isDefault={k.id === def} onEdit={() => setDraft(k)} onExport={() => void doExport(k)}
          onDuplicate={() => setDraft({ ...k, id: newId('k'), name: t('templates.copyOf', { name: k.name }) })}
          onDefault={() => makeDefault(k)} onClearDefault={clearDefault} onDelete={() => setDeleting(k)} />)}
      </ul>
      {lib.kits.length === 0 && <p className="text-[13px] text-muted">{t('brand.emptyBody')}</p>}
      <Modal open={!!draft} onClose={() => setDraft(null)} labelledBy="kit-title" className="w-[900px] max-w-[95vw]">
        {draft && <KitEditor key={draft.id} initial={draft} lib={lib} isNew={!lib.kits.some((x) => x.id === draft.id)}
          onSave={save} onDelete={() => { setDeleting(draft); setDraft(null); }} onClose={() => setDraft(null)} />}
      </Modal>
      <Modal open={!!deleting} onClose={() => setDeleting(null)} labelledBy="kit-del" className="w-[440px] max-w-[95vw]">
        {deleting && (
          <div className="flex flex-col gap-4 p-6" role="alertdialog" aria-describedby="kit-del-d">
            <h2 id="kit-del" className="flex items-center gap-2 font-display text-[16px] font-semibold">
              <AlertTriangle size={20} strokeWidth={1.75} aria-hidden="true" className="shrink-0 text-danger" />
              {t('brand.deleteTitle', { name: deleting.name })}
            </h2>
            <p id="kit-del-d" className="rounded-button border border-danger/40 bg-danger/10 px-3 py-2 text-[13px]">
              {t('brand.deleteWarn')}{deleting.id === def ? ` ${t('brand.deleteWarnDefault')}` : ''}
            </p>
            <footer className="flex justify-end gap-2 pt-2">
              <Button autoFocus onClick={() => setDeleting(null)}>{t('templates.cancel')}</Button>
              <Button variant="danger" icon={Trash2} onClick={() => remove(deleting)}>{t('brand.deleteConfirm')}</Button>
            </footer>
          </div>
        )}
      </Modal>
    </div>
  );
}

function KitCard({ k, lib, isDefault, onEdit, onExport, onDuplicate, onDefault, onClearDefault, onDelete }: {
  k: BrandKit; lib: Library; isDefault: boolean; onEdit: () => void; onExport: () => void; onDuplicate: () => void; onDefault: () => void; onClearDefault: () => void; onDelete: () => void;
}) {
  const system = isBuiltinKit(k.id); // kit do sistema: não edita nem apaga, duplica
  const { t } = useTranslation();
  const [hover, setHover] = useState(false);
  const brand = useBrand(k);
  return (
    <li className="flex gap-3 rounded-panel border border-border bg-surface p-3 transition-colors duration-150 hover:border-muted"
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} onFocus={() => setHover(true)} onBlur={() => setHover(false)}>
      <button type="button" onClick={system ? onDuplicate : onEdit} aria-label={t(system ? 'brand.duplicateNamed' : 'brand.editNamed', { name: k.name })} className="shrink-0 cursor-pointer rounded-input">
        <TemplatePreview style={findTemplate(k.templateId, lib.templates)} brand={brand} play={hover} width={81} />
      </button>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate font-medium">{k.name}</span>
          {isDefault && <span className="shrink-0 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-text">{t('brand.systemDefault')}</span>}
        </span>
        <span className="flex flex-wrap gap-1" aria-label={t('brand.palette')}>
          {k.palette.map((c) => <span key={c} title={c} className="size-4 rounded-full border border-border" style={{ background: c }} />)}
        </span>
        <span className="truncate text-[12px] text-muted">{k.fonts.length ? k.fonts.map((f) => f.family).join(', ') : t('brand.noFonts')}</span>
        <div className="mt-auto flex gap-1">
          {system ? <IconButton icon={Copy} label={t('brand.duplicateNamed', { name: k.name })} className="size-8" onClick={onDuplicate} />
            : <IconButton icon={Pencil} label={t('brand.editNamed', { name: k.name })} className="size-8" onClick={onEdit} />}
          <IconButton icon={Download} label={t('templates.exportNamed', { name: k.name })} className="size-8" onClick={onExport} />
          {!system && <IconButton icon={Trash2} label={t('brand.deleteNamed', { name: k.name })} className="size-8 hover:text-danger" onClick={onDelete} />}
        </div>
        {isDefault
          ? <Button variant="ghost" icon={StarOff} className="h-8 self-start whitespace-nowrap px-2 text-[12px]" onClick={onClearDefault}>{t('brand.clearDefault')}</Button>
          : <Button variant="ghost" icon={Star} className="h-8 self-start whitespace-nowrap px-2 text-[12px]" onClick={onDefault}>{t('brand.makeDefault')}</Button>}
      </div>
    </li>
  );
}

const POS = ['tr', 'tl', 'br', 'bl'] as const; // ordem pedida: direito acima, esquerdo acima, direito abaixo, esquerdo abaixo

function KitEditor({ initial, lib, isNew, onSave, onDelete, onClose }: {
  initial: BrandKit; lib: Library; isNew: boolean; onSave: (k: BrandKit) => void; onDelete: () => void; onClose: () => void;
}) {
  const { t } = useTranslation();
  const [k, setK] = useState(initial);
  const [err, setErr] = useState('');
  const brand = useBrand(k);
  const set = (p: Partial<BrandKit>) => setK((x) => ({ ...x, ...p }));
  const name = k.name.trim();
  const fonts = [...new Set([...CAPTION_FONTS, ...kitFonts(lib), ...k.fonts.map((f) => f.family)])];

  const pick = async (kind: 'image' | 'font') => {
    setErr('');
    const r = await window.cortai.brand.pickFile(kind);
    if (!r) return;
    if ('error' in r) return setErr(t(kind === 'image' ? 'brand.logoTooBig' : 'brand.fontTooBig'));
    if (kind === 'image') return set({ logo: { position: 'tr', size: 0.2, opacity: 1, ...k.logo, data: r.data } });
    const family = safeFamily(r.name) || 'Fonte';
    if (fonts.includes(family) && !k.fonts.some((f) => f.family === family)) return setErr(t('brand.fontExists', { name: family }));
    set({ fonts: [...k.fonts.filter((f) => f.family !== family), { family, data: r.data }] });
  };

  return (
    <form className="flex flex-col gap-5 p-6" onSubmit={(e) => { e.preventDefault(); if (name) onSave({ ...k, name }); }}>
      <header className="flex items-center justify-between">
        <h2 id="kit-title" className="font-display text-[16px] font-semibold">{isNew ? t('brand.new') : t('brand.edit')}</h2>
        <IconButton icon={X} type="button" label={t('gen.close')} onClick={onClose} />
      </header>
      <div className="grid grid-cols-[240px_1fr] gap-6">
        <div className="flex flex-col items-center gap-2">
          <TemplatePreview style={findTemplate(k.templateId, lib.templates)} brand={brand} play scale={1} width={240} />
          <p className="text-center text-[12px] text-muted">{t('brand.previewHint')}</p>
        </div>
        <div className="flex max-h-[62vh] flex-col gap-5 overflow-auto pr-1">
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('brand.name')} icon={Type}>
              <input className={inputCls} value={k.name} maxLength={60} required aria-invalid={!name} onChange={(e) => set({ name: e.target.value })} />
            </Field>
            <Field label={t('brand.template')} icon={LayoutTemplate}>
              <select className={selectCls} value={k.templateId ?? ''} onChange={(e) => set({ templateId: e.target.value || undefined })}>
                <option value="">{t('brand.templateNone')}</option>
                {allTemplates(lib.templates).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </Field>
          </div>

          <Section title={t('brand.logo')}>
            <div className="flex items-center gap-3">
              {k.logo
                ? <img src={k.logo.data} alt={t('brand.logoAlt')} className="h-12 max-w-[120px] rounded-input border border-border bg-surface-2 object-contain p-1" />
                : <span className="text-[13px] text-muted">{t('brand.noLogo')}</span>}
              <Button type="button" icon={ImagePlus} onClick={() => void pick('image')}>{k.logo ? t('brand.changeLogo') : t('brand.pickLogo')}</Button>
              {k.logo && <Button type="button" variant="ghost" icon={Trash2} onClick={() => set({ logo: undefined })}>{t('brand.remove')}</Button>}
            </div>
            {k.logo && (
              <>
                <Segmented label={t('brand.position')} value={k.logo.position} onChange={(v) => set({ logo: { ...k.logo!, position: v } })}
                  options={POS.map((v) => ({ value: v, label: t(`brand.pos.${v}`) }))} />
                <div className="grid grid-cols-2 gap-3">
                  <Range label={t('brand.size')} value={Math.round(k.logo.size * 100)} min={5} max={60} suffix="%" onChange={(v) => set({ logo: { ...k.logo!, size: v / 100 } })} />
                  <Range label={t('brand.opacity')} value={Math.round(k.logo.opacity * 100)} min={10} max={100} suffix="%" onChange={(v) => set({ logo: { ...k.logo!, opacity: v / 100 } })} />
                </div>
              </>
            )}
          </Section>

          <Section title={t('brand.palette')} hint={t('brand.paletteHint')}>
            <div className="flex flex-wrap items-end gap-2">
              {k.palette.map((c, i) => (
                <div key={i} className="flex items-end gap-1">
                  <div className="w-[118px]"><Color label={t('brand.colorN', { n: i + 1 })} value={c} onChange={(v) => set({ palette: k.palette.map((x, j) => (j === i ? v : x)) })} /></div>
                  <IconButton icon={X} type="button" label={t('brand.removeColor', { n: i + 1 })} className="mb-0.5" onClick={() => set({ palette: k.palette.filter((_, j) => j !== i) })} />
                </div>
              ))}
              {k.palette.length < 8 && <Button type="button" variant="ghost" icon={Plus} onClick={() => set({ palette: [...k.palette, '#FFFFFF'] })}>{t('brand.addColor')}</Button>}
            </div>
          </Section>

          <Section title={t('brand.fonts')} hint={t('brand.fontsHint')}>
            {k.fonts.length > 0 && (
              <ul className="flex flex-col gap-1">
                {k.fonts.map((f) => (
                  <li key={f.family} className="flex items-center gap-2 rounded-input border border-border bg-surface-2 px-3 py-1">
                    <span className="flex-1 truncate text-[15px]" style={{ fontFamily: `"${f.family}"` }}>{f.family}</span>
                    <IconButton icon={Trash2} type="button" label={t('brand.removeFont', { name: f.family })} className="size-8" onClick={() => set({ fonts: k.fonts.filter((x) => x.family !== f.family) })} />
                  </li>
                ))}
              </ul>
            )}
            <Button type="button" icon={Upload} className="self-start" onClick={() => void pick('font')}>{t('brand.addFont')}</Button>
          </Section>

          <Section title={t('brand.cta')} hint={t('brand.ctaHint')}>
            <Check label={t('brand.ctaOn')} checked={!!k.cta} onChange={(v) => set({ cta: v ? NEW_KIT('').cta : undefined })} />
            {k.cta && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Field label={t('brand.ctaText')} icon={Megaphone}>
                    <input className={inputCls} value={k.cta.text} maxLength={80} onChange={(e) => set({ cta: { ...k.cta!, text: e.target.value } })} />
                  </Field>
                  <Field label={t('brand.ctaFont')} icon={Type}>
                    <select className={selectCls} value={k.cta.font} onChange={(e) => set({ cta: { ...k.cta!, font: e.target.value } })}>
                      {fonts.map((f) => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Color label={t('brand.ctaColor')} value={k.cta.color} palette={k.palette} onChange={(v) => set({ cta: { ...k.cta!, color: v } })} />
                  <Color label={t('brand.ctaBg')} value={k.cta.bg} palette={k.palette} onChange={(v) => set({ cta: { ...k.cta!, bg: v } })} />
                  <Range label={t('brand.ctaSeconds')} value={k.cta.seconds} min={1} max={10} suffix=" s" onChange={(v) => set({ cta: { ...k.cta!, seconds: v } })} />
                </div>
                <Segmented<'top' | 'bottom'> label={t('brand.ctaPosition')} value={ctaPos(k.cta.positionY)} onChange={(v) => set({ cta: { ...k.cta!, positionY: CTA_POS[v] } })}
                  options={(['top', 'bottom'] as const).map((v) => ({ value: v, label: t(`brand.ctaPos.${v}`) }))} />
              </>
            )}
          </Section>
          {err && <p role="alert" className="text-[13px] text-danger">{err}</p>}
        </div>
      </div>
      <footer className="flex items-center gap-2 border-t border-border pt-4">
        {!isNew && <Button type="button" variant="ghost" icon={Trash2} onClick={onDelete}>{t('templates.delete')}</Button>}
        <Button type="button" className="ml-auto" onClick={onClose}>{t('templates.cancel')}</Button>
        <Button type="submit" variant="primary" disabled={!name}>{t('templates.save')}</Button>
      </footer>
    </form>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-t border-border pt-4">
      <div>
        <h3 className="text-[13px] font-semibold">{title}</h3>
        {hint && <p className="text-[12px] text-muted">{hint}</p>}
      </div>
      {children}
    </section>
  );
}
