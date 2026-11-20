import { Notification, type BrowserWindow } from 'electron';
import type { Job, JobKind } from '@shared/types';
import { db, jobRows, now } from '../db';
import { Cancelled, type Sidecar } from '../engine/sidecar';
import { loadProject, saveProject, setStatus } from '../projects';
import { RUNNERS } from './runners';

const PIPELINE: JobKind[] = ['ingest', 'transcribe', 'analyze', 'reframe', 'finalize'];

/**
 * Fila persistida no SQLite. Duas pistas: pipeline (1 por vez: GPU) e render (1 por vez: uma janela de overlay).
 * Cada etapa grava seu artefato em disco; ao reabrir o app, o que estava rodando volta a 'queued' e retoma.
 */
export class Queue {
  private running = new Map<'pipe' | 'render', { job: Job; ctl: AbortController }>();
  private lastEmit = 0;
  private closing = false;

  /** App fechando: o que está rodando fica 'running' no banco e volta para a fila na próxima abertura. */
  shutdown() {
    this.closing = true;
    for (const r of this.running.values()) r.ctl.abort();
  }

  constructor(private deps: { sidecar: Sidecar; preload: string; openWorker: (w: BrowserWindow) => void; emit: (ch: string, data: unknown) => void }) {}

  list = () => jobRows();
  private changed() { this.deps.emit('jobs:changed', this.list()); }

  /** Enfileira as etapas que ainda não terminaram (serve para começar e para retomar). */
  enqueuePipeline(projectId: string) {
    db.prepare(`DELETE FROM jobs WHERE project_id = ? AND kind != 'render' AND status IN ('cancelled','error')`).run(projectId);
    const done = new Set(jobRows(`project_id = ? AND status IN ('done','queued','running')`, projectId).map((j) => j.kind));
    for (const kind of PIPELINE) if (!done.has(kind)) this.insert(projectId, kind);
    setStatus(projectId, 'processing');
    this.changed();
    this.tick();
  }

  enqueueRender(projectId: string, clipIds: string[]) {
    for (const clipId of clipIds) this.insert(projectId, 'render', { clipId });
    this.changed();
    this.tick();
  }

  private insert(projectId: string, kind: JobKind, payload?: Job['payload']) {
    db.prepare('INSERT INTO jobs (project_id, kind, status, payload, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(projectId, kind, 'queued', payload ? JSON.stringify(payload) : null, now());
  }

  cancelProject(projectId: string) {
    db.prepare(`UPDATE jobs SET status = 'cancelled', updated_at = ? WHERE project_id = ? AND kind != 'render' AND status = 'queued'`).run(now(), projectId);
    const r = this.running.get('pipe');
    if (r?.job.projectId === projectId) r.ctl.abort();
    setStatus(projectId, 'cancelled');
    this.changed();
  }

  cancelJob(id: number) {
    db.prepare(`UPDATE jobs SET status = 'cancelled', updated_at = ? WHERE id = ? AND status = 'queued'`).run(now(), id);
    for (const r of this.running.values()) if (r.job.id === id) r.ctl.abort();
    this.changed();
  }

  /** Remove da lista os renders terminados/cancelados. */
  clearFinished() {
    db.prepare(`DELETE FROM jobs WHERE kind = 'render' AND status IN ('done','cancelled','error')`).run();
    this.changed();
  }

  tick() {
    if (!this.running.has('pipe')) {
      // próxima etapa da fila cujo projeto não tem etapa anterior pendente
      const next = jobRows(`status = 'queued' AND kind != 'render'`).find((j) =>
        !jobRows(`project_id = ? AND kind != 'render' AND id < ? AND status != 'done'`, j.projectId, j.id).length);
      if (next) void this.run('pipe', next);
    }
    if (!this.running.has('render')) {
      const next = jobRows(`status = 'queued' AND kind = 'render'`)[0];
      if (next) void this.run('render', next);
    }
  }

  private update(id: number, set: Record<string, string | number | null>) {
    const keys = Object.keys(set);
    db.prepare(`UPDATE jobs SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`).run(...keys.map((k) => set[k]), now(), id);
  }

  private async run(lane: 'pipe' | 'render', job: Job) {
    const ctl = new AbortController();
    this.running.set(lane, { job, ctl });
    this.update(job.id, { status: 'running', progress: 0, error: null, started_at: now() });
    this.changed();
    try {
      await RUNNERS[job.kind](job, {
        signal: ctl.signal, sidecar: this.deps.sidecar, preload: this.deps.preload, openWorker: this.deps.openWorker, emit: this.deps.emit,
        setPayload: (payload) => this.update(job.id, { payload: JSON.stringify(payload) }),
        progress: (p, detail) => {
          this.update(job.id, { progress: p, detail: detail ?? null });
          if (Date.now() - this.lastEmit > 200) { this.lastEmit = Date.now(); this.changed(); }
        },
      });
      this.update(job.id, { status: 'done', progress: 1 });
    } catch (e) {
      if (this.closing) return;
      const cancelled = e instanceof Cancelled || ctl.signal.aborted;
      this.update(job.id, { status: cancelled ? 'cancelled' : 'error', error: cancelled ? null : (e as Error).message });
      if (!cancelled) console.error(`[job ${job.kind}]`, e);
      if (lane === 'pipe') {
        // etapa falhou: as próximas do mesmo projeto não fazem sentido
        db.prepare(`UPDATE jobs SET status = 'cancelled' WHERE project_id = ? AND kind != 'render' AND status = 'queued'`).run(job.projectId);
        if (!cancelled) {
          const p = loadProject(job.projectId);
          p.status = 'error';
          saveProject(p, { error: (e as Error).message });
        }
      }
    } finally {
      if (this.closing) return; // eslint-disable-line no-unsafe-finally
      this.running.delete(lane);
      this.changed();
      if (job.kind === 'finalize' || job.kind === 'render') this.deps.emit('projects:changed', null);
      if (lane === 'render' && !jobRows(`kind = 'render' AND status IN ('queued','running')`).length && job.kind === 'render') {
        new Notification({ title: 'Cortaí', body: 'Exportação concluída.' }).show();
      }
      this.tick();
    }
  }
}
