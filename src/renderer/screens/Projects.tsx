import { useTranslation } from 'react-i18next';
import { useJobs, useProjects, type Route } from '../app/data';
import { ProjectCard } from '../components/ProjectCard';

export function Projects({ go }: { go: (r: Route) => void }) {
  const { t } = useTranslation();
  const projects = useProjects();
  const jobs = useJobs();
  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-6 px-8 py-8">
      <h1 className="font-display text-2xl font-bold">{t('projects.title')}</h1>
      {projects.length ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
          {projects.map((p) => <ProjectCard key={p.id} p={p} jobs={jobs} onOpen={() => go({ name: p.status === 'ready' ? 'results' : 'processing', id: p.id })} />)}
        </div>
      ) : <p className="text-muted">{t('projects.empty')}</p>}
    </div>
  );
}
