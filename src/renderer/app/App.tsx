import { useCallback, useEffect, useState } from 'react';
import type { EngineStatus, Settings, SystemInfo } from '@shared/types';
import { useComponents, useJobs, type Route } from './data';
import { Sidebar } from './Sidebar';
import { Titlebar } from './Titlebar';
import { Home } from '../screens/Home';
import { Lab } from '../screens/Lab';
import { Templates } from '../screens/Templates';
import { BrandKits } from '../screens/BrandKits';
import { useLibrary } from './library';
import { Setup } from '../screens/Setup';
import { Processing } from '../screens/Processing';
import { Results } from '../screens/Results';
import { Projects } from '../screens/Projects';
import { Exports } from '../screens/Exports';
import { Editor } from '../editor/Editor';
import { ErrorBoundary } from '../components/ErrorBoundary';

export function App() {
  // ponytail: roteamento por estado; trocar por router quando precisar de deep link.
  const [route, setRoute] = useState<Route>({ name: 'home' });
  const [engine, setEngine] = useState<EngineStatus>('starting');
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const comps = useComponents();
  const jobs = useJobs();
  useLibrary(); // registra as fontes dos brand kits logo ao abrir
  const go = useCallback((r: Route) => setRoute(r), []);

  useEffect(() => {
    window.cortai.engine.status().then(setEngine);
    window.cortai.system.info().then(setInfo);
    window.cortai.settings.get().then(setSettings);
    return window.cortai.engine.onStatus(setEngine);
  }, []);

  if (!settings) return null;
  const titlebar = <Titlebar mac={info?.platform === 'darwin'} onSettings={() => go({ name: 'settings' })} />;
  if (!settings.setupDone) {
    return (
      <div className="flex h-full flex-col">
        {titlebar}
        <main className="flex-1 overflow-auto"><Setup onDone={() => window.cortai.settings.get().then(setSettings)} /></main>
      </div>
    );
  }

  const ready = comps.length > 0 && comps.filter((c) => c.id !== 'ytdlp').every((c) => c.state === 'ready');
  const queued = jobs.filter((j) => j.status === 'queued' || j.status === 'running').length;
  return (
    <div className="flex h-full flex-col">
      {titlebar}
      {route.name === 'editor' ? (
        <main className="relative min-h-0 flex-1"><ErrorBoundary onReset={() => go({ name: 'home' })}><Editor projectId={route.projectId} clipId={route.clipId} go={go} /></ErrorBoundary></main>
      ) : (
      <div className="flex min-h-0 flex-1">
        <Sidebar route={route.name} onChange={(name) => go({ name } as Route)} engine={engine} gpu={info?.gpu ?? null} queue={queued} />
        <main className="min-w-0 flex-1 overflow-auto">
          <ErrorBoundary key={route.name} onReset={() => go({ name: 'home' })}>
          {route.name === 'home' && <Home userName={info?.userName} gpu={!!info?.gpu} ready={ready} go={go} />}
          {route.name === 'projects' && <Projects go={go} />}
          {route.name === 'processing' && <Processing key={route.id} id={route.id} go={go} />}
          {route.name === 'results' && <Results key={route.id} id={route.id} go={go} />}
          {route.name === 'exports' && <Exports />}
          {route.name === 'settings' && <Setup inSettings onDone={() => go({ name: 'home' })} />}
          {route.name === 'lab' && <Lab />}
          {route.name === 'templates' && <Templates />}
          {route.name === 'brandkits' && <BrandKits />}
          </ErrorBoundary>
        </main>
      </div>
      )}
    </div>
  );
}
