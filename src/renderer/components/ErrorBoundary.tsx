import { Component, type ReactNode } from 'react';
import i18n from '../i18n';

/** Uma tela que quebra não derruba o app inteiro: mostra o erro e oferece voltar. */
export class ErrorBoundary extends Component<{ children: ReactNode; onReset: () => void }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="font-display text-lg font-semibold">{i18n.t('errors.screen')}</p>
        <p className="max-w-[560px] font-mono text-[12px] text-muted">{this.state.error.message}</p>
        <button className="h-10 cursor-pointer rounded-button bg-primary px-4 font-semibold text-on-primary" onClick={() => { this.setState({ error: null }); this.props.onReset(); }}>
          {i18n.t('errors.back')}
        </button>
      </div>
    );
  }
}
