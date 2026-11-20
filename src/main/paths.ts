import { app } from 'electron';
import { homedir } from 'node:os';
import { join } from 'node:path';

// CORTAI_HOME (testes E2E): dados e projetos numa pasta isolada, sem tocar nos do usuário.
const HOME = process.env.CORTAI_HOME;
if (HOME) app.setPath('userData', join(HOME, 'data'));
export const projectsRoot = () => (HOME ? join(HOME, 'projects') : join(homedir(), 'Cortai', 'projects'));
export const componentsDir = () => join(app.getPath('userData'), 'components');
export const defaultOutputDir = () => join(app.getPath('videos'), 'Cortaí');
// Motor de IA: o código (~0,5 MB) vem no app; o venv (Python + bibliotecas, ~2,4 GB) é baixado pelo assistente.
// Instalado: código em resources/engine (fora do asar) e venv nos dados do usuário (sobrevive a atualizações).
// Em dev: engine/ e engine/.venv do repositório.
export const engineDir = () => (app.isPackaged ? join(process.resourcesPath, 'engine') : join(app.getAppPath(), 'engine'));
export const engineVenv = () => (app.isPackaged ? join(componentsDir(), 'engine-venv') : join(engineDir(), '.venv'));
export const exe = (name: string) => (process.platform === 'win32' ? `${name}.exe` : name);
