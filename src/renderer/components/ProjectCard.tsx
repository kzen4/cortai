import { useTranslation } from 'react-i18next';
import { Film } from 'lucide-react';
import type { Job, JobKind, ProjectSummary } from '@shared/types';
import { Progress, fmtDuration } from './ui';
import { DeleteProject } from './DeleteProject';

const STEPS: JobKind[] = ['ingest', 'transcribe', 'analyze', 'reframe', 'finalize'];

export function ProjectCard({ p, jobs, onOpen }: { p: ProjectSummary; jobs: Job[]; onOpen: () => void }) {
  const { t } = useTranslation();
  const mine = jobs.filter((j) => j.projectId === p.id && j.kind !== 'render');
  const cur = mine.find((j) => j.status === 'running') ?? mine.find((j) => j.status === 'queued');
  const busy = p.status === 'processing' || p.status === 'importing';
  // progresso geral = etapas concluídas + fração da atual
  const overall = cur ? (STEPS.indexOf(cur.kind) + cur.progress) / STEPS.length : 0;
  return (
    <div className="relative">
    <button onClick={onOpen} className="group flex w-full cursor-pointer flex-col overflow-hidden rounded-panel border border-border bg-surface text-left transition-colors duration-150 hover:border-muted">
      <div className="relative aspect-video bg-surface-2">
        {p.thumb ? <img src={window.cortai.mediaUrl(p.thumb)} alt="" className="size-full object-cover" /> : <Film size={28} strokeWidth={1.5} aria-hidden="true" className="absolute inset-0 m-auto text-muted" />}
        {p.duration > 0 && <span className="absolute right-2 bottom-2 rounded-input bg-black/70 px-1.5 py-0.5 font-mono text-[11px]">{fmtDuration(p.duration)}</span>}
      </div>
      <div className="flex flex-col gap-1.5 p-3">
        <span className="truncate font-medium">{p.name}</span>
        {busy && cur ? (
          <>
            <Progress value={overall} ai />
            <span className="text-[12px] text-muted">{t(`steps.${cur.kind}`)} · {Math.round(overall * 100)}%</span>
          </>
        ) : (
          <span className={`text-[12px] ${p.status === 'error' ? 'text-danger' : 'text-muted'}`}>
            {p.status === 'ready' ? t('project.clips', { count: p.clipCount }) : t(`project.status.${p.status}`)}
          </span>
        )}
      </div>
    </button>
    <DeleteProject id={p.id} name={p.name} clips={p.clipCount} icon className="absolute top-2 right-2 bg-black/70 text-text" />
    </div>
  );
}
