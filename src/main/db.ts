import { app } from 'electron';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Job, JobKind, Settings } from '@shared/types';
import { defaultOutputDir } from './paths';

// SQLite nativo do Node (sem módulo nativo para recompilar no Electron): índice de projetos, fila e configurações.
mkdirSync(app.getPath('userData'), { recursive: true });
export const db = new DatabaseSync(join(app.getPath('userData'), 'cortai.db'));
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, dir TEXT NOT NULL, status TEXT NOT NULL,
    duration REAL DEFAULT 0, clip_count INTEGER DEFAULT 0, thumb TEXT, error TEXT,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT NOT NULL, kind TEXT NOT NULL,
    status TEXT NOT NULL, progress REAL DEFAULT 0, detail TEXT, error TEXT, payload TEXT,
    started_at TEXT, updated_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  -- app fechado no meio: o que estava rodando volta para a fila e retoma do último artefato salvo
  UPDATE jobs SET status = 'queued' WHERE status = 'running';
`);

export const now = () => new Date().toISOString();

const DEFAULTS: Settings = { setupDone: false, profile: 'balanced', whisper: 'large-v3-turbo', llm: 'qwen2.5:7b', outputDir: '' };
export function getSettings(): Settings {
  const s = { ...DEFAULTS, outputDir: defaultOutputDir() } as Record<string, unknown>;
  for (const r of db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[]) s[r.key] = JSON.parse(r.value);
  return s as unknown as Settings;
}
export function setSettings(patch: Partial<Settings>) {
  const st = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  for (const [k, v] of Object.entries(patch)) st.run(k, JSON.stringify(v));
}

type JobRow = { id: number; project_id: string; kind: JobKind; status: Job['status']; progress: number; detail: string | null; error: string | null; payload: string | null; started_at: string | null; updated_at: string };
export const toJob = (r: JobRow): Job => ({
  id: r.id, projectId: r.project_id, kind: r.kind, status: r.status, progress: r.progress,
  detail: r.detail ?? undefined, error: r.error ?? undefined, payload: r.payload ? JSON.parse(r.payload) : undefined,
  startedAt: r.started_at ?? undefined, updatedAt: r.updated_at,
});
export const jobRows = (where = '1=1', ...args: (string | number)[]) =>
  (db.prepare(`SELECT * FROM jobs WHERE ${where} ORDER BY id`).all(...args) as JobRow[]).map(toJob);
