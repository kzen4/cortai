// Projeto sintético para os testes E2E e para a gravação da demo (sem conteúdo de ninguém).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { CAPTION_TEMPLATES } from '../src/shared/templates';

export const ID = 'e2eprojeto';

/** Projeto sintético: 10 s, um trecho cortado (4–5 s) → 2 pedaços na timeline. */
export function seedProject(HOME: string, opts: { duration?: number; withMedia?: (dir: string) => void } = {}) {
  const D = opts.duration ?? 10;
  const dir = join(HOME, 'projects', ID);
  for (const d of ['source', 'cache', 'analysis', 'clips']) mkdirSync(join(dir, d), { recursive: true });
  const now = new Date().toISOString();
  const json = (f: string, o: object) => writeFileSync(join(dir, f), JSON.stringify({ schemaVersion: 1, ...o }));
  json('project.json', {
    id: ID, name: 'Projeto de teste', createdAt: now, updatedAt: now,
    source: { path: '', duration: D, width: 1920, height: 1080, fps: 30 },
    generation: { language: 'pt', targetDuration: 'auto', maxClips: 'auto', aspect: '9:16', captionTemplateId: 'hormozi' },
    status: 'ready', clipIds: ['c01'],
  });
  const texto = 'olha só esse corte de teste que mostra o editor funcionando do começo ao fim sem nenhum modelo'.split(' ');
  json('analysis/transcript.json', { language: 'pt', words: texto.map((t, i) => ({ i, text: t, start: i * (D / texto.length), end: i * (D / texto.length) + 0.4, conf: 1 })) });
  if (opts.withMedia) opts.withMedia(dir); // vídeo de verdade (proxy.mp4 + audio.wav): o app calcula a onda
  else json('cache/peaks.json', { peaks: Array.from({ length: D * 20 }, (_, i) => 20 + ((i * 37) % 60)) });
  json('clips/c01.json', {
    id: 'c01', projectId: ID, title: 'Corte de teste', description: '', hashtags: [], score: 80,
    scores: { hook: 80, value: 80, standalone: 80, ending: 80 }, reason: '', favorite: false,
    in: 0, out: D, cuts: [[4, 5]], wordEdits: {},
    layout: { aspect: '9:16', mode: 'single', smoothing: 0.5 }, reframe: [],
    caption: CAPTION_TEMPLATES.hormozi, tracks: [], audio: { speechGain: 1, denoise: false },
  });
  const db = new DatabaseSync(join(HOME, 'data', 'cortai.db'));
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run('setupDone', 'true');
  db.prepare('INSERT OR REPLACE INTO projects (id, name, dir, status, duration, clip_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(ID, 'Projeto de teste', dir, 'ready', D, 1, now, now);
  db.close();
}

