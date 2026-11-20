import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, renameSync, statSync, unlinkSync } from 'node:fs';
import { once } from 'node:events';

export interface DownloadOpts {
  signal?: AbortSignal;
  sha256?: string;
  onProgress?: (got: number, total: number) => void;
}

export async function sha256File(path: string): Promise<string> {
  const h = createHash('sha256');
  for await (const chunk of createReadStream(path)) h.update(chunk as Buffer);
  return h.digest('hex');
}

/** Baixa `url` em `dest`. Pausar = abortar; o `.part` fica e o próximo download continua de onde parou (Range). */
export async function download(url: string, dest: string, o: DownloadOpts = {}): Promise<void> {
  const part = dest + '.part';
  let got = existsSync(part) ? statSync(part).size : 0;
  const res = await fetch(url, { headers: got ? { Range: `bytes=${got}-` } : {}, signal: o.signal, redirect: 'follow' });
  if (res.status === 416) got = statSync(part).size; // já estava completo
  else if (!res.ok) throw new Error(`HTTP ${res.status} ao baixar ${url}`);
  else {
    if (res.status === 200) got = 0; // servidor ignorou o Range: recomeça
    const total = got + Number(res.headers.get('content-length') || 0);
    const out = createWriteStream(part, { flags: got ? 'a' : 'w' });
    try {
      for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
        if (!out.write(chunk)) await once(out, 'drain');
        got += chunk.length;
        o.onProgress?.(got, total);
      }
    } finally {
      out.end();
      await once(out, 'close');
    }
  }
  if (o.sha256) {
    const h = await sha256File(part);
    if (h !== o.sha256.toLowerCase()) {
      unlinkSync(part); // corrompido: não adianta retomar
      throw new Error('Arquivo baixado não confere (SHA-256). Tente de novo.');
    }
  }
  renameSync(part, dest);
}

/** Lê o hash publicado: arquivo `.sha256` ("<hash>  nome") ou lista de vários arquivos. */
export async function fetchSha(url: string, fileName: string): Promise<string> {
  const txt = await (await fetch(url, { redirect: 'follow' })).text();
  const line = txt.split('\n').find((l) => l.trim().endsWith(fileName) || l.trim().split(/\s+/).length === 1) ?? '';
  const hash = line.trim().split(/\s+/)[0];
  if (!/^[a-f0-9]{64}$/i.test(hash)) throw new Error(`Hash não encontrado para ${fileName}`);
  return hash;
}
