import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { EngineStatus } from '@shared/types';
import { ENGINE_HEALTH_INTERVAL_MS } from '@shared/constants';
import { engineDir, engineVenv } from '../paths';
import { ndjson } from '../components';

const pythonPath = () =>
  join(engineVenv(), process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');

function freePort(): Promise<number> {
  return new Promise((res, rej) => {
    const s = createServer().listen(0, '127.0.0.1', () => {
      const { port } = s.address() as { port: number };
      s.close(() => res(port));
    }).on('error', rej);
  });
}

export class Cancelled extends Error { constructor() { super('cancelado'); } }

export class Sidecar {
  status: EngineStatus = 'starting';
  port = 0;
  readonly token = randomBytes(24).toString('hex');
  private proc: ChildProcess | null = null;
  private timer: NodeJS.Timeout | null = null;
  private quitting = false;

  constructor(private onStatus: (s: EngineStatus) => void) {}

  private set(s: EngineStatus) {
    if (s !== this.status) { this.status = s; this.onStatus(s); }
  }

  async start() {
    if (this.proc) return;
    if (!existsSync(pythonPath())) { this.set('down'); return; } // motor ainda não instalado (assistente)
    this.quitting = false;
    this.port = await freePort();
    this.set('starting');
    this.proc = spawn(pythonPath(), ['-m', 'cortai_engine.server', '--port', String(this.port)], {
      cwd: engineDir(), env: { ...process.env, CORTAI_TOKEN: this.token, PYTHONIOENCODING: 'utf-8' }, windowsHide: true,
    });
    this.proc.stderr?.on('data', (d) => console.error('[engine]', String(d).trim()));
    this.proc.on('exit', (code) => {
      this.proc = null;
      if (this.quitting) return;
      console.error('[engine] caiu com código', code, '— reiniciando');
      this.set('down');
      setTimeout(() => this.start(), 2000);
    });
    if (!this.timer) this.timer = setInterval(() => this.check(), ENGINE_HEALTH_INTERVAL_MS);
  }

  private async check() {
    if (!this.proc) return;
    try {
      const r = await fetch(this.url('/health'), { headers: this.headers(), signal: AbortSignal.timeout(1500) });
      this.set(r.ok ? 'ok' : 'down');
    } catch {
      if (this.status === 'ok') this.set('down');
    }
  }

  private url = (path: string) => `http://127.0.0.1:${this.port}${path}`;
  private headers = () => ({ 'X-Cortai-Token': this.token, 'Content-Type': 'application/json' });

  async waitReady(timeoutMs = 60000): Promise<boolean> {
    await this.start();
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      if (this.status === 'ok') return true;
      await this.check();
      await new Promise((r) => setTimeout(r, 500));
    }
    return false;
  }

  /** POST com resposta NDJSON: repassa o progresso e devolve o `result` final. */
  async stream(path: string, body: unknown, onEvent: (ev: Record<string, unknown>) => void, signal?: AbortSignal): Promise<Record<string, unknown>> {
    if (!(await this.waitReady())) throw new Error('O motor de IA não está rodando.');
    try {
      const res = await fetch(this.url(path), { method: 'POST', headers: this.headers(), body: JSON.stringify(body), signal });
      for await (const ev of ndjson(res)) {
        if (ev.error) throw new Error(String(ev.error));
        if (ev.cancelled) throw new Cancelled();
        if (ev.done) return (ev.result as Record<string, unknown>) ?? {};
        onEvent(ev);
      }
    } catch (e) {
      if (signal?.aborted) throw new Cancelled();
      throw e;
    }
    throw new Error('O motor de IA encerrou sem terminar o trabalho.');
  }

  async restart() { this.kill(); this.quitting = false; await this.start(); }

  private kill() {
    this.quitting = true;
    if (!this.proc?.pid) return;
    // no Windows o python.exe do venv é um lançador com o Python real como filho: derrubar a árvore toda
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(this.proc.pid), '/T', '/F'], { windowsHide: true });
    else this.proc.kill();
    this.proc = null;
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.kill();
  }
}
