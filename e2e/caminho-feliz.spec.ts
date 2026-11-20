// E2E do caminho feliz (SPEC Fase 3): abre o app de verdade numa pasta isolada (CORTAI_HOME), passa pelo
// primeiro uso, abre um projeto, entra no editor, duplica um pedaço, desfaz e apaga. Não precisa de modelos
// nem de internet: o projeto é sintético. Rodar:  npm run build && npm run e2e
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ID, seedProject } from './fixture';

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

  // 4b'. Ajustar enquadramento num pedaço (arrasto/setas) fixa só ele; os vizinhos da mesma cópia continuam no rosto
  await pieces.nth(0).click();
  await page.getByRole('button', { name: 'Ajustar enquadramento' }).click();
  await page.getByRole('slider', { name: 'Janela de recorte' }).focus();
  await page.keyboard.press('ArrowRight');
  await page.getByRole('button', { name: 'Concluir enquadramento' }).click();
  await expect(pieces.nth(0)).toContainText('P');
  await expect(pieces.nth(1)).not.toContainText('P');
  await page.keyboard.press('Control+z');

  // 4b''. Zoom só de uma parte: as outras ficam com o zoom delas
  await pieces.nth(0).click();
  await page.locator('label', { hasText: /^Zoom/ }).locator('input[type=range]').fill('150');
  await expect(pieces.nth(0)).toContainText('150%');
  await expect(pieces.nth(1)).not.toContainText('%');
  await page.keyboard.press('Control+z');

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

test('templates e brand kit: criar, aplicar no corte', async () => {
  test.setTimeout(120_000);
  seedProject(HOME);
  const { app, page } = await open();

  // template próprio a partir do padrão
  await page.getByRole('button', { name: 'Templates' }).first().click();
  await page.getByRole('button', { name: 'Novo template' }).click();
  await page.getByLabel('Nome').fill('Meu estilo E2E');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.getByText('Meu estilo E2E', { exact: true })).toBeVisible();

  // brand kit com esse template e CTA
  await page.getByRole('button', { name: 'Brand kits' }).first().click();
  // kit do sistema: já existe e é o primeiro, mas é só exemplo (sem padrão: cortes saem sem logo nem CTA)
  await expect(page.locator('main li').first()).toContainText('Cortaí');
  await expect(page.locator('main li').first()).not.toContainText('Padrão');
  if (process.env.SHOTS) await page.screenshot({ path: join(process.env.SHOTS, 'brandkits-sistema.png') }); // print opcional
  await page.getByRole('button', { name: 'Novo brand kit' }).click();
  await page.getByLabel('Nome', { exact: true }).fill('Cliente E2E');
  await page.getByLabel('Template padrão').selectOption({ label: 'Meu estilo E2E' });
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.getByText('Cliente E2E', { exact: true })).toBeVisible();

  // no editor: escolher o kit aplica o template dele
  await page.getByRole('button', { name: 'Início' }).first().click();
  await page.getByText('Projeto de teste').first().click();
  await page.getByRole('button', { name: 'Editar' }).first().click();
  await page.getByRole('tab', { name: 'Layout' }).click();
  await page.getByLabel('Brand kit').selectOption({ label: 'Cliente E2E' });
  await page.getByRole('tab', { name: 'Legenda' }).click();
  await expect(page.getByRole('combobox', { name: 'Template', exact: true })).toHaveValue(/^t/);
  // CTA do próprio corte: texto + posição
  await page.getByRole('tab', { name: 'Layout' }).click();
  await page.getByLabel('CTA deste corte').fill('Me siga para mais');
  await page.getByText('Abaixo', { exact: true }).click();
  await expect(page.getByLabel('CTA deste corte')).toHaveValue('Me siga para mais');

  // tornar padrão / excluir com confirmação; o kit do sistema não tem lixeira
  await page.getByRole('button', { name: 'Voltar aos resultados' }).click();
  await page.getByRole('button', { name: 'Brand kits' }).first().click();
  const cortai = page.locator('main li').filter({ hasText: 'Cortaí' }).first();
  const cliente = page.locator('main li').filter({ hasText: 'Cliente E2E' });
  await expect(cortai.getByRole('button', { name: /^Excluir/ })).toHaveCount(0); // o do sistema nunca é apagado
  await cortai.getByRole('button', { name: 'Tornar padrão' }).click();
  await expect(cortai.getByText('Padrão', { exact: true })).toBeVisible();
  await cortai.getByRole('button', { name: 'Remover padrão' }).click();
  await expect(cortai.getByText('Padrão', { exact: true })).toHaveCount(0);
  await cliente.getByRole('button', { name: 'Tornar padrão' }).click();
  await expect(cliente.getByText('Padrão', { exact: true })).toBeVisible();
  if (process.env.SHOTS) await page.screenshot({ path: join(process.env.SHOTS, 'kits-padrao.png') });
  await cliente.getByRole('button', { name: 'Excluir Cliente E2E' }).click();
  await expect(page.getByRole('alertdialog')).toContainText('sem brand kit');
  await page.getByRole('button', { name: 'Cancelar' }).click();
  await expect(cliente).toHaveCount(1);
  await cliente.getByRole('button', { name: 'Excluir Cliente E2E' }).click();
  await page.getByRole('button', { name: 'Excluir definitivamente' }).click();
  await expect(cliente).toHaveCount(0);
  await expect(page.getByText('Padrão', { exact: true })).toHaveCount(0); // sem padrão de novo

  expect(errors).toEqual([]);
  await close(app);
});

test('excluir projeto: confirmação e apaga tudo (projeto, cortes e exportados)', async () => {
  test.setTimeout(120_000);
  seedProject(HOME);
  const out = join(HOME, 'Videos', 'Projeto de teste');
  mkdirSync(out, { recursive: true });
  const files = ['01 - Corte de teste.mp4', '01 - Corte de teste.srt', '01 - Corte de teste.txt'].map((f) => join(out, f));
  for (const f of files) writeFileSync(f, 'x');
  writeFileSync(join(HOME, 'projects', ID, 'exports.json'), JSON.stringify({ schemaVersion: 1, files: [files[0]] }));
  const { app, page } = await open();
  await page.getByRole('button', { name: 'Projetos' }).first().click();

  // cancelar não apaga nada
  await page.getByRole('button', { name: 'Excluir o projeto Projeto de teste' }).click();
  await expect(page.getByRole('alertdialog')).toContainText('eliminados em definitivo');
  if (process.env.SHOTS) await page.screenshot({ path: join(process.env.SHOTS, 'excluir-projeto.png') }); // print opcional
  await page.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.getByText('Projeto de teste')).toBeVisible();
  expect(existsSync(join(HOME, 'projects', ID))).toBe(true);

  // confirmar apaga o projeto inteiro e os arquivos exportados
  await page.getByRole('button', { name: 'Excluir o projeto Projeto de teste' }).click();
  await page.getByRole('button', { name: 'Excluir definitivamente' }).click();
  await expect(page.getByText('Projeto de teste')).toHaveCount(0);
  expect(existsSync(join(HOME, 'projects', ID))).toBe(false);
  expect(files.map(existsSync)).toEqual([false, false, false]);
  expect(existsSync(out)).toBe(false);
  expect(errors).toEqual([]);
  await close(app);
});
