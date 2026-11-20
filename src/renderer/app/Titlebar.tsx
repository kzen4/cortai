import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, RefreshCw, Settings } from 'lucide-react';
import type { UpdateState } from '@shared/types';
import { LogoIcon, Logotype } from './Logo';

/** Área de arraste da janela. Os botões de janela são os nativos (titleBarOverlay / semáforo do macOS). */
export function Titlebar({ mac, onSettings }: { mac: boolean; onSettings: () => void }) {
  const { t } = useTranslation();
  const [up, setUp] = useState<UpdateState>({ state: 'idle' });
  useEffect(() => { void window.cortai.updates.state().then(setUp); return window.cortai.updates.onState(setUp); }, []);
  return (
    <header
      className="drag flex shrink-0 items-center gap-2 border-b border-border bg-bg"
      style={{ height: 'var(--titlebar-h)', paddingLeft: mac ? 84 : 14, paddingRight: mac ? 14 : 150 }}
    >
      <LogoIcon size={20} />
      <Logotype />
      <span className="ml-auto" />
      {up.state === 'downloading' && (
        <span role="status" className="flex items-center gap-1.5 text-[12px] text-muted">
          <Download size={14} strokeWidth={1.75} aria-hidden="true" />{t('update.downloading', { v: up.version, p: up.percent })}
        </span>
      )}
      {up.state === 'ready' && (
        <button onClick={() => window.cortai.updates.install()} title={t('update.readyHint')}
          className="no-drag flex h-7 cursor-pointer items-center gap-1.5 rounded-full bg-primary px-3 text-[12px] font-semibold text-on-primary transition-[filter] duration-150 hover:brightness-110">
          <RefreshCw size={14} strokeWidth={1.75} aria-hidden="true" />{t('update.ready', { v: up.version })}
        </button>
      )}
      <button onClick={onSettings} aria-label={t('nav.settings')} title={t('nav.settings')}
        className="no-drag flex size-8 cursor-pointer items-center justify-center rounded-input text-muted transition-colors duration-150 hover:bg-surface-2 hover:text-text">
        <Settings size={16} strokeWidth={1.75} aria-hidden="true" />
      </button>
    </header>
  );
}
