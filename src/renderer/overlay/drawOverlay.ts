// Implementação ÚNICA de desenho de legendas/cards: usada no preview e no export (seção 9.4).
import { captionAt, displayText, popScale, type CaptionChunk } from '@shared/captions';
import { fontCss } from '@shared/templates';
import type { BrandKit, CaptionStyle, Word } from '@shared/types';

/** Brand kit já pronto para desenhar (logo decodificado). */
export interface OverlayBrand { logo?: Omit<NonNullable<BrandKit['logo']>, 'data'> & { img: CanvasImageSource; w: number; h: number }; cta?: BrandKit['cta'] }
/** duration = duração do vídeo final (o CTA aparece nos últimos segundos). */
export interface OverlayInput { chunks: CaptionChunk[]; caption: CaptionStyle; brand?: OverlayBrand; duration?: number }

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
  const c = ctaStart(input);
  const cta = t >= c ? Math.round(clamp01((t - c) / 0.3) * 30) : -1; // o logo é fixo: não muda a chave
  const hit = captionAt(input.chunks, t);
  if (!hit) return `||${cta}`;
  const w = hit.chunk.words[hit.active];
  const p = phase(input.caption, w, t);
  const q = input.caption.animation === 'typewriter' ? Math.ceil(p * w.text.length) : Math.round(p * 30);
  return `${hit.chunk.start}|${hit.active}|${q}|${cta}`;
}

const ctaStart = (input: OverlayInput) => (input.brand?.cta?.text && input.duration ? input.duration - input.brand.cta.seconds : Infinity);

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.min(r, h / 2));
  ctx.fill();
}

export function drawOverlay(ctx: CanvasRenderingContext2D, input: OverlayInput, t: number) {
  const { width: W, height: H } = ctx.canvas;
  ctx.clearRect(0, 0, W, H);
  drawCaption(ctx, input, t);
  drawBrand(ctx, input, t);
}

/** Logo do brand kit num canto + CTA final (entra com pop nos últimos segundos). */
function drawBrand(ctx: CanvasRenderingContext2D, input: OverlayInput, t: number) {
  const b = input.brand;
  if (!b) return;
  const { width: W, height: H } = ctx.canvas;
  if (b.logo && b.logo.w) {
    const lw = W * b.logo.size, lh = (lw * b.logo.h) / b.logo.w, m = W * 0.045;
    const x = b.logo.position.endsWith('l') ? m : W - m - lw, y = b.logo.position.startsWith('t') ? m : H - m - lh;
    ctx.save();
    ctx.globalAlpha = b.logo.opacity;
    ctx.drawImage(b.logo.img, x, y, lw, lh);
    ctx.restore();
  }
  const c = ctaStart(input);
  if (!b.cta || t < c) return;
  const k = H / 1920, fs = 64 * k, cta = b.cta;
  ctx.save();
  ctx.font = fontCss(cta.font, fs);
  const tw = Math.min(ctx.measureText(cta.text).width, W * 0.8), pad = fs * 0.6;
  ctx.translate(W / 2, (H * cta.positionY) / 100);
  ctx.scale(popScale(t - c), popScale(t - c));
  ctx.globalAlpha = clamp01((t - c) / 0.15);
  ctx.fillStyle = cta.bg;
  roundRect(ctx, -tw / 2 - pad, -fs * 0.6 - pad * 0.5, tw + pad * 2, fs * 1.2 + pad, fs);
  ctx.fillStyle = cta.color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(cta.text, 0, 0, tw);
  ctx.restore();
}

function drawCaption(ctx: CanvasRenderingContext2D, input: OverlayInput, t: number) {
  const { width: W, height: H } = ctx.canvas;
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

const registered = new Set<string>();
/** Fontes próprias dos brand kits (data URL) ficam disponíveis para o canvas e para os <select>. */
export async function registerKitFonts(kits: Pick<BrandKit, 'fonts'>[]) {
  await Promise.all(kits.flatMap((k) => k.fonts).filter((f) => !registered.has(f.family)).map(async (f) => {
    registered.add(f.family);
    try { document.fonts.add(await new FontFace(f.family, `url(${f.data})`).load()); } catch { registered.delete(f.family); }
  }));
}

/** Prepara o brand kit para o desenho (decodifica o logo e carrega as fontes). */
export async function loadBrand(kit: BrandKit | undefined): Promise<OverlayBrand | undefined> {
  if (!kit) return undefined;
  await registerKitFonts([kit]);
  if (kit.cta) await document.fonts.load(fontCss(kit.cta.font, 40)).catch(() => undefined);
  if (!kit.logo) return { cta: kit.cta };
  const img = new Image();
  img.src = kit.logo.data;
  await img.decode().catch(() => undefined);
  const { data: _data, ...logo } = kit.logo;
  return { cta: kit.cta, logo: { ...logo, img, w: img.naturalWidth, h: img.naturalHeight } };
}
