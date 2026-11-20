// Lab de render (Fase 0): mesmo clipe exportado por Canvas (caminho oficial, renderClip) e por ASS/libass (comparação).
import { app, type BrowserWindow } from 'electron';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chunkWords, displayText, POP_MS } from '@shared/captions';
import { POC_CAPTION, POC_DURATION, POC_WORDS } from '@shared/poc';
import type { PocResult } from '@shared/types';
import { encodeArgs, pickEncoder, renderClip, run } from './ffmpeg/render';

const W = 1080, H = 1920, FPS = 30;
export const pocDir = () => join(app.getPath('userData'), 'poc');
const fontsDir = () => (app.isPackaged ? join(process.resourcesPath, 'fonts') : join(app.getAppPath(), 'resources', 'fonts'));

export async function ensureSample(): Promise<string> {
  mkdirSync(pocDir(), { recursive: true });
  const p = join(pocDir(), 'sample.mp4');
  if (!existsSync(p))
    await run(['-f', 'lavfi', '-i', `testsrc2=s=1920x1080:r=${FPS}:d=${POC_DURATION}`, '-f', 'lavfi', '-i', `sine=frequency=220:d=${POC_DURATION}`,
      ...encodeArgs('high'), '-shortest', p]).done;
  return p;
}

const assColor = (hex: string) => `&H00${hex.slice(5, 7)}${hex.slice(3, 5)}${hex.slice(1, 3)}&`.toUpperCase();
const assTime = (t: number) => {
  const cs = Math.round(t * 100);
  const h = Math.floor(cs / 360000), m = Math.floor(cs / 6000) % 60, s = Math.floor(cs / 100) % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
};

function buildAss(): string {
  const s = POC_CAPTION;
  const lines: string[] = [];
  for (const c of chunkWords(POC_WORDS, s.wordsPerLine)) {
    c.words.forEach((w, k) => {
      const end = k < c.words.length - 1 ? c.words[k + 1].start : c.end;
      const text = c.words.map((o, j) => {
        const tx = displayText(o.text, s.uppercase);
        return j === k ? `{\\c${assColor(s.highlightColor)}\\fscx70\\fscy70\\t(0,${POP_MS},0.5,\\fscx100\\fscy100)}${tx}{\\r}` : tx;
      }).join(' ');
      lines.push(`Dialogue: 0,${assTime(w.start)},${assTime(end)},Cap,,0,0,0,,{\\an5\\pos(${W / 2},${(H * s.positionY) / 100})}${text}`);
    });
  }
  return [
    '[Script Info]', 'ScriptType: v4.00+', `PlayResX: ${W}`, `PlayResY: ${H}`, 'WrapStyle: 2', 'ScaledBorderAndShadow: yes', '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Cap,${s.font},${s.size},${assColor(s.color)},${assColor(s.color)},${assColor(s.strokeColor)},&H00000000&,0,0,0,0,100,100,0,0,1,${s.strokeWidth},0,5,0,0,0,1`,
    '', '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text', ...lines, '',
  ].join('\n');
}

export async function runPoc(method: 'canvas' | 'ass', preload: string, openWorker: (w: BrowserWindow) => void): Promise<PocResult> {
  const sample = await ensureSample();
  const out = join(pocDir(), `poc-${method}.mp4`);
  const t0 = performance.now();
  if (method === 'canvas') {
    await renderClip({ source: sample, src: { width: 1920, height: 1080 }, words: POC_WORDS, caption: POC_CAPTION, out,
      clip: { in: 0, out: POC_DURATION, cuts: [], reframe: [], wordEdits: {}, layout: { aspect: '9:16', mode: 'single', smoothing: 0.5 }, audio: { speechGain: 1, denoise: false } },
    }, preload, openWorker, () => {});
  } else {
    const assPath = join(pocDir(), 'poc.ass');
    writeFileSync(assPath, buildAss(), 'utf8');
    const esc = (p: string) => p.replace(/\\/g, '/').replace(/:/g, '\\:'); // caminhos dentro do filtro (Windows)
    await run(['-i', sample, '-vf', `crop=ih*9/16:ih,scale=${W}:${H},fps=${FPS},subtitles='${esc(assPath)}':fontsdir='${esc(fontsDir())}'`,
      '-t', String(POC_DURATION), ...encodeArgs('high'), out]).done;
  }
  return { method, outPath: out, seconds: +((performance.now() - t0) / 1000).toFixed(1), encoder: pickEncoder() };
}
