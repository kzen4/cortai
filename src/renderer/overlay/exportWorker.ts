import { chunkWords } from '@shared/captions';
import { drawOverlay, loadBrand, loadCaptionFont, overlayKey, registerKitFonts } from './drawOverlay';

/** Janela oculta do export: desenha cada quadro com o drawOverlay e manda RGBA cru ao Main (→ ffmpeg). */
export async function runExportWorker() {
  const job = await window.cortai.render.job();
  if (!job) return;
  if (job.brand) await registerKitFonts([job.brand]); // fonte própria do kit pode estar na legenda
  await loadCaptionFont(job.caption);
  const canvas = document.createElement('canvas');
  canvas.width = job.width;
  canvas.height = job.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const input = { chunks: chunkWords(job.words, job.caption.wordsPerLine), caption: job.caption, brand: await loadBrand(job.brand), duration: job.duration };
  const frames = Math.round(job.duration * job.fps);
  let last: string | null = null;
  for (let f = 0; f < frames; f++) {
    const t = f / job.fps;
    const key = overlayKey(input, t);
    if (key === last) { await window.cortai.render.frame(null); continue; } // Main repete o quadro anterior
    last = key;
    drawOverlay(ctx, input, t);
    await window.cortai.render.frame(ctx.getImageData(0, 0, job.width, job.height).data);
  }
  await window.cortai.render.end();
}
