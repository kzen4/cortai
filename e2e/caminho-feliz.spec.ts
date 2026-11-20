// E2E do caminho feliz (SPEC Fase 3): abre o app de verdade numa pasta isolada (CORTAI_HOME), passa pelo
// primeiro uso, abre um projeto, entra no editor, duplica um pedaço, desfaz e apaga. Não precisa de modelos
// nem de internet: o projeto é sintético. Rodar:  npm run build && npm run e2e
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { seedProject } from './fixture';

const HOME = mkdtempSync(join(tmpdir(), 'cortai-e2e-'));
const errors: string[] = [];
const logs: string[] = []; // console da janela + saída do processo principal (vão para test-results se falhar)
let current: { app: ElectronApplication; page: Page } | null = null;

async function open(): Promise<{ app: ElectronApplication; page: Page }> {
  // idioma fixo: o app segue o do sistema (o runner do GitHub é em inglês) e o teste confere textos em português
  const app = await electron.launch({ args: ['.', `--lang=${process.env.E2E_LANG ?? 'pt-BR'}`], env: { ...process.env, CORTAI_HOME: HOME } });
  app.process().stdout?.on('data', (d) => logs.push(`[main] ${d}`));
  app.process().stderr?.on('data', (d) => logs.push(`[main:err] ${d}`));
  const page = await app.firstWindow();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => logs.push(`[janela:${m.type()}] ${m.text()}`));
  current = { app, page };
  return current;
}
async function close(app: ElectronApplication) { await app.close(); current = null; }

// falhou: guarda print, texto da tela e logs (o CI sobe test-results/ como artefato) e fecha o app
test.afterEach(async ({}, info) => {
  if (!current) return;
  if (info.status !== info.expectedStatus) {
    const { page } = current;
    await page.screenshot({ path: info.outputPath('tela.png') }).catch(() => {});
    const texto = await page.evaluate(() => document.body.innerText).catch((e) => `(sem texto: ${e})`);
    const rel = [`URL: ${page.url()}`, '', 'TELA:', texto, '', 'ERROS:', ...errors, '', 'LOGS:', logs.join('')];
    writeFileSync(info.outputPath('diagnostico.txt'), rel.join('\n'));
  }
  await current.app.close().catch(() => {});
  current = null;
});
test.afterAll(() => { try { rmSync(HOME, { recursive: true, force: true }); } catch { /* app ainda soltando o banco: o temp do SO limpa */ } });

test('caminho feliz: primeiro uso → projeto → editor → duplicar → desfazer → apagar', async () => {
  test.setTimeout(120_000);

  // 1. Primeiro uso: o assistente confere os componentes
  let { app, page } = await open();
  await expect(page.getByText('Componentes')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Motor de IA')).toBeVisible();
  await close(app);

  // 2. Com um projeto pronto, abre direto no Início
  seedProject(HOME);
  ({ app, page } = await open());
  await page.getByText('Projeto de teste').first().click();
  await expect(page.getByText('Corte de teste')).toBeVisible();
  await page.getByRole('button', { name: 'Editar' }).first().click();

  // 3. Editor: 2 pedaços (o corte de 4–5 s)
  const pieces = page.locator('[aria-label^="Pedaço"]');
  await expect(pieces).toHaveCount(2, { timeout: 15_000 });

  // 4. Duplicar o 2º pedaço (Ctrl+D) → 3 pedaços, a cópia logo depois
  await pieces.nth(1).click();
  await page.keyboard.press('Control+d');
  await expect(pieces).toHaveCount(3);
  await expect(pieces.nth(2)).toHaveAttribute('aria-label', /Cópia 1/);

  // 4b. Enquadramento por pedaço: o pedaço selecionado vai para a esquerda (marca "E" na timeline)
  await page.getByRole('tab', { name: 'Layout' }).click();
  await pieces.nth(0).click();
  await page.getByText('Esquerda', { exact: true }).click();
  await expect(pieces.nth(0)).toContainText('E');
  await expect(pieces.nth(1)).not.toContainText('E');
  await page.keyboard.press('Control+z'); // desfaz o enquadramento

  // 4c. Tela + webcam: legenda vai para o meio e aparece o ajuste da janela da webcam
  await page.getByText('Tela + webcam', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Ajustar janela da webcam' })).toBeVisible();
  await page.getByRole('tab', { name: 'Legenda' }).click();
  await expect(page.getByText('50%', { exact: true })).toBeVisible();
  await page.keyboard.press('Control+z'); // volta ao modo anterior

  // 5. Desfazer volta para 2; apagar o 1º deixa 1
  await page.keyboard.press('Control+z');
  await expect(pieces).toHaveCount(2);
  await pieces.nth(0).click();
  await page.keyboard.press('Delete');
  await expect(pieces).toHaveCount(1);

  expect(errors).toEqual([]);
  await close(app);
});
