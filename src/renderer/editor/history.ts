import { useCallback, useEffect, useRef, useState } from 'react';

// ponytail: histórico por instantâneos do clipe (alguns KB cada) em vez de patches do Immer; trocar se o clipe crescer muito.
export interface History<T> { past: T[]; present: T; future: T[]; mergeKey?: string; mergeAt?: number }

const LIMIT = 200;
const MERGE_MS = 1000;

/** Aplica uma mudança. Mudanças seguidas com a mesma `merge` (ex.: arrastar um slider) viram um passo só. */
export function push<T>(h: History<T>, next: T, merge?: string, now = Date.now()): History<T> {
  if (next === h.present) return h;
  const same = merge && merge === h.mergeKey && now - (h.mergeAt ?? 0) < MERGE_MS;
  return {
    past: same ? h.past : [...h.past, h.present].slice(-LIMIT),
    present: next, future: [], mergeKey: merge, mergeAt: now,
  };
}
export const undo = <T,>(h: History<T>): History<T> =>
  h.past.length ? { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] } : h;
export const redo = <T,>(h: History<T>): History<T> =>
  h.future.length ? { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) } : h;

/** Estado com desfazer/refazer + salvamento automático (com debounce). */
export function useHistory<T>(initial: T, save: (v: T) => Promise<void>) {
  const [h, setH] = useState<History<T>>({ past: [], present: initial, future: [] });
  const [saved, setSaved] = useState(true);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setSaved(false);
    const t = setTimeout(() => save(h.present).then(() => setSaved(true)), 500);
    return () => clearTimeout(t);
  }, [h.present, save]);

  const update = useCallback((fn: (v: T) => T, merge?: string) => setH((x) => push(x, fn(x.present), merge)), []);
  return {
    value: h.present, saved, update,
    undo: useCallback(() => setH(undo), []), redo: useCallback(() => setH(redo), []),
    canUndo: h.past.length > 0, canRedo: h.future.length > 0,
  };
}
