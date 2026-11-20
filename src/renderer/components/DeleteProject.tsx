import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { Button, IconButton, Modal } from './ui';

/**
 * Excluir projeto com confirmação: avisa que todos os cortes e edições somem de vez.
 * `icon` = botão só com ícone (card); senão botão com texto.
 */
export function DeleteProject({ id, name, clips, icon, onDone, className = '' }: {
  id: string; name: string; clips: number; icon?: boolean; onDone?: () => void; className?: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const confirm = async () => {
    setBusy(true); setErr('');
    try {
      await window.cortai.projects.remove(id);
      setOpen(false);
      onDone?.();
    } catch { setErr(t('project.deleteFailed')); } finally { setBusy(false); }
  };
  const label = t('project.deleteNamed', { name });
  return (
    <>
      {icon
        ? <IconButton icon={Trash2} label={label} className={`hover:text-danger ${className}`} onClick={(e) => { e.stopPropagation(); setOpen(true); }} />
        : <Button variant="danger" icon={Trash2} className={className} onClick={() => setOpen(true)}>{t('project.delete')}</Button>}
      <Modal open={open} onClose={() => !busy && setOpen(false)} labelledBy={`del-${id}`} className="w-[460px] max-w-[95vw]">
        <div className="flex flex-col gap-4 p-6" role="alertdialog" aria-describedby={`del-${id}-d`}>
          <h2 id={`del-${id}`} className="flex items-center gap-2 font-display text-[16px] font-semibold">
            <AlertTriangle size={20} strokeWidth={1.75} aria-hidden="true" className="shrink-0 text-danger" />
            {t('project.deleteTitle', { name })}
          </h2>
          <div id={`del-${id}-d`} className="flex flex-col gap-2 text-[13px]">
            <p className="rounded-button border border-danger/40 bg-danger/10 px-3 py-2">{t('project.deleteWarn', { count: clips })}</p>
            <p className="text-muted">{t('project.deleteKeeps')}</p>
          </div>
          {err && <p role="alert" className="text-[13px] text-danger">{err}</p>}
          <footer className="flex justify-end gap-2 pt-2">
            <Button autoFocus onClick={() => setOpen(false)} disabled={busy}>{t('templates.cancel')}</Button>
            <Button variant="danger" icon={Trash2} onClick={() => void confirm()} disabled={busy}>{t('project.deleteConfirm')}</Button>
          </footer>
        </div>
      </Modal>
    </>
  );
}
