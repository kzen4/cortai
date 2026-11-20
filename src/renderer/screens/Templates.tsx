import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, Download, Pencil, Plus, Trash2, Type, Upload, X } from 'lucide-react';
import { allTemplates, exportFile, importFile, newId, type TemplateEntry } from '@shared/library';
import { DEFAULT_TEMPLATE } from '@shared/templates';
import type { CaptionTemplate } from '@shared/types';
import { Button, Field, IconButton, Modal, inputCls } from '../components/ui';
import { CaptionControls } from '../components/CaptionControls';
import { TemplatePreview } from '../components/TemplatePreview';
import { kitFonts, saveLibrary, useLibrary } from '../app/library';

/** Galeria de templates de legenda (prontos + próprios), editor, importar/exportar .cortai-template (SPEC §6.8). */
export function Templates() {
  const { t } = useTranslation();
  const lib = useLibrary();
  const [draft, setDraft] = useState<CaptionTemplate | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (!lib) return null;
  const list = allTemplates(lib.templates);
  const mine = list.filter((x) => !x.builtin), ready = list.filter((x) => x.builtin);

  const duplicate = (x: TemplateEntry) => {
    const id = newId('t');
    setDraft({ id, name: t('templates.copyOf', { name: x.name }), style: { ...x.style, templateId: id } });
  };
  const save = (d: CaptionTemplate) => {
    const exists = lib.templates.some((x) => x.id === d.id);
    void saveLibrary({ ...lib, templates: exists ? lib.templates.map((x) => (x.id === d.id ? d : x)) : [...lib.templates, d] });
    setDraft(null);
    setMsg({ ok: true, text: t('templates.saved', { name: d.name }) });
  };
  const remove = (id: string) => {
    // brand kits que usavam o template voltam ao padrão
    void saveLibrary({ ...lib, templates: lib.templates.filter((x) => x.id !== id), kits: lib.kits.map((k) => (k.templateId === id ? { ...k, templateId: undefined } : k)) });
    setDraft(null);
  };
  const doExport = async (x: CaptionTemplate) => {
    if (await window.cortai.brand.saveFile(x.name, JSON.stringify(exportFile('template', x.id, lib)))) setMsg({ ok: true, text: t('templates.exported') });
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

  const grid = (items: TemplateEntry[]) => (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-4">
      {items.map((x) => <TemplateCard key={x.id} x={x} onEdit={() => setDraft(x)} onDuplicate={() => duplicate(x)} onExport={() => void doExport(x)} />)}
    </ul>
  );

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-6 px-8 py-8">
      <header className="flex flex-wrap items-center gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold">{t('templates.title')}</h1>
          <p className="text-muted">{t('templates.subtitle')}</p>
        </div>
        <div className="ml-auto flex gap-2">
          <Button icon={Upload} onClick={() => void doImport()}>{t('templates.import')}</Button>
          <Button variant="primary" icon={Plus} onClick={() => duplicate({ ...list.find((x) => x.id === DEFAULT_TEMPLATE)!, name: t('templates.newName') })}>{t('templates.new')}</Button>
        </div>
      </header>
      {msg && (
        <p role={msg.ok ? 'status' : 'alert'} className={`flex items-center gap-2 rounded-button border px-3 py-2 text-[13px] ${msg.ok ? 'border-success/40 bg-success/10' : 'border-danger/40 bg-danger/10'}`}>
          <span className="flex-1">{msg.text}</span>
          <IconButton icon={X} label={t('gen.close')} className="size-7" onClick={() => setMsg(null)} />
        </p>
      )}
      <section className="flex flex-col gap-3">
        <h2 className="font-display text-[15px] font-semibold">{t('templates.mine')}</h2>
        {mine.length ? grid(mine) : <p className="text-[13px] text-muted">{t('templates.mineEmpty')}</p>}
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="font-display text-[15px] font-semibold">{t('templates.ready')}</h2>
        {grid(ready)}
      </section>
      <Modal open={!!draft} onClose={() => setDraft(null)} labelledBy="tpl-title" className="w-[820px] max-w-[95vw]">
        {draft && <TemplateEditor key={draft.id} initial={draft} isNew={!lib.templates.some((x) => x.id === draft.id)} fonts={kitFonts(lib)}
          palette={[...new Set(lib.kits.flatMap((k) => k.palette))]} onSave={save} onDelete={() => remove(draft.id)} onClose={() => setDraft(null)} />}
      </Modal>
    </div>
  );
}

function TemplateCard({ x, onEdit, onDuplicate, onExport }: { x: TemplateEntry; onEdit: () => void; onDuplicate: () => void; onExport: () => void }) {
  const { t } = useTranslation();
  const [hover, setHover] = useState(false);
  return (
    <li className="group flex flex-col gap-2 rounded-panel border border-border bg-surface p-3 transition-colors duration-150 hover:border-muted"
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} onFocus={() => setHover(true)} onBlur={() => setHover(false)}>
      <button type="button" onClick={x.builtin ? onDuplicate : onEdit} aria-label={x.builtin ? t('templates.duplicateNamed', { name: x.name }) : t('templates.editNamed', { name: x.name })}
        className="cursor-pointer self-center rounded-input">
        <TemplatePreview style={x.style} play={hover} width={108} />
      </button>
      <div className="flex items-center gap-1">
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{x.name}</span>
        {x.builtin
          ? <IconButton icon={Copy} label={t('templates.duplicateNamed', { name: x.name })} className="size-8" onClick={onDuplicate} />
          : <>
            <IconButton icon={Pencil} label={t('templates.editNamed', { name: x.name })} className="size-8" onClick={onEdit} />
            <IconButton icon={Download} label={t('templates.exportNamed', { name: x.name })} className="size-8" onClick={onExport} />
          </>}
      </div>
    </li>
  );
}

function TemplateEditor({ initial, isNew, fonts, palette, onSave, onDelete, onClose }: {
  initial: CaptionTemplate; isNew: boolean; fonts: string[]; palette: string[]; onSave: (d: CaptionTemplate) => void; onDelete: () => void; onClose: () => void;
}) {
  const { t } = useTranslation();
  const [d, setD] = useState(initial);
  const [confirm, setConfirm] = useState(false);
  const name = d.name.trim();
  return (
    <form className="flex flex-col gap-5 p-6" onSubmit={(e) => { e.preventDefault(); if (name) onSave({ ...d, name }); }}>
      <header className="flex items-center justify-between">
        <h2 id="tpl-title" className="font-display text-[16px] font-semibold">{isNew ? t('templates.new') : t('templates.edit')}</h2>
        <IconButton icon={X} type="button" label={t('gen.close')} onClick={onClose} />
      </header>
      <div className="grid grid-cols-[240px_1fr] gap-6">
        <div className="flex flex-col items-center gap-2">
          <TemplatePreview style={d.style} play scale={1} width={240} />
          <p className="text-center text-[12px] text-muted">{t('templates.previewHint')}</p>
        </div>
        <div className="flex max-h-[62vh] flex-col gap-4 overflow-auto pr-1">
          <Field label={t('templates.name')} icon={Type}>
            <input className={inputCls} value={d.name} maxLength={60} required aria-invalid={!name} onChange={(e) => setD({ ...d, name: e.target.value })} />
          </Field>
          <CaptionControls s={d.style} fonts={fonts} palette={palette} onChange={(p) => setD((x) => ({ ...x, style: { ...x.style, ...p } }))} />
        </div>
      </div>
      <footer className="flex items-center gap-2 border-t border-border pt-4">
        {!isNew && (confirm
          ? <Button type="button" variant="danger" icon={Trash2} onClick={onDelete}>{t('templates.confirmDelete')}</Button>
          : <Button type="button" variant="ghost" icon={Trash2} onClick={() => setConfirm(true)}>{t('templates.delete')}</Button>)}
        <Button type="button" className="ml-auto" onClick={onClose}>{t('templates.cancel')}</Button>
        <Button type="submit" variant="primary" disabled={!name}>{t('templates.save')}</Button>
      </footer>
    </form>
  );
}
