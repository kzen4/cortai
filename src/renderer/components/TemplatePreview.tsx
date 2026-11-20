import { useEffect, useMemo, useRef } from 'react';
import { chunkWords } from '@shared/captions';
import { POC_DURATION, POC_WORDS } from '@shared/poc';
import type { CaptionStyle } from '@shared/types';
import { drawOverlay, loadCaptionFont, type OverlayBrand } from '../overlay/drawOverlay';

// quadro parado: fim de uma palavra (pop/digitação/fade já completos)
const STILL = POC_WORDS[5].end - 0.02;

/**
 * Mini-preview do template com a mesma função de desenho do export. Só anima com `play` (galeria inteira
 * animando é movimento demais) e nunca com "reduzir movimento". `scale` aumenta a letra nas miniaturas.
 */
export function TemplatePreview({ style, brand, play, scale = 1.8, width, className = '' }: {
  style: CaptionStyle; brand?: OverlayBrand; play: boolean; scale?: number; width: number; className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const input = useMemo(() => ({
    chunks: chunkWords(POC_WORDS, style.wordsPerLine), brand, duration: POC_DURATION,
    caption: { ...style, size: style.size * scale },
  }), [style, brand, scale]);
  useEffect(() => {
    const c = ref.current!;
    c.width = width * 2; c.height = Math.round((width * 16) / 9) * 2;
    const ctx = c.getContext('2d')!;
    const still = !play || matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    const t0 = performance.now();
    const frame = (now: number) => {
      drawOverlay(ctx, input, still ? (brand?.cta ? POC_DURATION - 0.5 : STILL) : ((now - t0) / 1000) % POC_DURATION);
      if (!still) raf = requestAnimationFrame(frame);
    };
    void loadCaptionFont(input.caption).then(() => { raf = requestAnimationFrame(frame); });
    return () => cancelAnimationFrame(raf);
  }, [input, play, width, brand]);
  return <canvas ref={ref} aria-hidden="true" style={{ width, height: Math.round((width * 16) / 9) }}
    className={`rounded-input bg-gradient-to-b from-[#2a2a36] to-[#0b0b0f] ${className}`} />;
}
