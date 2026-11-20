// Grava os quadros da demo do README/site (não roda no CI). Precisa do ffmpeg no PATH.
//   npm run build && set DEMO=1 && npx playwright test demo   →  docs/assets/demo-frames/*.png
//   python scripts/montar-gif.py                               →  docs/assets/demo.gif
// Vídeo e fala são sintéticos (padrão de teste do ffmpeg): nada de conteúdo de terceiros.
import { _electron as electron, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { seedProject } from './fixture';

const OUT = join(__dirname, '..', 'docs', 'assets', 'demo-frames');

test.skip(!process.env.DEMO, 'só com DEMO=1');

test('demo', async () => {
  test.setTimeout(180_000);
  const HOME = mkdtempSync(join(tmpdir(), 'cortai-demo-'));
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  const D = 20;
  // 1º abre uma vez para criar o banco; depois semeia o projeto com vídeo e áudio de verdade
  let app = await electron.launch({ args: ['.'], env: { ...process.env, CORTAI_HOME: HOME } });
  await (await app.firstWindow()).getByText('Componentes').waitFor({ timeout: 30_000 });
  await app.close();
  seedProject(HOME, {
    duration: D,
    withMedia: (dir) => {
      const ff = (args: string[]) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args]);
      // "fala": ruído rosa com envelope de sílabas e pausas
      const voz = `anoisesrc=color=pink:duration=${D}:sample_rate=16000,volume='0.15+0.85*abs(sin(2*PI*t*2.3))*gt(sin(2*PI*t*0.45),-0.6)':eval=frame`;
      ff(['-f', 'lavfi', '-i', `testsrc2=size=1920x1080:rate=30:duration=${D}`, '-f', 'lavfi', '-i', voz,
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast', '-c:a', 'aac', '-shortest', join(dir, 'source', 'proxy.mp4')]);
      ff(['-f', 'lavfi', '-i', voz, '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', join(dir, 'cache', 'audio.wav')]);
    },
  });

  app = await electron.launch({ args: ['.'], env: { ...process.env, CORTAI_HOME: HOME } });
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1440, height: 900 });
  let n = 0;
  const shot = async (wait = 400) => { await page.waitForTimeout(wait); await page.screenshot({ path: join(OUT, `${String(++n).padStart(2, '0')}.png`) }); };

  await page.getByText('Projeto de teste').first().click();
  await page.getByRole('button', { name: 'Editar' }).first().click();
  const pieces = page.locator('[aria-label^="Pedaço"]');
  await pieces.nth(1).waitFor();
  await shot(1500);                                   // editor aberto
  await pieces.nth(1).click(); await shot();          // seleciona um pedaço
  await page.keyboard.press('Control+d'); await shot(); // duplica
  await pieces.nth(2).click();
  await page.getByRole('button', { name: 'Reproduzir (Espaço)' }).click();
  for (let i = 0; i < 4; i++) await shot(700);        // toca a cópia
  await page.getByRole('button', { name: 'Pausar (Espaço)' }).click();
  const prev = page.locator('section[aria-label="Prévia do corte"] canvas').nth(1);
  const box = (await prev.boundingBox())!;
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height * 0.7); // legenda (positionY 70%)
  await shot();
  await page.keyboard.type('CORTES PRONTOS EM SEGUNDOS', { delay: 25 });
  await shot();
  await page.keyboard.press('Enter'); await shot(600); // legenda editada
  await app.close();
  rmSync(HOME, { recursive: true, force: true });
});
