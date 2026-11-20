import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { ListOrdered, Type, Wand2 } from 'lucide-react';
import { CAPTION_FONTS } from '@shared/templates';
import type { CaptionStyle } from '@shared/types';
import { Field, selectCls } from './ui';

const ANIMS: CaptionStyle['animation'][] = ['none', 'pop', 'bounce', 'fade', 'typewriter', 'highlight'];

/** Controles do estilo de legenda (editor do corte e editor de template). `merge` agrupa arrastes no desfazer. */
export function CaptionControls({ s, onChange, fonts = [], palette = [] }: {
  s: CaptionStyle; onChange: (patch: Partial<CaptionStyle>, merge?: string) => void; fonts?: string[]; palette?: string[];
}) {
  const { t } = useTranslation();
  const cap = onChange;
  const allFonts = [...new Set([...CAPTION_FONTS, ...fonts, s.font])];
  return (
    <>
      <Field label={t('editor.font')} icon={Type}>
        <select className={selectCls} value={s.font} onChange={(e) => cap({ font: e.target.value })}>
          {allFonts.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
      </Field>
      <Range label={t('editor.size')} value={s.size} min={30} max={160} onChange={(v) => cap({ size: v }, 'size')} />
      <div className="grid grid-cols-3 gap-2">
        <Color label={t('editor.color')} value={s.color} palette={palette} onChange={(v) => cap({ color: v }, 'color')} />
        <Color label={t('editor.highlight')} value={s.highlightColor} palette={palette} onChange={(v) => cap({ highlightColor: v }, 'hl')} />
        <Color label={t('editor.stroke')} value={s.strokeColor} palette={palette} onChange={(v) => cap({ strokeColor: v }, 'stroke')} />
      </div>
      <Range label={t('editor.strokeWidth')} value={s.strokeWidth} min={0} max={14} onChange={(v) => cap({ strokeWidth: v }, 'sw')} />
      <Range label={t('editor.posY')} value={s.positionY} min={8} max={92} suffix="%" onChange={(v) => cap({ positionY: v }, 'posY')} />
      <div className="grid grid-cols-2 gap-2">
        <Field label={t('editor.wordsPerLine')} icon={ListOrdered}>
          <select className={selectCls} value={s.wordsPerLine} onChange={(e) => cap({ wordsPerLine: Number(e.target.value) })}>
            {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </Field>
        <Field label={t('editor.animation')} icon={Wand2}>
          <select className={selectCls} value={s.animation} onChange={(e) => cap({ animation: e.target.value as CaptionStyle['animation'] })}>
            {ANIMS.map((a) => <option key={a} value={a}>{t(`editor.anims.${a}`)}</option>)}
          </select>
        </Field>
      </div>
      <div className="flex flex-col gap-2">
        <Check label={t('editor.uppercase')} checked={s.uppercase} onChange={(v) => cap({ uppercase: v })} />
        <Check label={t('editor.shadow')} checked={!!s.shadow} onChange={(v) => cap({ shadow: v ? { color: 'rgba(0,0,0,0.75)', blur: 12, x: 0, y: 3 } : undefined })} />
        <Check label={t('editor.box')} checked={!!s.box} onChange={(v) => cap({ box: v ? { color: '#FFFFFF', radius: 16, padding: 20 } : undefined })} />
        {s.box && <Color label={t('editor.boxColor')} value={s.box.color} palette={palette} onChange={(v) => cap({ box: { ...s.box!, color: v } }, 'box')} />}
      </div>
    </>
  );
}

export function Range({ label, value, min, max, step, suffix = '', onChange }: { label: string; value: number; min: number; max: number; step?: number; suffix?: string; onChange: (v: number) => void }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex justify-between text-[12px] font-medium text-muted">{label}<span className="font-mono text-text">{value}{suffix}</span></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="accent-[var(--primary)]" />
    </label>
  );
}

/** Cor com as cores do brand kit como sugestões (datalist nativo do seletor de cor). */
export function Color({ label, value, onChange, palette = [] }: { label: string; value: string; onChange: (v: string) => void; palette?: string[] }) {
  const id = useId();
  const hex = /^#[0-9a-f]{6}$/i.test(value) ? value : '#000000';
  return (
    <label className="flex flex-col gap-1.5">
      <span className="truncate text-[12px] font-medium text-muted">{label}</span>
      <span className="flex h-10 items-center gap-2 rounded-input border border-border bg-surface-2 px-2">
        <input type="color" value={hex} list={palette.length ? id : undefined} onChange={(e) => onChange(e.target.value.toUpperCase())} className="size-6 cursor-pointer rounded border-0 bg-transparent p-0" />
        <span className="font-mono text-[11px] text-muted">{hex.toUpperCase()}</span>
      </span>
      {palette.length > 0 && <datalist id={id}>{palette.map((c) => <option key={c} value={c} />)}</datalist>}
    </label>
  );
}

export function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-[13px]">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-4 cursor-pointer accent-[var(--primary)]" />
      {label}
    </label>
  );
}
