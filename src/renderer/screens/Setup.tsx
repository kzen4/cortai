import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Check, Cpu, FolderOpen, HardDrive, MemoryStick, MessageSquareText, Mic, Pause, Play } from 'lucide-react';
import type { ComponentState, Profile, Settings, SetupInfo } from '@shared/types';
import { useComponents } from '../app/data';
import { LogoIcon } from '../app/Logo';
import { Button, Field, Progress, selectCls } from '../components/ui';

const PROFILES: Profile[] = ['light', 'balanced', 'max'];

/** Assistente de 1ª execução (onboarding) e, com `inSettings`, a tela de Configurações → Componentes. */
export function Setup({ inSettings, onDone }: { inSettings?: boolean; onDone: () => void }) {
  const { t } = useTranslation();
  const comps = useComponents();
  const [info, setInfo] = useState<SetupInfo | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    window.cortai.components.setupInfo().then(setInfo);
    window.cortai.settings.get().then(setSettings);
  }, []);
  // a lista de modelos instalados muda quando um download termina
  const readyKey = comps.filter((c) => c.state === 'ready').map((c) => c.id).join();
  useEffect(() => { window.cortai.components.setupInfo().then(setInfo); }, [readyKey]);

  const busy = comps.some((c) => c.state === 'downloading' || c.state === 'installing');
  const allReady = comps.length > 0 && comps.every((c) => c.state === 'ready');
  const update = async (patch: Partial<Settings>) => setSettings(await window.cortai.settings.set(patch));
  const pickProfile = async (p: Profile) => update({ profile: p, ...(await window.cortai.components.profile(p)) });

  if (!info || !settings) return null;
  const opt = (o: { name: string; sizeMB: number; installed: boolean }) =>
    `${o.name} · ${o.installed ? t('setup.installed') : `${(o.sizeMB / 1000).toFixed(1).replace('.', ',')} GB`}`;

  return (
    <div className={inSettings ? 'mx-auto flex max-w-[860px] flex-col gap-6 px-8 py-8' : 'mx-auto flex max-w-[760px] flex-col gap-6 px-8 py-10'}>
      {inSettings ? (
        <h1 className="font-display text-2xl font-bold">{t('setup.settingsTitle')}</h1>
      ) : (
        <header className="flex flex-col items-center gap-3 text-center">
          <div className="flex items-center gap-2"><LogoIcon size={36} /><span className="font-display text-3xl font-extrabold">Cortaí<span className="text-primary">.</span></span></div>
          <p className="text-[15px] text-muted">{t('setup.title')}</p>
        </header>
      )}

      <section className="rounded-panel border border-border bg-surface p-5">
        <h2 className="mb-3 font-display text-[15px] font-semibold">{t('setup.yourPc')}</h2>
        <ul className="flex flex-wrap gap-x-6 gap-y-2 text-[13px]">
          <li className="flex items-center gap-2"><Cpu size={16} strokeWidth={1.75} aria-hidden="true" className={info.gpu ? 'text-success' : 'text-warning'} />{info.gpu ?? t('setup.noGpu')}</li>
          <li className="flex items-center gap-2"><MemoryStick size={16} strokeWidth={1.75} aria-hidden="true" className="text-success" />{t('setup.ram', { n: info.ramGB })}</li>
          <li className="flex items-center gap-2"><HardDrive size={16} strokeWidth={1.75} aria-hidden="true" className={info.diskFreeGB > 15 ? 'text-success' : 'text-warning'} />{t('setup.disk', { n: info.diskFreeGB })}</li>
        </ul>

        <fieldset className="mt-5">
          <legend className="mb-2 text-[12px] font-medium text-muted">{t('setup.profile')}</legend>
          <div className="grid grid-cols-3 gap-2">
            {PROFILES.map((p) => (
              <label key={p} className={`flex cursor-pointer flex-col gap-0.5 rounded-button border px-3 py-2.5 transition-colors duration-150 has-[:focus-visible]:shadow-[var(--focus-ring)] ${settings.profile === p ? 'border-primary bg-primary/10' : 'border-border bg-surface-2 hover:border-muted'}`}>
                <input type="radio" name="profile" className="sr-only" checked={settings.profile === p} onChange={() => pickProfile(p)} disabled={busy} />
                <span className="font-semibold">{t(`setup.profiles.${p}`)}{p === info.recommended && <span className="ml-1.5 text-[11px] font-medium text-primary">· {t('setup.recommended')}</span>}</span>
                <span className="text-[12px] text-muted">{t(`setup.profileHint.${p}`)}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <Field label={t('setup.whisper')} icon={Mic}>
            <select className={selectCls} value={settings.whisper} disabled={busy} onChange={(e) => update({ whisper: e.target.value })}>
              {info.whisperOptions.map((o) => <option key={o.name} value={o.name}>{opt(o)}</option>)}
            </select>
          </Field>
          <Field label={t('setup.llm')} icon={MessageSquareText}>
            <select className={selectCls} value={settings.llm} disabled={busy} onChange={(e) => update({ llm: e.target.value })}>
              {info.llmOptions.map((o) => <option key={o.name} value={o.name}>{opt(o)}</option>)}
            </select>
          </Field>
        </div>
      </section>

      <section className="rounded-panel border border-border bg-surface p-5">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-display text-[15px] font-semibold">{t('setup.components')}</h2>
          <span className="text-[12px] text-muted">{t('setup.size')}</span>
        </div>
        <ul className="flex flex-col gap-3">{comps.map((c) => <ComponentRow key={c.id} c={c} model={c.id === 'whisper' ? settings.whisper : settings.llm} />)}</ul>
        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
          {busy
            ? <Button icon={Pause} onClick={() => window.cortai.components.pause()}>{t('setup.pause')}</Button>
            : !allReady && <Button variant="primary" icon={Play} onClick={() => window.cortai.components.installAll()}>{comps.some((c) => c.state === 'paused') ? t('setup.resume') : t('setup.install')}</Button>}
        </div>
      </section>

      {inSettings && (
        <section className="rounded-panel border border-border bg-surface p-5">
          <Field label={t('setup.outputDir')} icon={FolderOpen}>
            <input readOnly value={settings.outputDir} className="h-10 w-full rounded-input border border-border bg-surface-2 pr-28 pl-9 font-mono text-[12px] text-text" />
          </Field>
          <Button className="mt-2" icon={FolderOpen} onClick={() => window.cortai.shell.openOutput()}>{t('setup.openOutput')}</Button>
        </section>
      )}

      {!inSettings && (
        <footer className="flex items-center justify-between gap-4">
          <p className="max-w-[420px] text-[12px] text-muted">{t('setup.skipHint')}</p>
          <div className="flex gap-2">
            {!allReady && <Button variant="ghost" onClick={async () => { await update({ setupDone: true }); onDone(); }}>{t('setup.skip')}</Button>}
            <Button variant="primary" disabled={!allReady} onClick={async () => { await update({ setupDone: true }); onDone(); }}>{t('setup.start')}</Button>
          </div>
        </footer>
      )}
    </div>
  );
}

function ComponentRow({ c, model }: { c: ComponentState; model: string }) {
  const { t } = useTranslation();
  const active = c.state === 'downloading' || c.state === 'installing';
  const name = t(`setup.comp.${c.id}`, { name: model });
  const status = c.state === 'ready' && c.detail === 'system' ? t('setup.system') : c.state === 'downloading' ? `${Math.round(c.progress * 100)}%` : t(`setup.state.${c.state}`);
  return (
    <li className="flex flex-col gap-1.5">
      <div className="flex items-center gap-3">
        <span className={`flex size-5 items-center justify-center rounded-full ${c.state === 'ready' ? 'bg-success/15 text-success' : c.state === 'error' ? 'bg-danger/15 text-danger' : 'bg-surface-2 text-muted'}`} aria-hidden="true">
          {c.state === 'ready' ? <Check size={12} strokeWidth={2.5} /> : c.state === 'error' ? <AlertCircle size={12} strokeWidth={2.5} /> : null}
        </span>
        <span className="flex-1 font-medium">{name}</span>
        <span className={`text-[12px] ${c.state === 'error' ? 'text-danger' : 'text-muted'}`}>{status}</span>
        <span className="w-16 text-right font-mono text-[12px] text-muted">{c.sizeMB >= 1000 ? `${(c.sizeMB / 1000).toFixed(1)} GB` : `${c.sizeMB} MB`}</span>
      </div>
      {(active || c.state === 'paused') && <Progress value={c.progress} ai={c.state === 'installing'} className="ml-8" />}
      {c.state === 'installing' && c.detail && <p className="ml-8 truncate font-mono text-[11px] text-muted">{c.detail}</p>}
      {c.state === 'error' && c.detail && <p className="ml-8 text-[12px] text-danger" role="alert">{c.detail}</p>}
    </li>
  );
}
