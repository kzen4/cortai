import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FolderOpen, Pause, Play } from 'lucide-react';
import { chunkWords } from '@shared/captions';
import { POC_CAPTION, POC_DURATION, POC_WORDS } from '@shared/poc';
import type { PocResult } from '@shared/types';
import { drawOverlay, loadCaptionFont } from '../overlay/drawOverlay';

const PW = 270, PH = 480; // preview 9:16

/** Lab da Fase 0: preview ao vivo (vídeo + drawOverlay) lado a lado com os MP4 exportados. */
export function Lab() {
  const { t } = useTranslation();
  const [sample, setSample] = useState<string>();
  const [results, setResults] = useState<Partial<Record<'canvas' | 'ass', PocResult>>>({});
  const [busy, setBusy] = useState<'canvas' | 'ass' | null>(null);
  const [error, setError] = useState('');
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const videos = useRef<HTMLVideoElement[]>([]);
  const canvas = useRef<HTMLCanvasElement>(null);
  const input = useMemo(() => ({ chunks: chunkWords(POC_WORDS, POC_CAPTION.wordsPerLine), caption: POC_CAPTION }), []);

  useEffect(() => { window.cortai.poc.sample().then(setSample); }, []);

  // preview: redesenha o overlay a cada quadro do vídeo base
  useEffect(() => {
    const v = videos.current[0], c = canvas.current;
    if (!v || !c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = PW * dpr; c.height = PH * dpr;
    const ctx = c.getContext('2d')!;
    let id = 0;
    const draw = (time: number) => { drawOverlay(ctx, input, time); setPos(time); };
    const loop = (_: number, meta: VideoFrameCallbackMetadata) => { draw(meta.mediaTime); id = v.requestVideoFrameCallback(loop); };
    loadCaptionFont(POC_CAPTION).then(() => draw(v.currentTime));
    id = v.requestVideoFrameCallback(loop);
    const onSeek = () => draw(v.currentTime);
    v.addEventListener('seeked', onSeek);
    return () => { v.cancelVideoFrameCallback(id); v.removeEventListener('seeked', onSeek); };
  }, [sample, input]);

  const all = () => videos.current.filter(Boolean);
  const togglePlay = () => {
    if (playing) all().forEach((v) => v.pause());
    else { const t0 = videos.current[0]?.currentTime ?? 0; all().forEach((v) => { v.currentTime = t0; v.play(); }); }
    setPlaying(!playing);
  };
  const seek = (time: number) => { all().forEach((v) => (v.currentTime = time)); setPos(time); };

  const exportWith = async (m: 'canvas' | 'ass') => {
    setBusy(m); setError('');
    try {
      const r = await window.cortai.poc.run(m);
      setResults((p) => ({ ...p, [m]: r }));
    } catch (e) {
      setError(t('lab.error', { msg: (e as Error).message }));
    } finally { setBusy(null); }
  };

  const frame = 'relative overflow-hidden rounded-panel border border-border bg-black';
  return (
    <div className="flex flex-col gap-6 px-8 py-8">
      <div>
        <h1 className="font-display text-2xl font-bold">{t('lab.title')}</h1>
        <p className="text-muted">{t('lab.subtitle')}</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button onClick={togglePlay} disabled={!sample} className="flex h-10 cursor-pointer items-center gap-2 rounded-button bg-primary px-4 font-semibold text-on-primary disabled:opacity-40">
          {playing ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
          {playing ? t('lab.pause') : t('lab.playAll')}
        </button>
        <label className="flex items-center gap-3 text-muted">
          {t('lab.position')}
          <input type="range" min={0} max={POC_DURATION} step={1 / 30} value={pos} onChange={(e) => seek(+e.target.value)} className="w-64 accent-[var(--primary)]" />
          <span className="font-mono text-[12px] text-text">{pos.toFixed(2)} s</span>
        </label>
      </div>
      {error && <p role="alert" className="text-danger">{error}</p>}

      <div className="flex flex-wrap gap-6">
        <figure className="flex flex-col gap-2">
          <figcaption className="flex h-9 items-center font-medium">{t('lab.preview')}</figcaption>
          <div className={frame} style={{ width: PW, height: PH }}>
            {sample && <video ref={(el) => { if (el) videos.current[0] = el; }} src={window.cortai.mediaUrl(sample)} muted playsInline className="size-full object-cover" />}
            <canvas ref={canvas} className="pointer-events-none absolute inset-0 size-full" />
          </div>
        </figure>

        {(['canvas', 'ass'] as const).map((m, k) => {
          const r = results[m];
          return (
            <figure key={m} className="flex flex-col gap-2">
              <figcaption className="flex items-center justify-between gap-2">
                <button onClick={() => exportWith(m)} disabled={!!busy} className="h-9 cursor-pointer rounded-button border border-border bg-surface-2 px-3 font-medium hover:border-muted disabled:opacity-40">
                  {busy === m ? t('lab.exporting') : t(m === 'canvas' ? 'lab.exportCanvas' : 'lab.exportAss')}
                </button>
                {r && <span className="font-mono text-[12px] text-muted">{t('lab.took', { s: r.seconds, enc: r.encoder })}</span>}
              </figcaption>
              <div className={frame} style={{ width: PW, height: PH }}>
                {busy === m && <div className="shimmer absolute inset-x-0 top-0 h-1" />}
                {r ? (
                  <video key={r.outPath + r.seconds} ref={(el) => { if (el) videos.current[k + 1] = el; }} src={window.cortai.mediaUrl(r.outPath) + `?v=${r.seconds}`} muted playsInline className="size-full object-contain" />
                ) : (
                  <p className="flex size-full items-center justify-center text-muted">{t('lab.notExported')}</p>
                )}
              </div>
              {r && (
                <button onClick={() => window.cortai.shell.showItem(r.outPath)} className="flex cursor-pointer items-center gap-2 self-start text-[12px] text-muted hover:text-text">
                  <FolderOpen size={14} aria-hidden="true" /> {t('lab.showFile')}
                </button>
              )}
            </figure>
          );
        })}
      </div>
    </div>
  );
}
