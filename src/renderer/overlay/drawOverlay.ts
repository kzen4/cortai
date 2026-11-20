// Implementação ÚNICA de desenho de legendas/cards: usada no preview e no export (seção 9.4).
import { captionAt, displayText, popScale, type CaptionChunk } from '@shared/captions';
import { fontCss } from '@shared/templates';
import type { CaptionStyle, Word } from '@shared/types';

export interface OverlayInput { chunks: CaptionChunk[]; caption: CaptionStyle }

const ANIM = 0.2; // s
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const norm = (s: string) => s.toLocaleLowerCase('pt-BR').replace(/[^\p{L}\p{N}]/gu, '');

/** Progresso da animação da palavra ativa (0–1). É o que muda entre quadros. */
function phase(c: CaptionStyle, w: Word, t: number): number {
  if (c.animation === 'typewriter') return clamp01((t - w.start) / Math.max(0.05, w.end - w.start));
  if (c.animation === 'pop' || c.animation === 'bounce' || c.animation === 'fade') return clamp01((t - w.start) / ANIM);
  return 1;
}

/** Chave do que seria desenhado em t: quadros com a mesma chave são idênticos (o export reaproveita). */
export function overlayKey(input: OverlayInput, t: number): string {
  const hit = captionAt(input.chunks, t);
  if (!hit) return '';
  const w = hit.chunk.words[hit.active];
  const p = phase(input.caption, w, t);
  const q = input.caption.animation === 'typewriter' ? Math.ceil(p * w.text.length) : Math.round(p * 30);
  return `${hit.chunk.start}|${hit.active}|${q}`;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.min(r, h / 2));
  ctx.fill();
}

export function drawOverlay(ctx: CanvasRenderingContext2D, input: OverlayInput, t: number) {
  const { width: W, height: H } = ctx.canvas;
  ctx.clearRect(0, 0, W, H);
  const hit = captionAt(input.chunks, t);
  if (!hit) return;
  const s = input.caption;
  // tudo é proporcional à altura de referência 1920: preview pequeno = mesma composição do export
  let k = H / 1920;
  const texts = hit.chunk.words.map((w) => displayText(w.text, s.uppercase));
  ctx.font = fontCss(s.font, s.size * k);
  // linha longa demais encolhe para caber em 90% da largura
  const raw = ctx.measureText(texts.join(' ')).width + (s.box ? s.box.padding * 2 * k : 0);
  if (raw > W * 0.9) { k *= (W * 0.9) / raw; ctx.font = fontCss(s.font, s.size * k); }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;

  const widths = texts.map((tx) => ctx.measureText(tx).width);
  const space = ctx.measureText(' ').width;
  const total = widths.reduce((a, b) => a + b, 0) + space * (texts.length - 1);
  const y = (H * s.positionY) / 100;
  const fs = s.size * k;
  const keywords = new Set(s.keywords.flatMap((kw) => kw.split(/\s+/)).map(norm).filter(Boolean));
  const activeWord = hit.chunk.words[hit.active];
  const p = phase(s, activeWord, t);

  if (s.box) {
    ctx.fillStyle = s.box.color;
    const pad = s.box.padding * k;
    roundRect(ctx, W / 2 - total / 2 - pad, y - fs * 0.62 - pad * 0.5, total + pad * 2, fs * 1.24 + pad, s.box.radius * k);
  }

  let x = W / 2 - total / 2;
  texts.forEach((tx, i) => {
    const cx = x + widths[i] / 2;
    x += widths[i] + space;
    const active = i === hit.active;
    const future = i > hit.active;
    if (future && (s.animation === 'fade' || s.animation === 'typewriter')) return; // ainda não foi dita
    let text = tx;
    let scale = 1, dy = 0, alpha = 1;
    if (active) {
      if (s.animation === 'pop') scale = popScale(t - activeWord.start);
      if (s.animation === 'bounce') { dy = -Math.sin(p * Math.PI) * fs * 0.18; scale = 1 + Math.sin(p * Math.PI) * 0.08; }
      if (s.animation === 'fade') alpha = p;
      if (s.animation === 'typewriter') text = tx.slice(0, Math.max(1, Math.ceil(p * tx.length)));
      if (s.animation === 'highlight') {
        ctx.fillStyle = s.highlightColor;
        roundRect(ctx, cx - widths[i] / 2 - fs * 0.14, y - fs * 0.6, widths[i] + fs * 0.28, fs * 1.2, fs * 0.18);
      }
    }
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cx, y + dy);
    ctx.scale(scale, scale);
    const align = s.animation === 'typewriter' && active ? (ctx.measureText(text).width - widths[i]) / 2 : 0; // digita da esquerda p/ direita
    if (s.shadow) { ctx.shadowColor = s.shadow.color; ctx.shadowBlur = s.shadow.blur * k; ctx.shadowOffsetX = s.shadow.x * k; ctx.shadowOffsetY = s.shadow.y * k; }
    if (s.strokeWidth > 0) {
      ctx.lineWidth = s.strokeWidth * 2 * k;
      ctx.strokeStyle = s.strokeColor;
      ctx.strokeText(text, align, 0);
      ctx.shadowColor = 'transparent';
    }
    const isKey = keywords.has(norm(hit.chunk.words[i].text));
    ctx.fillStyle = active ? (s.animation === 'highlight' ? s.color : s.highlightColor) : isKey ? s.highlightColor : s.color;
    ctx.fillText(text, align, 0);
    ctx.restore();
  });
}

/** Garante as fontes carregadas antes de desenhar (export e preview). */
export const loadCaptionFont = (c: CaptionStyle) => document.fonts.load(fontCss(c.font, 40));
