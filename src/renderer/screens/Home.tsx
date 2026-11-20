import { useState, type DragEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { CloudUpload, Link2, Loader2, Scissors } from 'lucide-react';
import type { SourceInfo } from '@shared/types';
import type { Route } from '../app/data';
import { useJobs, useProjects } from '../app/data';
import { ProjectCard } from '../components/ProjectCard';
import { Button } from '../components/ui';
import { GenerateModal } from './GenerateModal';

const VIDEO_EXT = /\.(mp4|mov|mkv|webm|m4v)$/i;

export function Home({ userName, gpu, ready, go }: { userName?: string; gpu: boolean; ready: boolean; go: (r: Route) => void }) {
  const { t } = useTranslation();
  const projects = useProjects();
  const jobs = useJobs();
  const [over, setOver] = useState(false);
  const [link, setLink] = useState('');
  const [sources, setSources] = useState<SourceInfo[] | null>(null);
  const [probing, setProbing] = useState(false);
  const [error, setError] = useState('');

  const h = new Date().getHours();
  const greet = t(h < 12 ? 'home.morning' : h < 18 ? 'home.afternoon' : 'home.evening');

  const openFiles = async (paths: string[]) => {
    if (!paths.length) return;
    setProbing(true); setError('');
    try { setSources(await Promise.all(paths.map((p) => window.cortai.source.probe(p)))); }
    catch { setError(t('home.errorRead')); }
    finally { setProbing(false); }
  };
  const openLink = async () => {
    setProbing(true); setError('');
    try { setSources([await window.cortai.source.probeUrl(link.trim())]); }
    catch (e) { setError((e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')); }
    finally { setProbing(false); }
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    if (ready) void openFiles([...e.dataTransfer.files].map((f) => window.cortai.pathForFile(f)).filter((p) => VIDEO_EXT.test(p)));
  };
  const linkOk = /^https?:\/\/\S+/.test(link.trim());

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-8 px-8 py-8">
      <h1 className="font-display text-[32px] font-bold tracking-tight">{greet}{userName ? `, ${userName}` : ''}</h1>

      <section
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={`flex flex-col items-center gap-5 rounded-panel border-[1.5px] border-dashed px-8 py-12 transition-[border-color,box-shadow,background-color] duration-150 ease-cortai ${over ? 'border-primary bg-surface shadow-[var(--focus-ring)]' : 'border-border bg-surface/40'}`}
      >
        {probing ? <Loader2 size={36} strokeWidth={1.75} aria-hidden="true" className="animate-spin text-ai motion-reduce:animate-none" />
          : <CloudUpload size={36} strokeWidth={1.75} className={over ? 'text-primary' : 'text-muted'} aria-hidden="true" />}
        <p className="font-display text-xl font-semibold" aria-live="polite">{probing ? t('home.probing') : over ? t('home.dropActive') : t('home.drop')}</p>

        {!ready && (
          <p className="flex items-center gap-3 rounded-button border border-warning/40 bg-warning/10 px-4 py-2 text-[13px]" role="status">
            {t('home.notReady')}
            <Button variant="ghost" className="h-8" onClick={() => go({ name: 'settings' })}>{t('home.finishSetup')}</Button>
          </p>
        )}

        <form className="flex w-full max-w-[640px] flex-col gap-2" onSubmit={(e) => { e.preventDefault(); if (linkOk && ready) void openLink(); }}>
          <label htmlFor="video-link" className="text-[12px] font-medium text-muted">{t('home.linkLabel')}</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Link2 size={16} strokeWidth={1.75} aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
              <input id="video-link" type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder={t('home.linkPlaceholder')} aria-describedby="link-rights"
                className="h-11 w-full rounded-input border border-border bg-surface-2 pr-3 pl-9 text-[14px] text-text placeholder:text-muted focus-visible:border-primary" />
            </div>
            <Button variant="primary" type="submit" icon={Scissors} disabled={!linkOk || probing || !ready} className="h-11 px-5">{t('home.generate')}</Button>
          </div>
          <p id="link-rights" className="text-[12px] text-muted">{t('home.linkRights')}</p>
        </form>

        <div className="flex items-center gap-3 text-muted">
          <span>{t('home.or')}</span>
          <Button disabled={probing || !ready} onClick={async () => openFiles(await window.cortai.dialog.openVideos())}>{t('home.choose')}</Button>
        </div>
        {error && <p className="max-w-[640px] text-center text-danger" role="alert">{error}</p>}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-lg font-semibold">{t('home.recent')}</h2>
          {projects.length > 4 && <button className="cursor-pointer text-muted hover:text-text" onClick={() => go({ name: 'projects' })}>{t('home.seeAll')} →</button>}
        </div>
        {projects.length ? (
          <div className="grid grid-cols-4 gap-4">
            {projects.slice(0, 4).map((p) => <ProjectCard key={p.id} p={p} jobs={jobs} onOpen={() => go({ name: p.status === 'ready' ? 'results' : 'processing', id: p.id })} />)}
          </div>
        ) : (
          <p className="rounded-panel border border-border bg-surface px-5 py-8 text-center text-muted">{t('home.emptyRecent')}</p>
        )}
      </section>

      {sources && (
        <GenerateModal sources={sources} gpu={gpu} onClose={() => setSources(null)}
          onCreated={(ids) => { setSources(null); setLink(''); go({ name: 'processing', id: ids[0] }); }} />
      )}
    </div>
  );
}
