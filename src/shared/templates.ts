import type { CaptionStyle } from './types';

const base = { strokeColor: '#000000', emojis: false, keywords: [] as string[] };

/** 9 templates de legenda (o Cortaí é o padrão do sistema) (SPEC §4.8). Fontes OFL empacotadas no app. */
export const CAPTION_TEMPLATES: Record<string, CaptionStyle> = {
  cortai: { ...base, templateId: 'cortai', font: 'Montserrat ExtraBold', size: 78, color: '#F4F4F6', highlightColor: '#C6F432', strokeColor: '#0B0B0F', strokeWidth: 6, positionY: 70, wordsPerLine: 3, uppercase: true, animation: 'pop', shadow: { color: 'rgba(139,92,246,0.55)', blur: 18, x: 0, y: 0 } },
  hormozi: { ...base, templateId: 'hormozi', font: 'Montserrat ExtraBold', size: 78, color: '#FFFFFF', highlightColor: '#C6F432', strokeWidth: 6, positionY: 70, wordsPerLine: 3, uppercase: true, animation: 'pop' },
  karaoke: { ...base, templateId: 'karaoke', font: 'Poppins', size: 70, color: '#FFFFFF', highlightColor: '#FFD60A', strokeWidth: 5, positionY: 72, wordsPerLine: 4, uppercase: false, animation: 'none' },
  minimal: { ...base, templateId: 'minimal', font: 'Inter', size: 58, color: '#FFFFFF', highlightColor: '#FFFFFF', strokeWidth: 0, positionY: 78, wordsPerLine: 5, uppercase: false, animation: 'fade', shadow: { color: 'rgba(0,0,0,0.8)', blur: 12, x: 0, y: 3 } },
  neon: { ...base, templateId: 'neon', font: 'Bebas Neue', size: 104, color: '#F4F4F6', highlightColor: '#C6F432', strokeWidth: 0, positionY: 68, wordsPerLine: 3, uppercase: true, animation: 'bounce', shadow: { color: '#8B5CF6', blur: 24, x: 0, y: 0 } },
  caixa: { ...base, templateId: 'caixa', font: 'Archivo Black', size: 60, color: '#0B0B0F', highlightColor: '#8B5CF6', strokeWidth: 0, positionY: 72, wordsPerLine: 3, uppercase: true, animation: 'pop', box: { color: '#FFFFFF', radius: 16, padding: 20 } },
  destaque: { ...base, templateId: 'destaque', font: 'Poppins', size: 72, color: '#FFFFFF', highlightColor: '#FF4D6D', strokeWidth: 0, positionY: 70, wordsPerLine: 3, uppercase: true, animation: 'highlight', shadow: { color: 'rgba(0,0,0,0.6)', blur: 8, x: 0, y: 2 } },
  maquina: { ...base, templateId: 'maquina', font: 'Anton', size: 84, color: '#FFFFFF', highlightColor: '#FFFFFF', strokeWidth: 5, positionY: 70, wordsPerLine: 4, uppercase: true, animation: 'typewriter' },
  impacto: { ...base, templateId: 'impacto', font: 'Anton', size: 118, color: '#FFD60A', highlightColor: '#FFFFFF', strokeWidth: 8, positionY: 66, wordsPerLine: 2, uppercase: true, animation: 'pop' },
};
export const DEFAULT_TEMPLATE = 'cortai'; // padrão do sistema (par do brand kit Cortaí)
export const TEMPLATE_NAMES: Record<string, string> = {
  cortai: 'Cortaí', hormozi: 'Hormozi', karaoke: 'Karaokê', minimal: 'Minimal', neon: 'Neon', caixa: 'Caixa', destaque: 'Destaque', maquina: 'Máquina', impacto: 'Impacto',
};

/** Peso usado no canvas para cada família (só as que têm o peso carregado, para não sintetizar negrito). */
export const FONT_WEIGHT: Record<string, number> = {
  'Montserrat ExtraBold': 400, Poppins: 800, Inter: 700, 'Bebas Neue': 400, 'Archivo Black': 400, Anton: 400,
};
export const CAPTION_FONTS = Object.keys(FONT_WEIGHT);
export const fontCss = (family: string, px: number) => `${FONT_WEIGHT[family] ?? 400} ${px}px "${family}"`;
