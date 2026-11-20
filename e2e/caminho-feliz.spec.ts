// E2E do caminho feliz (SPEC Fase 3): abre o app de verdade numa pasta isolada (CORTAI_HOME), passa pelo
// primeiro uso, abre um projeto, entra no editor, duplica um pedaço, desfaz e apaga. Não precisa de modelos
// nem de internet: o projeto é sintético. Rodar:  npm run build && npm run e2e
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { seedProject } from './fixture';

const HOME = mkdtempSync(join(tmpdir(), 'cortai-e2e-'));
const errors: string[] = [];

async function open(): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({ args: ['.'], env: { ...process.env, CORTAI_HOME: HOME } });
  const page = await app.firstWindow();
  page.on('pageerror', (e) => errors.push(e.message));
  return { app, page };
}

test.afterAll(() => rmSync(HOME, { recursive: true, force: true }));

test('caminho feliz: primeiro uso → projeto → editor → duplicar → desfazer → apagar', async () => {
  test.setTimeout(120_000);

  // 1. Primeiro uso: o assistente confere os componentes
  let { app, page } = await open();
  await expect(page.getByText('Componentes')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Motor de IA')).toBeVisible();
  await app.close();

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

  // 5. Desfazer volta para 2; apagar o 1º deixa 1
  await page.keyboard.press('Control+z');
  await expect(pieces).toHaveCount(2);
  await pieces.nth(0).click();
  await page.keyboard.press('Delete');
  await expect(pieces).toHaveCount(1);

  expect(errors).toEqual([]);
  await app.close();
});
