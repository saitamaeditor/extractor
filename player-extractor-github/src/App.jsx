import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Clapperboard, Settings, ScanSearch, Film, Send, Loader2, Library } from 'lucide-react';
import SiteLibrary from './components/SiteLibrary.jsx';

// El extractor (y el reproductor de vista previa con hls.js) solo se descarga al abrir su pestaña.
const Extractor = lazy(() => import('./components/Extractor.jsx'));
import TmdbCatalog from './components/TmdbCatalog.jsx';
import WordPressPublisher from './components/WordPressPublisher.jsx';
import SettingsModal from './components/SettingsModal.jsx';
import Notices from './components/Notices.jsx';
import { loadSettings, loadSharedSettings, saveSettings } from './lib/storage.js';

const TABS = [
  ['publisher', 'Publicador', Send],
  ['library', 'Mi web', Library],
  ['catalog', 'Catálogo TMDB', Film],
  ['extractor', 'Extractor', ScanSearch],
];

export default function App() {
  const [tab, setTab] = useState('publisher');
  const [extractorOpened, setExtractorOpened] = useState(false);
  const openTab = (key) => {
    if (key === 'extractor') setExtractorOpened(true);
    setTab(key);
  };
  const [settings, setSettings] = useState(loadSettings);
  const [settingsTab, setSettingsTab] = useState(null);
  const [draft, setDraft] = useState(null);
  const [notices, setNotices] = useState([]);

  const dismiss = useCallback((id) => setNotices((n) => n.filter((x) => x.id !== id)), []);

  const notify = useCallback((notice) => {
    const id = Date.now() + Math.random();
    setNotices((n) => [...n.slice(-3), { id, ...notice }]);
    // Los errores se quedan hasta que se cierran; el resto desaparece solo.
    if (notice.type !== 'error') setTimeout(() => dismiss(id), notice.links ? 12000 : 5000);
  }, [dismiss]);

  const updateSettings = (next) => {
    setSettings(next);
    saveSettings(next);
  };

  // Al arrancar, manda el archivo compartido config/ajustes.json (igual en todos los navegadores).
  // Si aún no existe y este navegador tiene ajustes guardados, se usan para crearlo.
  useEffect(() => {
    loadSharedSettings().then((shared) => {
      if (shared) {
        setSettings(shared);
        try { localStorage.setItem('pe:settings', JSON.stringify(shared)); } catch { /* sin almacenamiento */ }
      } else if (settings.remember && settings.wp.siteUrl) {
        saveSettings(settings);
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const sendToPublisher = (d) => {
    setDraft({ ...d });
    setTab('publisher');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const wpReady = Boolean(settings.wp.siteUrl && settings.wp.appPassword);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:py-12">
      <header className="mb-6 flex items-center gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-rose-500 to-orange-500 shadow-lg shadow-rose-500/20">
          <Clapperboard size={22} />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Extractor de Reproductores</h1>
          <p className="text-sm text-zinc-400">Analiza páginas, crea fichas con TMDB y publícalas en tu WordPress.</p>
        </div>
        <button
          onClick={() => setSettingsTab('wp')}
          className="flex shrink-0 items-center gap-2 rounded-xl border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
          title="Ajustes de WordPress y TMDB"
        >
          <span className={`h-2 w-2 rounded-full ${wpReady ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
          <Settings size={16} /> <span className="hidden sm:inline">Ajustes</span>
        </button>
      </header>

      <nav className="scroll-thin mb-6 flex gap-1 overflow-x-auto border-b border-zinc-800">
        {TABS.map(([key, text, Icon]) => (
          <button
            key={key}
            onClick={() => openTab(key)}
            className={`flex shrink-0 items-center gap-2 border-b-2 px-4 pb-3 text-sm transition ${tab === key ? 'border-rose-500 font-semibold text-white' : 'border-transparent text-zinc-400 hover:text-zinc-200'}`}
          >
            <Icon size={16} /> {text}
          </button>
        ))}
      </nav>

      {/* Las pestañas se mantienen montadas para no perder lo escrito al cambiar. */}
      <div hidden={tab !== 'extractor'}>
        {extractorOpened && (
          <Suspense fallback={<p className="flex items-center gap-2 text-sm text-zinc-500"><Loader2 size={16} className="animate-spin" /> Cargando el extractor…</p>}>
            <Extractor />
          </Suspense>
        )}
      </div>
      <div hidden={tab !== 'library'}>
        <SiteLibrary settings={settings} onOpenSettings={setSettingsTab} notify={notify} />
      </div>
      <div hidden={tab !== 'catalog'}>
        <TmdbCatalog settings={settings} onOpenSettings={setSettingsTab} onUseDraft={sendToPublisher} notify={notify} />
      </div>
      <div hidden={tab !== 'publisher'}>
        <WordPressPublisher settings={settings} draft={draft} onOpenSettings={setSettingsTab} notify={notify} />
      </div>

      <footer className="mt-12 text-center text-xs text-zinc-600">
        El análisis se hace en tu navegador. Las claves solo se envían a tu WordPress y a TMDB.
      </footer>

      {settingsTab && (
        <SettingsModal
          settings={settings}
          initialTab={settingsTab}
          onSave={updateSettings}
          onClose={() => setSettingsTab(null)}
          notify={notify}
        />
      )}
      <Notices items={notices} onDismiss={dismiss} />
    </div>
  );
}
