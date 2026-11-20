import { useEffect, useState } from 'react';
import type { ComponentState, Job, ProjectSummary } from '@shared/types';

/** Lista de projetos sempre atualizada (eventos do Main). */
export function useProjects() {
  const [list, setList] = useState<ProjectSummary[]>([]);
  useEffect(() => {
    const load = () => window.cortai.projects.list().then(setList);
    load();
    const offP = window.cortai.projects.onChange(load);
    const offJ = window.cortai.jobs.onChange(load); // status/etapa mudam junto com a fila
    return () => { offP(); offJ(); };
  }, []);
  return list;
}

export function useJobs() {
  const [jobs, setJobs] = useState<Job[]>([]);
  useEffect(() => {
    window.cortai.jobs.list().then(setJobs);
    return window.cortai.jobs.onChange(setJobs);
  }, []);
  return jobs;
}

export function useComponents() {
  const [list, setList] = useState<ComponentState[]>([]);
  useEffect(() => {
    window.cortai.components.list().then(setList);
    return window.cortai.components.onChange(setList);
  }, []);
  return list;
}

export type Route =
  | { name: 'home' | 'projects' | 'templates' | 'brandkits' | 'exports' | 'lab' | 'settings' }
  | { name: 'processing' | 'results'; id: string }
  | { name: 'editor'; projectId: string; clipId: string };
