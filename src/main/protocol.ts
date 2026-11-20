import { protocol } from 'electron';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname } from 'node:path';
import { Readable } from 'node:stream';

export const MEDIA_SCHEME = 'cortai-media';

const TYPES: Record<string, string> = {
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm',
  '.mkv': 'video/x-matroska', '.wav': 'audio/wav', '.jpg': 'image/jpeg', '.png': 'image/png',
};

export function registerMediaScheme() {
  protocol.registerSchemesAsPrivileged([
    { scheme: MEDIA_SCHEME, privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true } },
  ]);
}

/** Pedidos parciais (Range) a resposta 206 — sem isso o <video> não consegue pular para outro ponto. */
export function parseRange(header: string | null, size: number): [number, number] | null {
  const m = header && /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (!m[1] && !m[2])) return null;
  const start = m[1] ? +m[1] : Math.max(0, size - +m[2]);
  const end = m[1] && m[2] ? Math.min(+m[2], size - 1) : size - 1;
  return start <= end ? [start, end] : null;
}

// cortai-media://local/<caminho codificado> → arquivo local (o renderer não acessa o disco)
// ponytail: serve qualquer caminho; restringir às pastas de projeto quando existirem (Fase 1).
export function handleMediaScheme() {
  protocol.handle(MEDIA_SCHEME, async (req) => {
    const path = decodeURIComponent(new URL(req.url).pathname.slice(1));
    let size: number;
    try { size = (await stat(path)).size; } catch { return new Response('não encontrado', { status: 404 }); }
    const headers: Record<string, string> = { 'Content-Type': TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream', 'Accept-Ranges': 'bytes' };
    const range = parseRange(req.headers.get('range'), size);
    const [start, end] = range ?? [0, size - 1];
    headers['Content-Length'] = String(end - start + 1);
    if (range) headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
    const body = Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream;
    return new Response(body, { status: range ? 206 : 200, headers });
  });
}
