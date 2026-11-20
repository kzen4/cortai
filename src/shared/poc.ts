// Dados da prova de conceito de render (Fase 0): 30 s de fala fictícia com tempos por palavra.
import { CAPTION_TEMPLATES } from './templates';
import type { CaptionStyle, Word } from './types';

const TEXT =
  'Eu quase perdi tudo em dois mil e dezenove. E o erro foi simples: eu achava que precisava fazer tudo sozinho. ' +
  'Ninguém conta isso, mas o primeiro ano de um negócio é o mais solitário. Quando eu finalmente pedi ajuda, ' +
  'as coisas começaram a andar. Então, se você está travado hoje, faz uma coisa: liga pra alguém que já passou por isso. ' +
  'Sério, isso muda o jogo.';

export const POC_DURATION = 30;

export const POC_WORDS: Word[] = (() => {
  const toks = TEXT.split(/\s+/);
  const weight = (w: string) => 1.5 + w.length + (/[.,:!?]$/.test(w) ? 4 : 0);
  const total = toks.reduce((s, w) => s + weight(w), 0);
  const span = POC_DURATION - 1;
  let t = 0.5;
  return toks.map((text, i) => {
    const d = (weight(text) / total) * span;
    const pause = /[.,:!?]$/.test(text) ? Math.min(0.35, d * 0.4) : 0.04;
    const w: Word = { i, text, start: +t.toFixed(3), end: +(t + d - pause).toFixed(3), conf: 1 };
    t += d;
    return w;
  });
})();

export const POC_CAPTION: CaptionStyle = CAPTION_TEMPLATES.hormozi;
