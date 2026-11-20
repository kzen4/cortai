import { useTranslation } from 'react-i18next';
import { Eraser, FolderOpen, X } from 'lucide-react';
import { useJobs, useProjects } from '../app/data';
import { Button, IconButton, Progress } from '../components/ui';

export function Exports() {
  const { t } = useTranslation();
  const jobs = useJobs().filter((j) => j.kind === 'render').reverse();
  const names = new Map(useProjects().map((p) => [p.id, p.name]));
  const fileName = (p?: string) => p?.split(/[\\/]/).pop()?.replace(/\.mp4$/, '') ?? '…';
  return (
    <div className="mx-auto flex max-w-[960px] flex-col gap-6 px-8 py-8">
      <header className="flex items-center gap-3">
        <h1 className="font-display text-2xl font-bold">{t('exports.title')}</h1>
        <div className="ml-auto flex gap-2">
          <Button icon={FolderOpen} onClick={() => window.cortai.shell.openOutput()}>{t('exports.openOutput')}</Button>
          <Button variant="ghost" icon={Eraser} onClick={() => window.cortai.jobs.clear()}>{t('exports.clear')}</Button>
        </div>
      </header>
      {jobs.length === 0 ? <p className="text-muted">{t('exports.empty')}</p> : (
        <ul className="flex flex-col divide-y divide-border rounded-panel border border-border bg-surface">
          {jobs.map((j) => (
            <li key={j.id} className="flex items-center gap-4 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{fileName(j.payload?.outPath)}</p>
                <p className="truncate text-[12px] text-muted">{names.get(j.projectId)}</p>
                {j.status === 'running' && <Progress value={j.progress} className="mt-2" />}
                {j.error && <p className="mt-1 text-[12px] text-danger" role="alert">{j.error}</p>}
              </div>
              <span className={`w-36 text-right text-[12px] ${j.status === 'done' ? 'text-success' : j.status === 'error' ? 'text-danger' : 'text-muted'}`}>
                {j.status === 'running' ? `${Math.round(j.progress * 100)}% · ${j.detail ?? ''}` : t(`exports.status.${j.status}`)}
              </span>
              {j.status === 'done' && j.payload?.outPath
                ? <IconButton icon={FolderOpen} label={t('exports.show')} onClick={() => window.cortai.shell.showItem(j.payload!.outPath!)} />
                : (j.status === 'queued' || j.status === 'running')
                  ? <IconButton icon={X} label={t('exports.cancel')} onClick={() => window.cortai.jobs.cancel(j.id)} />
                  : <span className="size-9" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
