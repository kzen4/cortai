import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, FlaskConical, FolderOpen, Home, Palette, PanelLeftClose, PanelLeftOpen, Sparkles, type LucideIcon } from 'lucide-react';
import type { EngineStatus } from '@shared/types';

export type Screen = 'home' | 'projects' | 'templates' | 'brandkits' | 'exports' | 'lab';
const SECTION: Record<string, Screen> = { processing: 'projects', results: 'projects', settings: 'home' };

const ITEMS: [Screen, LucideIcon][] = [
  ['home', Home], ['projects', FolderOpen], ['templates', Sparkles], ['brandkits', Palette], ['exports', Download],
];

const dot = { ok: 'bg-success', starting: 'bg-warning', down: 'bg-danger' } as const;

export function Sidebar({ route, onChange, engine, gpu, queue }: { route: string; onChange: (s: Screen) => void; engine: EngineStatus; gpu: string | null; queue: number }) {
  const screen = SECTION[route] ?? (route as Screen);
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem('sidebar') === '1'; } catch { return false; } });
  const toggle = () => { setCollapsed(!collapsed); try { localStorage.setItem('sidebar', collapsed ? '0' : '1'); } catch { /* ok */ } };

  const item = (id: Screen, Icon: LucideIcon) => {
    const active = screen === id;
    return (
      <button
        key={id}
        onClick={() => onChange(id)}
        aria-current={active ? 'page' : undefined}
        title={collapsed ? t(`nav.${id}`) : undefined}
        aria-label={collapsed ? t(`nav.${id}`) : undefined}
        className={`relative flex h-10 w-full cursor-pointer items-center gap-3 rounded-button px-3 text-left font-medium transition-colors duration-150 ease-cortai ${
          active ? 'bg-surface-2 text-text' : 'text-muted hover:bg-surface hover:text-text'
        }`}
      >
        {active && <span className="absolute top-2 bottom-2 left-0 w-[3px] rounded-full bg-primary" aria-hidden="true" />}
        <Icon size={18} strokeWidth={1.75} aria-hidden="true" className="shrink-0" />
        {!collapsed && <span className="truncate">{t(`nav.${id}`)}</span>}
      </button>
    );
  };

  const engineLabel = t(engine === 'ok' ? 'status.engineOk' : engine === 'starting' ? 'status.engineStarting' : 'status.engineDown');

  return (
    <nav
      aria-label="Menu principal"
      className="flex shrink-0 flex-col gap-1 border-r border-border bg-bg p-3 transition-[width] duration-[var(--dur-panel)] ease-cortai"
      style={{ width: collapsed ? 'var(--sidebar-w-collapsed)' : 'var(--sidebar-w)' }}
    >
      {ITEMS.map(([id, Icon]) => item(id, Icon))}
      {/* Lab de render (POC da Fase 0): escondido; para ver, rodar com VITE_LAB=1 */}
      {import.meta.env.VITE_LAB === '1' && <><div className="my-2 border-t border-border" />{item('lab', FlaskConical)}</>}

      <div className="mt-auto flex flex-col gap-2 border-t border-border pt-3 text-[12px] text-muted">
        <Status color={gpu ? 'bg-success' : 'bg-warning'} label={gpu ? t('status.gpu') : t('status.cpu')} title={gpu ?? t('status.cpu')} collapsed={collapsed} />
        <Status color={dot[engine]} label={t('status.engine')} title={engineLabel} collapsed={collapsed} live />
        {!collapsed && <div className="px-3">{t('status.queue')} <span className="font-mono text-text">{queue}</span></div>}
        <button
          onClick={toggle}
          aria-label={collapsed ? t('nav.expand') : t('nav.collapse')}
          title={collapsed ? t('nav.expand') : t('nav.collapse')}
          className="flex h-10 cursor-pointer items-center rounded-button px-3 text-muted transition-colors duration-150 hover:bg-surface hover:text-text"
        >
          {collapsed ? <PanelLeftOpen size={18} strokeWidth={1.75} aria-hidden="true" /> : <PanelLeftClose size={18} strokeWidth={1.75} aria-hidden="true" />}
        </button>
      </div>
    </nav>
  );
}

function Status({ color, label, title, collapsed, live }: { color: string; label: string; title: string; collapsed: boolean; live?: boolean }) {
  return (
    <div className="flex items-center gap-2 px-3" title={title} role={live ? 'status' : undefined} aria-label={title}>
      <span className={`size-2 shrink-0 rounded-full ${color}`} aria-hidden="true" />
      {!collapsed && <span>{label}</span>}
    </div>
  );
}
