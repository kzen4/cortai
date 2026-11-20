import { describe, expect, it } from 'vitest';
import { allKits, BUILTIN_KITS, clipBrand, CTA_POS, DEFAULT_KIT, defaultKitId, exportFile, findKit, removeKit, findTemplate, importFile, sanitizeStyle, type Library } from './library';
import { CAPTION_TEMPLATES } from './templates';

const lib: Library = {
  templates: [{ id: 'tA', name: 'Meu', style: { ...CAPTION_TEMPLATES.neon, templateId: 'tA', color: '#123456' } }],
  kits: [{ id: 'kA', name: 'Cliente', templateId: 'tA', palette: ['#FF0000'], fonts: [{ family: 'Minha', data: 'data:font/ttf;base64,AAAA' }],
    logo: { data: 'data:image/png;base64,iVBO', position: 'bl', size: 0.25, opacity: 0.8 },
    cta: { text: 'Siga', seconds: 4, color: '#000000', bg: '#FFFFFF', font: 'Minha', positionY: 30 } }],
};

describe('biblioteca de templates e brand kits', () => {
  it('acha template pronto, próprio, e cai no padrão', () => {
    expect(findTemplate('neon').font).toBe('Bebas Neue');
    expect(findTemplate('tA', lib.templates).color).toBe('#123456');
    expect(findTemplate('sumiu', lib.templates).templateId).toBe('cortai');
  });

  it('exporta e importa um brand kit com o template junto (ids novos, referência remapeada)', () => {
    const file = JSON.stringify(exportFile('brandkit', 'kA', lib));
    const { lib: out, name } = importFile(file, { templates: [], kits: [] });
    expect(name).toBe('Cliente');
    const [kit] = out.kits, [tpl] = out.templates;
    expect(kit.id).not.toBe('kA');
    expect(kit.templateId).toBe(tpl.id);
    expect(tpl.style.templateId).toBe(tpl.id);
    expect(tpl.style.color).toBe('#123456');
    expect(kit.logo).toEqual({ ...lib.kits[0].logo });
    expect(kit.fonts).toEqual(lib.kits[0].fonts);
    expect(kit.cta?.seconds).toBe(4);
  });

  it('kit do sistema (Cortaí): primeiro, padrão, e exporta/importa como cópia editável', () => {
    expect(allKits(lib.kits).map((k) => k.id)).toEqual([DEFAULT_KIT, 'kA']);
    expect(findTemplate(findKit(DEFAULT_KIT)!.templateId).highlightColor).toBe('#C6F432');
    const back = importFile(JSON.stringify(exportFile('brandkit', DEFAULT_KIT, lib)), { templates: [], kits: [] }).lib;
    expect(back.kits[0].id).not.toBe(DEFAULT_KIT);
    expect(back.kits[0].logo?.data).toBe(BUILTIN_KITS[0].logo?.data);
    expect(back.kits[0].templateId).toBe('cortai'); // template pronto: referência mantida
  });
  it('kit padrão: nenhum por padrão; escolhido vale (inclusive o Cortaí); apagar o padrão volta a nenhum', () => {
    expect(defaultKitId(lib)).toBeUndefined();
    expect(defaultKitId({ ...lib, defaultKit: DEFAULT_KIT })).toBe(DEFAULT_KIT);
    const withDef = { ...lib, defaultKit: 'kA' };
    expect(defaultKitId(withDef)).toBe('kA');
    const after = removeKit(withDef, 'kA');
    expect([after.kits.length, after.defaultKit, defaultKitId(after)]).toEqual([0, undefined, undefined]);
    expect(removeKit(withDef, DEFAULT_KIT)).toBe(withDef);
    expect(defaultKitId({ kits: [], defaultKit: 'sumiu' })).toBeUndefined();
  });
  it('CTA do corte: sozinho (visual do Cortaí), por cima do kit, ou só mudando a posição', () => {
    const kit = lib.kits[0];
    expect(clipBrand(kit, undefined)).toBe(kit);
    expect(clipBrand(undefined, { text: '  ', positionY: 86 })).toBeUndefined(); // vazio e sem kit = sem CTA
    const solo = clipBrand(undefined, { text: 'Me siga', positionY: CTA_POS.bottom })!;
    expect([solo.cta?.text, solo.cta?.bg, solo.cta?.positionY, solo.logo]).toEqual(['Me siga', '#C6F432', 86, undefined]);
    const over = clipBrand(kit, { text: 'Outro', positionY: CTA_POS.top })!;
    expect([over.cta?.text, over.cta?.bg, over.logo]).toEqual(['Outro', '#FFFFFF', kit.logo]);
    expect(clipBrand(kit, { text: '', positionY: CTA_POS.bottom })!.cta).toMatchObject({ text: 'Siga', positionY: 86 });
  });
  it('recusa arquivo estranho e limpa campos perigosos', () => {
    expect(() => importFile('{nada', lib)).toThrow();
    expect(() => importFile(JSON.stringify({ schemaVersion: 2, kind: 'template', templates: [] }), lib)).toThrow();
    const evil = { schemaVersion: 1, kind: 'brandkit', templates: [], kit: {
      name: 'X', palette: ['red;}', '#ABCDEF'], fonts: [{ family: 'a"b', data: 'javascript:alert(1)' }],
      logo: { data: 'https://exemplo.com/a.png', position: 'zz' } } };
    const k = importFile(JSON.stringify(evil), lib).lib.kits.at(-1)!;
    expect(k.palette).toEqual(['#ABCDEF']);
    expect(k.fonts).toEqual([]);
    expect(k.logo).toBeUndefined();
    const s = sanitizeStyle({ size: 9999, font: 'x"; }', animation: 'explode', wordsPerLine: 2.6 });
    expect([s.size, s.font, s.animation, s.wordsPerLine]).toEqual([200, 'x', 'pop', 3]);
  });
});
