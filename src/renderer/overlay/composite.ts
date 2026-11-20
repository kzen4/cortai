// Quadro base do preview (vídeo recortado/encaixado). Espelha src/main/ffmpeg/graph.ts (export).
import { ASPECT_SIZE } from '@shared/constants';
import { reframeAt } from '@shared/reframe';
import { cropRect } from '@shared/timeline';
import type { Clip } from '@shared/types';

/** Desenha o quadro do vídeo no instante `rel` (s desde clip.in) no formato e layout do clipe. */
export function drawBase(ctx: CanvasRenderingContext2D, video: HTMLVideoElement, clip: Pick<Clip, 'layout' | 'reframe'>, rel: number) {
  const { width: W, height: H } = ctx.canvas;
  const vw = video.videoWidth, vh = video.videoHeight;
  if (!vw) return;
  const mode = clip.layout.mode;
  if (mode === 'blur-bg' || mode === 'color-bg') {
    const k = W / ASPECT_SIZE[clip.layout.aspect][0]; // blur é definido em pixels do export
    if (mode === 'blur-bg') {
      const s = Math.max(W / vw, H / vh);
      ctx.filter = `blur(${(clip.layout.bgBlur ?? 30) * k}px)`;
      ctx.drawImage(video, (W - vw * s) / 2, (H - vh * s) / 2, vw * s, vh * s);
      ctx.filter = 'none';
    } else {
      ctx.fillStyle = clip.layout.bgColor ?? '#0B0B0F';
      ctx.fillRect(0, 0, W, H);
    }
    const s = vw / vh >= W / H ? W / vw : H / vh; // vídeo inteiro, encaixado
    ctx.drawImage(video, (W - vw * s) / 2, (H - vh * s) / 2, vw * s, vh * s);
    return;
  }
  const { x, y } = reframeAt(clip.reframe, rel);
  const c = cropRect(vw, vh, clip.layout.aspect, x, y, clip.reframe[0]?.zoom ?? 1);
  ctx.drawImage(video, c.sx, c.sy, c.sw, c.sh, 0, 0, W, H);
}
