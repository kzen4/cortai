import '@fontsource/sora/600.css';
import '@fontsource/sora/700.css';
import '@fontsource/sora/800.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
// fontes das legendas (templates)
import '@fontsource/inter/700.css';
import '@fontsource/poppins/800.css';
import '@fontsource/anton/400.css';
import '@fontsource/bebas-neue/400.css';
import '@fontsource/archivo-black/400.css';
import './styles/globals.css';
import './i18n';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { runExportWorker } from './overlay/exportWorker';

// #export = janela oculta que desenha os quadros do export com o mesmo drawOverlay do preview
if (location.hash === '#export') runExportWorker();
else createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
