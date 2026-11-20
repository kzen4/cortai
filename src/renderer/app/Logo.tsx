/** Ícone: quadrado escuro, play verde-limão cortado por um traço violeta (seção 3.2). */
export function LogoIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="16" fill="#15151C" stroke="#2A2A36" strokeWidth="2" />
      <path d="M24 17 L48 32 L24 47 Z" fill="#C6F432" strokeLinejoin="round" />
      <path d="M17 46 L47 18" stroke="#8B5CF6" strokeWidth="6" strokeLinecap="round" />
    </svg>
  );
}

export function Logotype() {
  return (
    <span className="font-display text-[15px] font-extrabold tracking-tight">
      Cortaí<span className="text-primary">.</span>
    </span>
  );
}
