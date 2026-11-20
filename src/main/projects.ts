import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { SCHEMA_VERSION } from '@shared/constants';
import type { Clip, FoundClip, GenerationSettings, Project, ProjectSummary, SourceInfo, Transcript } from '@shared/types';
import { db, now } from './db';
import { projectsRoot } from './paths';

export const projectDir = (id: string) => join(projectsRoot(), id);

function readJson<T>(p: string): T { return JSON.parse(readFileSync(p, 'utf8')); }
/** Escrita atômica (crash no meio não corrompe o projeto). */
export function writeJson(p: string, data: unknown) {
  mkdirSync(join(p, '..'), { recursive: true });
  writeFileSync(p + '.tmp', JSON.stringify({ schemaVersion: SCHEMA_VERSION, ...(data as object) }, null, 1));
  renameSync(p + '.tmp', p);
}

export function createProject(src: SourceInfo, generation: GenerationSettings): Project {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const dir = projectDir(id);
  for (const d of ['source', 'cache', 'analysis', 'clips']) mkdirSync(join(dir, d), { recursive: true });
  const t = now();
  const p: Project = {
    id, name: src.name, createdAt: t, updatedAt: t,
    source: { path: src.path ?? '', url: src.url, duration: src.duration, width: src.width, height: src.height, fps: src.fps },
    generation, status: 'importing', clipIds: [],
  };
  writeJson(join(dir, 'project.json'), p);
  db.prepare('INSERT INTO projects (id, name, dir, status, duration, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, p.name, dir, p.status, p.source.duration, t, t);
  return p;
}

export const loadProject = (id: string) => readJson<Project>(join(projectDir(id), 'project.json'));

export function saveProject(p: Project, extra: { thumb?: string; error?: string | null } = {}) {
  p.updatedAt = now();
  writeJson(join(projectDir(p.id), 'project.json'), p);
  setStatus(p.id, p.status, extra.error ?? null);
  db.prepare('UPDATE projects SET duration = ?, clip_count = ?, thumb = COALESCE(?, thumb) WHERE id = ?')
    .run(p.source.duration, p.clipIds.length, extra.thumb ?? null, p.id);
}

/** Status no índice; 'cancelled' só existe no índice (o project.json fica como estava). */
export function setStatus(id: string, status: ProjectSummary['status'], error: string | null = null) {
  db.prepare('UPDATE projects SET status = ?, error = ?, updated_at = ? WHERE id = ?').run(status, error, now(), id);
}

type Row = { id: string; name: string; status: ProjectSummary['status']; duration: number; clip_count: number; thumb: string | null; error: string | null; created_at: string };
export function listProjects(): ProjectSummary[] {
  return (db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all() as Row[]).map((r) => ({
    id: r.id, name: r.name, status: r.status, duration: r.duration, clipCount: r.clip_count,
    thumb: r.thumb && existsSync(r.thumb) ? r.thumb : undefined, createdAt: r.created_at, error: r.error ?? undefined,
  }));
}

/**
 * Apaga o projeto inteiro e de vez: pasta do projeto (cortes, edições, cache, vídeo baixado de link) e os arquivos já
 * exportados (.mp4/.srt/.txt), achados pelo histórico de exportações dele — outro projeto com o mesmo nome não é tocado.
 * O vídeo original que o usuário importou do computador fica (é dele).
 */
const exportsFile = (id: string) => join(projectDir(id), 'exports.json');
/** Anota um arquivo exportado (o histórico da fila pode ser limpo pelo usuário; este não). */
export function recordExport(id: string, mp4: string) {
  const list = existsSync(exportsFile(id)) ? readJson<{ files: string[] }>(exportsFile(id)).files : [];
  if (!list.includes(mp4)) writeJson(exportsFile(id), { files: [...list, mp4] });
}

export function deleteProject(id: string) {
  const fromJobs = (db.prepare("SELECT payload FROM jobs WHERE project_id = ? AND kind = 'render' AND payload IS NOT NULL").all(id) as { payload: string }[])
    .map((r) => (JSON.parse(r.payload) as { outPath?: string }).outPath).filter((p): p is string => !!p);
  let recorded: string[] = [];
  try { recorded = readJson<{ files: string[] }>(exportsFile(id)).files; } catch { /* projeto sem exports */ }
  for (const mp4 of new Set([...fromJobs, ...recorded])) {
    const base = mp4.replace(/\.mp4$/i, '');
    for (const f of [mp4, `${base}.part.mp4`, `${base}.srt`, `${base}.txt`]) rmSync(f, { force: true });
    const dir = dirname(mp4);
    try { if (existsSync(dir) && !readdirSync(dir).length) rmdirSync(dir); } catch { /* pasta em uso: fica vazia */ }
  }
  rmSync(projectDir(id), { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); // ffmpeg cancelado pode demorar a soltar o arquivo
  db.prepare('DELETE FROM jobs WHERE project_id = ?').run(id);
  db.prepare('DELETE FROM projects WHERE id = ?').run(id);
}

export const clipPath = (projectId: string, clipId: string) => join(projectDir(projectId), 'clips', `${clipId}.json`);
export const loadClip = (projectId: string, clipId: string) => readJson<Clip>(clipPath(projectId, clipId));
export const saveClip = (c: Clip) => writeJson(clipPath(c.projectId, c.id), c);

export function loadClips(projectId: string): Clip[] {
  const p = loadProject(projectId);
  return p.clipIds.filter((id) => existsSync(clipPath(projectId, id))).map((id) => loadClip(projectId, id));
}

export function deleteClip(projectId: string, clipId: string) {
  const p = loadProject(projectId);
  p.clipIds = p.clipIds.filter((c) => c !== clipId);
  rmSync(clipPath(projectId, clipId), { force: true });
  saveProject(p);
}

export function duplicateClip(projectId: string, clipId: string): Clip {
  const p = loadProject(projectId);
  const c = loadClip(projectId, clipId);
  let n = 1;
  while (p.clipIds.includes(`${clipId}-${n}`)) n++;
  const copy = { ...c, id: `${clipId}-${n}`, title: `${c.title} (cópia)`, favorite: false };
  saveClip(copy);
  p.clipIds.splice(p.clipIds.indexOf(clipId) + 1, 0, copy.id);
  saveProject(p);
  return copy;
}

export const loadTranscript = (id: string) => readJson<Transcript>(join(projectDir(id), 'analysis', 'transcript.json'));

/** Cortes já encontrados pela IA durante a análise (para a tela de processamento). */
export function foundClips(id: string): FoundClip[] {
  const dir = join(projectDir(id), 'analysis', 'windows');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((f) => readJson<FoundClip[]>(join(dir, f)).map((c) => ({ title: c.title, score: c.score })))
    .sort((a, b) => b.score - a.score);
}

export const proxyPath = (id: string) => join(projectDir(id), 'source', 'proxy.mp4');

/** Picos do áudio (0–100) a cada 50 ms para a onda da timeline; calculado uma vez e guardado em cache. */
export function peaks(id: string): number[] {
  const cache = join(projectDir(id), 'cache', 'peaks.json');
  if (existsSync(cache)) return readJson<{ peaks: number[] }>(cache).peaks;
  const wav = readFileSync(join(projectDir(id), 'cache', 'audio.wav'));
  const data = wav.indexOf('data') + 8; // PCM 16 bits mono 16 kHz (gerado no ingest)
  const step = 800; // 50 ms
  const out: number[] = [];
  for (let i = data; i + 1 < wav.length; i += step * 2) {
    let m = 0;
    for (let j = i; j < Math.min(i + step * 2, wav.length - 1); j += 8) m = Math.max(m, Math.abs(wav.readInt16LE(j)));
    out.push(Math.round((m / 32768) * 100));
  }
  writeJson(cache, { peaks: out });
  return out;
}

/** Keyframes automáticos originais (para o botão "Seguir rosto automaticamente"). */
export function autoReframe(projectId: string, clipId: string) {
  const p = join(projectDir(projectId), 'analysis', 'reframe.json');
  return existsSync(p) ? (readJson<Record<string, unknown>>(p)[clipId.split('-')[0]] ?? []) : [];
}
