import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary text-on-primary font-semibold hover:brightness-110',
  secondary: 'border border-border bg-surface-2 text-text font-medium hover:border-muted',
  ghost: 'text-muted hover:bg-surface-2 hover:text-text font-medium',
  danger: 'border border-border bg-surface-2 text-danger font-medium hover:border-danger',
};

export function Button({ variant = 'secondary', icon: Icon, children, className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; icon?: LucideIcon }) {
  return (
    <button
      {...rest}
      className={`inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-button px-4 transition-[filter,border-color,background-color,color,opacity] duration-150 ease-cortai disabled:cursor-not-allowed disabled:opacity-40 ${VARIANTS[variant]} ${className}`}
    >
      {Icon && <Icon size={16} strokeWidth={1.75} aria-hidden="true" />}
      {children}
    </button>
  );
}

/** Botão só com ícone: exige rótulo acessível. */
export function IconButton({ icon: Icon, label, active, className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: LucideIcon; label: string; active?: boolean }) {
  return (
    <button
      {...rest}
      aria-label={label}
      title={label}
      className={`inline-flex size-9 cursor-pointer items-center justify-center rounded-button transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40 ${active ? 'text-primary' : 'text-muted hover:bg-surface-2 hover:text-text'} ${className}`}
    >
      <Icon size={18} strokeWidth={1.75} aria-hidden="true" fill={active ? 'currentColor' : 'none'} />
    </button>
  );
}

export function Progress({ value, ai, className = '' }: { value: number; ai?: boolean; className?: string }) {
  return (
    <div className={`relative h-1.5 overflow-hidden rounded-full bg-surface-2 ${className}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)}>
      <div className={`h-full rounded-full transition-[width] duration-300 ease-cortai ${ai ? 'bg-ai' : 'bg-primary'}`} style={{ width: `${Math.max(2, value * 100)}%` }} />
      {ai && value < 1 && <div className="shimmer absolute inset-0" />}
    </div>
  );
}

export const scoreTier = (s: number) => (s >= 85 ? 'high' : s >= 70 ? 'good' : 'medium');

/** Anel da nota viral: gradiente violeta → limão (SPEC §6.6). */
export function ScoreRing({ score, size = 40 }: { score: number; size?: number }) {
  const id = useId();
  const r = size / 2 - 3;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Nota ${score}`}>
      <defs>
        <linearGradient id={id} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#8B5CF6" />
          <stop offset="1" stopColor="#C6F432" />
        </linearGradient>
      </defs>
      <circle cx={size / 2} cy={size / 2} r={r} fill="rgba(11,11,15,.75)" stroke="var(--surface-2)" strokeWidth="3" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`url(#${id})`} strokeWidth="3" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fill="var(--text)" fontFamily="Sora" fontWeight="700" fontSize={size * 0.34}>{score}</text>
    </svg>
  );
}

/** Grupo de opções exclusivas (radio nativo estilizado). */
export function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-[12px] font-medium text-muted">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <label key={o.value} className={`cursor-pointer rounded-input border px-3 py-1.5 text-[13px] transition-colors duration-150 has-[:focus-visible]:shadow-[var(--focus-ring)] ${value === o.value ? 'border-primary bg-primary/10 text-text' : 'border-border bg-surface-2 text-muted hover:text-text'}`}>
            <input type="radio" className="sr-only" checked={value === o.value} onChange={() => onChange(o.value)} />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

const fieldCls = 'w-full rounded-input border border-border bg-surface-2 pl-9 pr-3 text-[13px] text-text placeholder:text-muted focus-visible:border-primary';

/** Campo com rótulo visível e ícone à esquerda (padrão de formulários do projeto). */
export function Field({ label, icon: Icon, children, hint }: { label: string; icon: LucideIcon; children: ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12px] font-medium text-muted">{label}</span>
      <span className="relative">
        <Icon size={16} strokeWidth={1.75} aria-hidden="true" className="pointer-events-none absolute top-[11px] left-3 text-muted" />
        {children}
      </span>
      {hint && <span className="text-[12px] text-muted">{hint}</span>}
    </label>
  );
}
export const inputCls = `${fieldCls} h-10`;
export const selectCls = `${fieldCls} h-10 cursor-pointer appearance-none`;
export const textareaCls = `${fieldCls} min-h-20 py-2.5 resize-y`;

/** Modal com <dialog> nativo: foco preso, Esc fecha, fundo inerte. */
export function Modal({ open, onClose, labelledBy, children, className = '' }: { open: boolean; onClose: () => void; labelledBy: string; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current!;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className={`m-auto max-h-[90vh] overflow-auto rounded-modal border border-border bg-surface p-0 text-text shadow-2xl backdrop:bg-black/60 ${className}`}
    >
      {open && children}
    </dialog>
  );
}

export const fmtDuration = (s: number) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.round(s % 60);
  return h ? `${h}h ${String(m).padStart(2, '0')}min` : m ? `${m}min ${String(sec).padStart(2, '0')}s` : `${sec}s`;
};
export const fmtClock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
