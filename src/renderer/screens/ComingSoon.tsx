import { useTranslation } from 'react-i18next';
import { Construction } from 'lucide-react';

export function ComingSoon() {
  const { t } = useTranslation();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
      <Construction size={32} strokeWidth={1.75} className="text-muted" aria-hidden="true" />
      <h1 className="font-display text-xl font-semibold">{t('soon.title')}</h1>
      <p className="text-muted">{t('soon.body')}</p>
    </div>
  );
}
