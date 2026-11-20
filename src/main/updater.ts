// Atualização automática (SPEC 4.1): electron-updater + GitHub Releases (publish em electron-builder.yml).
// Procura ao abrir e a cada 6 h, baixa em segundo plano e avisa a janela; instala ao reiniciar (ou ao fechar o app).
// Em dev não faz nada. Sem internet ou sem release publicado: segue em silêncio.
import { app, ipcMain } from 'electron';
import electronUpdater from 'electron-updater';
import type { UpdateState } from '@shared/types';

const { autoUpdater } = electronUpdater;
const SIX_HOURS = 6 * 60 * 60 * 1000;

export function initUpdater(send: (ch: string, data: unknown) => void) {
  let state: UpdateState = { state: 'idle' };
  const set = (s: UpdateState) => { state = s; send('updates:state', s); };
  ipcMain.handle('updates:state', () => state);
  ipcMain.handle('updates:install', () => autoUpdater.quitAndInstall(false, true));
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('update-available', (i) => set({ state: 'downloading', version: i.version, percent: 0 }));
  autoUpdater.on('download-progress', (p) => set({ state: 'downloading', version: 'version' in state ? state.version : '', percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', (i) => set({ state: 'ready', version: i.version }));
  autoUpdater.on('error', () => { if (state.state === 'downloading') set({ state: 'idle' }); });
  const check = () => autoUpdater.checkForUpdates().catch(() => {});
  void check();
  setInterval(check, SIX_HOURS);
}
