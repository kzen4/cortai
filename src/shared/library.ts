// Templates próprios e brand kits: busca, e o arquivo .cortai-template (exportar/importar).
import { CAPTION_TEMPLATES, DEFAULT_TEMPLATE, TEMPLATE_NAMES } from './templates';
import type { BrandKit, CaptionStyle, CaptionTemplate, Clip } from './types';

/** defaultKit = kit padrão das próximas gerações (sem = nenhum kit: sem logo nem CTA). */
export interface Library { templates: CaptionTemplate[]; kits: BrandKit[]; defaultKit?: string }
export interface TemplateEntry extends CaptionTemplate { builtin: boolean }

export const newId = (p: string) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/** Prontos primeiro, depois os do usuário. */
export const allTemplates = (custom: CaptionTemplate[] = []): TemplateEntry[] => [
  ...Object.keys(CAPTION_TEMPLATES).map((id) => ({ id, name: TEMPLATE_NAMES[id], style: CAPTION_TEMPLATES[id], builtin: true })),
  ...custom.map((t) => ({ ...t, builtin: false })),
];
export const findTemplate = (id: string | undefined, custom: CaptionTemplate[] = []): CaptionStyle =>
  (id && (CAPTION_TEMPLATES[id] ?? custom.find((t) => t.id === id)?.style)) || CAPTION_TEMPLATES[DEFAULT_TEMPLATE];

/** Estilo do template aplicado a um clipe (palavras-chave e posição do clipe ficam). */
export const applyTemplate = (cur: CaptionStyle, tpl: CaptionStyle, id: string): CaptionStyle =>
  ({ ...tpl, templateId: id, keywords: cur.keywords });

export const NEW_KIT = (name: string): BrandKit => ({
  id: newId('k'), name, palette: ['#C6F432', '#8B5CF6', '#FFFFFF', '#0B0B0F'], fonts: [],
  cta: { text: 'Siga para mais', seconds: 3, color: '#0B0B0F', bg: '#C6F432', font: 'Montserrat ExtraBold', positionY: 18 },
});

// Brand kit do sistema: exemplo com a identidade do próprio Cortaí. Sempre existe e vem primeiro, mas NÃO é o padrão
// (cortes saem sem marca d'água). Não fica nas configurações (não dá para apagar nem editar; duplicar para personalizar).
const LOGO = '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#15151C" stroke="#2A2A36" stroke-width="2"/>'
  + '<path d="M24 17 L48 32 L24 47 Z" fill="#C6F432" stroke-linejoin="round"/><path d="M17 46 L47 18" stroke="#8B5CF6" stroke-width="6" stroke-linecap="round"/></svg>';
export const DEFAULT_KIT = 'cortai';
export const BUILTIN_KITS: BrandKit[] = [{
  id: DEFAULT_KIT, name: 'Cortaí', templateId: 'cortai', palette: ['#C6F432', '#8B5CF6', '#F4F4F6', '#0B0B0F', '#15151C'], fonts: [],
  logo: { data: `data:image/svg+xml;base64,${btoa(LOGO)}`, position: 'tr', size: 0.14, opacity: 0.9 },
  cta: { text: 'Siga para mais cortes', seconds: 3, color: '#0B0B0F', bg: '#C6F432', font: 'Montserrat ExtraBold', positionY: 18 },
}];
export const isBuiltinKit = (id?: string) => BUILTIN_KITS.some((k) => k.id === id);
/** Kit do sistema primeiro, depois os do usuário. */
export const allKits = (custom: BrandKit[] = []): BrandKit[] => [...BUILTIN_KITS, ...custom];
/** Kit padrão vigente: o escolhido, se ainda existir; senão nenhum. */
export const defaultKitId = (lib: Pick<Library, 'kits' | 'defaultKit'> | null | undefined) =>
  lib?.defaultKit && findKit(lib.defaultKit, lib.kits) ? lib.defaultKit : undefined;
/** Remove um kit do usuário (o do sistema não sai); se era o padrão, fica sem padrão. */
export const removeKit = (lib: Library, id: string): Library => isBuiltinKit(id) ? lib
  : { ...lib, kits: lib.kits.filter((k) => k.id !== id), defaultKit: lib.defaultKit === id ? undefined : lib.defaultKit };
/** Posições do CTA: acima (perto do topo) ou abaixo (sob a legenda). */
export const CTA_POS = { top: 18, bottom: 86 } as const;
export const ctaPos = (y: number): keyof typeof CTA_POS => (y < 50 ? 'top' : 'bottom');

/**
 * Brand do corte: o kit dele com o CTA do próprio corte por cima (texto e/ou posição). Sem kit, o CTA do corte
 * usa o visual do kit Cortaí. Fonte única para prévia, Resultados e export.
 */
export function clipBrand(kit: BrandKit | undefined, cta: Clip['cta']): BrandKit | undefined {
  const text = cta?.text.trim();
  if (!cta || (!text && !kit?.cta)) return kit;
  const base = kit?.cta ?? BUILTIN_KITS[0].cta!;
  return { ...(kit ?? { id: '', name: '', palette: [], fonts: [] }), cta: { ...base, text: text || base.text, positionY: cta.positionY } };
}

export const findKit = (id: string | undefined, custom: BrandKit[] = []) => (id ? allKits(custom).find((k) => k.id === id) : undefined);

// ---------- arquivo .cortai-template ----------
// ponytail: JSON único com os arquivos em data URL em vez de zip (SPEC §4.8); zipar se aparecer asset grande (intro/outro).
export interface TemplateFile { schemaVersion: 1; kind: 'template' | 'brandkit'; templates: CaptionTemplate[]; kit?: BrandKit }

export function exportFile(kind: 'template' | 'brandkit', id: string, lib: Library): TemplateFile {
  if (kind === 'template') return { schemaVersion: 1, kind, templates: lib.templates.filter((t) => t.id === id) };
  const kit = findKit(id, lib.kits)!;
  return { schemaVersion: 1, kind, kit, templates: lib.templates.filter((t) => t.id === kit.templateId) };
}

const isColor = (v: unknown): v is string => typeof v === 'string' && /^(#[0-9a-f]{3,8}|rgba?\([\d.,\s%]+\))$/i.test(v);
const num = (v: unknown, min: number, max: number, def: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def);
const str = (v: unknown, max: number, def = '') => (typeof v === 'string' ? v.slice(0, max) : def);
const dataUrl = (v: unknown, kind: 'image' | 'font') =>
  typeof v === 'string' && (kind === 'image' ? /^data:image\/(png|jpeg|webp|svg\+xml);base64,/ : /^data:(font\/|application\/(font|x-font|octet-stream|vnd\.ms-opentype))[\w.+-]*;base64,/).test(v) ? v : undefined;
/** Nome de fonte entra numa string CSS ("12px \"família\""): só letras, números, espaço e -_. */
export const safeFamily = (v: unknown) => str(v, 60).replace(/[^\p{L}\p{N} _-]/gu, '').trim();
const ANIMS = ['none', 'pop', 'bounce', 'fade', 'typewriter', 'highlight'] as const;

/** Estilo vindo de arquivo de fora: tudo conferido/limitado; o que faltar vem do template padrão. */
export function sanitizeStyle(raw: unknown): CaptionStyle {
  const r = (raw ?? {}) as Record<string, unknown>;
  const d = CAPTION_TEMPLATES[DEFAULT_TEMPLATE];
  const sh = r.shadow as Record<string, unknown> | undefined, bx = r.box as Record<string, unknown> | undefined;
  return {
    templateId: '', font: safeFamily(r.font) || d.font, size: num(r.size, 20, 200, d.size),
    color: isColor(r.color) ? r.color : d.color, highlightColor: isColor(r.highlightColor) ? r.highlightColor : d.highlightColor,
    strokeColor: isColor(r.strokeColor) ? r.strokeColor : d.strokeColor, strokeWidth: num(r.strokeWidth, 0, 20, d.strokeWidth),
    ...(sh && isColor(sh.color) ? { shadow: { color: sh.color, blur: num(sh.blur, 0, 80, 12), x: num(sh.x, -40, 40, 0), y: num(sh.y, -40, 40, 3) } } : {}),
    ...(bx && isColor(bx.color) ? { box: { color: bx.color, radius: num(bx.radius, 0, 80, 16), padding: num(bx.padding, 0, 80, 20) } } : {}),
    positionY: num(r.positionY, 8, 92, d.positionY), wordsPerLine: Math.round(num(r.wordsPerLine, 1, 6, d.wordsPerLine)),
    uppercase: r.uppercase === true, animation: ANIMS.includes(r.animation as never) ? (r.animation as CaptionStyle['animation']) : d.animation,
    emojis: false, keywords: [],
  };
}

/** Lê um .cortai-template e devolve a biblioteca com o conteúdo novo (ids novos: importar 2× não sobrescreve). */
export function importFile(text: string, lib: Library): { lib: Library; name: string } {
  let raw: Partial<TemplateFile>;
  try { raw = JSON.parse(text); } catch { throw new Error('bad'); }
  if (!raw || raw.schemaVersion !== 1 || (raw.kind !== 'template' && raw.kind !== 'brandkit') || !Array.isArray(raw.templates)) throw new Error('bad');
  const ids = new Map<string, string>();
  const templates = raw.templates.slice(0, 20).map((t) => {
    const id = newId('t');
    ids.set(str(t?.id, 80), id);
    return { id, name: str(t?.name, 60, 'Template importado') || 'Template importado', style: { ...sanitizeStyle(t?.style), templateId: id } };
  });
  if (raw.kind === 'template') {
    if (!templates.length) throw new Error('bad');
    return { lib: { ...lib, templates: [...lib.templates, ...templates] }, name: templates[0].name };
  }
  const k = (raw.kit ?? {}) as Partial<BrandKit>;
  const logo = k.logo && dataUrl(k.logo.data, 'image');
  const cta = k.cta;
  const tplId = k.templateId && (ids.get(k.templateId) ?? (k.templateId in CAPTION_TEMPLATES ? k.templateId : undefined));
  const kit: BrandKit = {
    id: newId('k'), name: str(k.name, 60, 'Brand kit importado') || 'Brand kit importado', ...(tplId ? { templateId: tplId } : {}),
    palette: (Array.isArray(k.palette) ? k.palette : []).filter(isColor).slice(0, 12),
    fonts: (Array.isArray(k.fonts) ? k.fonts : []).slice(0, 10).flatMap((f) => {
      const data = dataUrl(f?.data, 'font'), family = safeFamily(f?.family);
      return data && family ? [{ family, data }] : [];
    }),
    ...(logo ? { logo: { data: logo, position: (['tl', 'tr', 'bl', 'br'] as const).find((p) => p === k.logo!.position) ?? 'tr', size: num(k.logo!.size, 0.05, 0.6, 0.2), opacity: num(k.logo!.opacity, 0.1, 1, 1) } } : {}),
    ...(cta && typeof cta.text === 'string' ? { cta: {
      text: str(cta.text, 80), seconds: num(cta.seconds, 1, 15, 3), color: isColor(cta.color) ? cta.color : '#0B0B0F',
      bg: isColor(cta.bg) ? cta.bg : '#C6F432', font: safeFamily(cta.font) || 'Montserrat ExtraBold', positionY: num(cta.positionY, 8, 92, 22),
    } } : {}),
  };
  return { lib: { ...lib, templates: [...lib.templates, ...templates], kits: [...lib.kits, kit] }, name: kit.name };
}
