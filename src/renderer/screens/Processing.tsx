import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Check, Circle, Loader2, Minimize2, Play, X } from 'lucide-react';
import { DeleteProject } from '../components/DeleteProject';
import type { FoundClip, Job, JobKind } from '@shared/types';
import { useJobs, useProjects, type Route } from '../app/data';
import { Button, Progress, ScoreRing, fmtClock } from '../components/ui';

const STEPS: JobKind[] = ['ingest', 'transcribe', 'analyze', 'reframe', 'finalize'];
const secs = (a?: string, b?: string) => (a && b ? Math.max(0, (Date.parse(b) - Date.parse(a)) / 1000) : 0);

export function Processing({ id, go }: { id: string; go: (r: Route) => void }) {
  const { t } = useTranslation();
  const project = useProjects().find((p) => p.id === id);
  const jobs = useJobs().filter((j) => j.projectId === id && j.kind !== 'render');
  const [found, setFound] = useState<FoundClip[]>([]);
  const [, tick] = useState(0);

  useEffect(() => {
    window.cortai.projects.found(id).then(setFound);
    const off = window.cortai.projects.onFound((ev) => ev.projectId === id && setFound((f) => [...f, ...ev.clips].sort((a, b) => b.score - a.score)));
    const timer = setInterval(() => tick((n) => n + 1), 1000); // relógio da etapa atual
    return () => { off(); clearInterval(timer); };
  }, [id]);

  useEffect(() => { if (project?.status === 'ready') go({ name: 'results', id }); }, [project?.status, id, go]);
  if (!project) return null;

  const byKind = new Map<JobKind, Job>(jobs.map((j) => [j.kind, j]));
  const running = jobs.find((j) => j.status === 'running');
  const stopped = project.status === 'cancelled' || project.status === 'error';
  const elapsed = running ? secs(running.startedAt, new Date().toISOString()) : 0;
  const eta = running && running.progress > 0.03 ? (elapsed / running.progress) * (1 - running.progress) : null;

  const detail = (j?: Job) => {
    if (!j?.detail) return '';
    const m = /^(\d+)\/(\d+)$/.exec(j.detail);
    if (m) return t(j.kind === 'analyze' ? 'proc.windows' : 'proc.clips', { a: m[1], b: m[2] });
    const w = /^(\d+) palavras$/.exec(j.detail);
    if (w) return t('proc.words', { n: Number(w[1]).toLocaleString() });
    return j.detail === 'baixando' ? t('proc.downloading') : j.detail === 'proxy' ? t('proc.proxy') : '';
  };

  return (
    <div className="mx-auto flex max-w-[720px] flex-col gap-6 px-8 py-10">
      <header className="flex items-baseline justify-between gap-4">
        <h1 className="min-w-0 truncate font-display text-2xl font-bold">{t('proc.title', { name: project.name })}</h1>
        {eta !== null && !stopped && <span className="shrink-0 font-mono text-[13px] text-muted">{t('proc.eta', { t: fmtClock(eta) })}</span>}
      </header>

      <ol className="flex flex-col gap-4 rounded-panel border border-border bg-surface p-5" aria-live="polite">
        {STEPS.map((k) => {
          const j = byKind.get(k);
          const st = j?.status ?? 'queued';
          return (
            <li key={k} className="flex flex-col gap-2">
              <div className="flex items-center gap-3">
                {st === 'done' ? <Check size={18} strokeWidth={2} className="text-success" aria-hidden="true" />
                  : st === 'running' ? <Loader2 size={18} strokeWidth={2} className="animate-spin text-ai motion-reduce:animate-none" aria-hidden="true" />
                  : st === 'error' ? <AlertCircle size={18} strokeWidth={2} className="text-danger" aria-hidden="true" />
                  : <Circle size={18} strokeWidth={1.75} className="text-muted" aria-hidden="true" />}
                <span className={`flex-1 ${st === 'queued' || st === 'cancelled' ? 'text-muted' : 'font-medium'}`}>
                  {t(`steps.${k}`)}{detail(j) && <span className="ml-2 text-[12px] font-normal text-muted">{detail(j)}</span>}
                </span>
                <span className="font-mono text-[12px] text-muted">
                  {st === 'done' ? fmtClock(secs(j?.startedAt, j?.updatedAt)) : st === 'running' ? `${Math.round((j?.progress ?? 0) * 100)}%` : ''}
                </span>
              </div>
              {st === 'running' && <Progress value={j!.progress} ai className="ml-[30px]" />}
            </li>
          );
        })}
      </ol>

      {stopped && (
        <p role="alert" className={`rounded-button border px-4 py-3 ${project.status === 'error' ? 'border-danger/40 bg-danger/10' : 'border-border bg-surface'}`}>
          {project.status === 'error' ? t('proc.error', { msg: project.error ?? '' }) : t('proc.cancelled')}
        </p>
      )}

      {found.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-[12px] font-medium text-muted">{t('proc.found')}</h2>
          <ul className="flex flex-wrap gap-2">
            {found.slice(0, 12).map((c, i) => (
              <li key={i} className="flex items-center gap-2 rounded-button border border-border bg-surface py-1 pr-3 pl-1">
                <ScoreRing score={c.score} size={28} />
                <span className="max-w-[220px] truncate text-[12px]">{c.title}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="flex justify-between gap-2">
        {stopped ? (
          <>
            <DeleteProject id={id} name={project.name} clips={project.clipCount} onDone={() => go({ name: 'home' })} />
            <Button variant="primary" icon={Play} onClick={() => window.cortai.projects.resume(id)}>{t('proc.resume')}</Button>
          </>
        ) : (
          <>
            <Button variant="ghost" icon={Minimize2} onClick={() => go({ name: 'home' })}>{t('proc.minimize')}</Button>
            <Button icon={X} onClick={() => window.cortai.projects.cancel(id)}>{t('proc.cancel')}</Button>
          </>
        )}
      </footer>
    </div>
  );
}
