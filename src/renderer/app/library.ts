// Templates próprios + brand kits: guardados nas configurações; um estado só para todas as telas.
import { useEffect, useMemo, useState } from 'react';
import { clipBrand, findKit, type Library } from '@shared/library';
import type { BrandKit, Clip } from '@shared/types';
import { loadBrand, registerKitFonts, type OverlayBrand } from '../overlay/drawOverlay';

let lib: Library | null = null;
const subs = new Set<(l: Library) => void>();

async function load(): Promise<Library> {
  if (lib) return lib;
  const s = await window.cortai.settings.get();
  lib = { templates: s.captionTemplates ?? [], kits: s.brandKits ?? [], defaultKit: s.defaultBrandKitId || undefined };
  await registerKitFonts(lib.kits);
  return lib;
}

/** Salva e avisa todas as telas abertas. */
export async function saveLibrary(next: Library) {
  lib = next;
  await registerKitFonts(next.kits);
  subs.forEach((f) => f(next));
  await window.cortai.settings.set({ captionTemplates: next.templates, brandKits: next.kits, defaultBrandKitId: next.defaultKit ?? '' });
}

export function useLibrary(): Library | null {
  const [l, setL] = useState<Library | null>(lib);
  useEffect(() => {
    void load().then(setL);
    subs.add(setL);
    return () => { subs.delete(setL); };
  }, []);
  return l;
}

/** Kit do clipe pronto para o drawOverlay (logo decodificado, fontes carregadas). */
export function useBrand(kit: BrandKit | undefined): OverlayBrand | undefined {
  const [b, setB] = useState<OverlayBrand>();
  useEffect(() => {
    let live = true;
    void loadBrand(kit).then((x) => live && setB(x));
    return () => { live = false; };
  }, [kit]);
  return b;
}

/** Brand do corte (kit + CTA do corte), estável entre renders para não recarregar o logo à toa. */
export function useClipBrand(clip: Pick<Clip, 'brandKitId' | 'cta'>) {
  const l = useLibrary();
  return useMemo(() => clipBrand(findKit(clip.brandKitId, l?.kits), clip.cta), [l, clip.brandKitId, clip.cta]);
}

/** Fontes das legendas: as do app + as de todos os brand kits. */
export const kitFonts = (l: Library | null) => [...new Set((l?.kits ?? []).flatMap((k) => k.fonts.map((f) => f.family)))];
