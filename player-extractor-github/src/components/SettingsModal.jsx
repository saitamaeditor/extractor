import { useEffect, useState } from 'react';
import { X, Plug, Loader2, Eye, EyeOff, Globe, Clapperboard, ShieldAlert, LayoutTemplate } from 'lucide-react';
import { createClient, normalizeSiteUrl } from '../lib/wordpress.js';
import { searchTitles } from '../lib/tmdb.js';
import ThemeSettings from './ThemeSettings.jsx';

const input = 'w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm placeholder:text-zinc-600 focus:border-rose-500/60 focus:outline-none';
const label = 'mb-1.5 block text-xs font-medium text-zinc-400';

export default function SettingsModal({ settings, initialTab = 'wp', onSave, onClose, notify }) {
  const [draft, setDraft] = useState(settings);
  const [tab, setTab] = useState(initialTab);
  const [showSecret, setShowSecret] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const setWp = (patch) => { setDraft((d) => ({ ...d, wp: { ...d.wp, ...patch } })); setTestResult(null); };
  const setTmdb = (patch) => { setDraft((d) => ({ ...d, tmdb: { ...d.tmdb, ...patch } })); setTestResult(null); };

  const testWp = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const { me, apiMode } = await createClient(draft.wp).testConnection();
      const roles = (me.roles || []).join(', ');
      const connectedAs = `${me.name}${roles ? ` (${roles})` : ''}`;
      setWp({ apiMode, connectedAs, siteUrl: normalizeSiteUrl(draft.wp.siteUrl) });
      setTestResult({ ok: true, text: `Conectado como ${connectedAs}${apiMode === 'query' ? ' · usando ?rest_route=' : ''}.` });
    } catch (e) {
      setWp({ connectedAs: '' });
      setTestResult({ ok: false, text: e.message });
    } finally {
      setTesting(false);
    }
  };

  const testTmdb = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await searchTitles('Matrix', { ...draft.tmdb, type: 'movie' });
      setTestResult({ ok: true, text: `Clave válida (${r.length} resultados de prueba).` });
    } catch (e) {
      setTestResult({ ok: false, text: e.message });
    } finally {
      setTesting(false);
    }
  };

  const save = () => {
    onSave(draft);
    notify({ type: 'success', title: 'Ajustes guardados', message: draft.remember ? 'Se recordarán en este navegador.' : 'Solo se usarán mientras esta pestaña siga abierta.' });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-zinc-800 px-5 py-4">
          <h2 className="flex-1 text-base font-semibold">Ajustes de conexión</h2>
          <button onClick={onClose} className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white" title="Cerrar (Esc)"><X size={18} /></button>
        </div>

        <div className="flex gap-1 border-b border-zinc-800 px-5 pt-3">
          {[['wp', 'WordPress', Globe], ['theme', 'Theme', LayoutTemplate], ['tmdb', 'TMDB', Clapperboard]].map(([key, text, Icon]) => (
            <button
              key={key}
              onClick={() => { setTab(key); setTestResult(null); }}
              className={`flex items-center gap-2 rounded-t-lg border-b-2 px-3 pb-2.5 text-sm ${tab === key ? 'border-rose-500 text-white' : 'border-transparent text-zinc-400 hover:text-zinc-200'}`}
            >
              <Icon size={15} /> {text}
            </button>
          ))}
        </div>

        <div className="scroll-thin flex-1 space-y-4 overflow-auto px-5 py-5">
          {tab === 'theme' ? (
            draft.wp.siteUrl && draft.wp.appPassword ? (
              <ThemeSettings wp={draft.wp} theme={draft.theme} onChange={(theme) => setDraft((d) => ({ ...d, theme }))} />
            ) : (
              <p className="text-sm text-zinc-400">Configura primero la conexión en la pestaña WordPress.</p>
            )
          ) : tab === 'wp' ? (
            <>
              <div>
                <label className={label} htmlFor="wp-url">URL del sitio WordPress</label>
                <input id="wp-url" className={input} placeholder="https://misitio.com" value={draft.wp.siteUrl} onChange={(e) => setWp({ siteUrl: e.target.value })} />
              </div>
              <div>
                <label className={label} htmlFor="wp-auth">Método de autenticación</label>
                <select id="wp-auth" className={input} value={draft.wp.authType} onChange={(e) => setWp({ authType: e.target.value })}>
                  <option value="app-password">Contraseña de aplicación (recomendado)</option>
                  <option value="bearer">Token Bearer (plugin JWT u OAuth)</option>
                </select>
              </div>
              {draft.wp.authType === 'app-password' && (
                <div>
                  <label className={label} htmlFor="wp-user">Nombre de usuario</label>
                  <input id="wp-user" className={input} autoComplete="off" value={draft.wp.username} onChange={(e) => setWp({ username: e.target.value })} />
                </div>
              )}
              <div>
                <label className={label} htmlFor="wp-pass">{draft.wp.authType === 'bearer' ? 'Token' : 'Contraseña de aplicación'}</label>
                <div className="flex gap-2">
                  <input
                    id="wp-pass"
                    className={`${input} font-mono`}
                    type={showSecret ? 'text' : 'password'}
                    autoComplete="new-password"
                    placeholder={draft.wp.authType === 'bearer' ? 'eyJ…' : 'xxxx xxxx xxxx xxxx xxxx xxxx'}
                    value={draft.wp.appPassword}
                    onChange={(e) => setWp({ appPassword: e.target.value })}
                  />
                  <button onClick={() => setShowSecret((s) => !s)} className="rounded-xl border border-zinc-800 px-3 text-zinc-400 hover:text-zinc-200" title={showSecret ? 'Ocultar' : 'Mostrar'}>
                    {showSecret ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {draft.wp.authType === 'app-password' && (
                  <p className="mt-1.5 text-xs text-zinc-500">
                    Créala en tu WordPress: <span className="text-zinc-400">Usuarios → Perfil → Contraseñas de aplicación</span>. No uses tu contraseña normal. Requiere HTTPS.
                  </p>
                )}
              </div>
              <button onClick={testWp} disabled={testing || !draft.wp.siteUrl} className="flex items-center gap-2 rounded-xl border border-zinc-700 px-4 py-2.5 text-sm hover:bg-zinc-800 disabled:opacity-40">
                {testing ? <Loader2 size={16} className="animate-spin" /> : <Plug size={16} />} Probar conexión
              </button>
            </>
          ) : (
            <>
              <div>
                <label className={label} htmlFor="tmdb-token">Clave de la API de TMDB</label>
                <input
                  id="tmdb-token"
                  className={`${input} font-mono`}
                  type={showSecret ? 'text' : 'password'}
                  autoComplete="off"
                  placeholder="API Key (v3) o Token de acceso de lectura (v4)"
                  value={draft.tmdb.token}
                  onChange={(e) => setTmdb({ token: e.target.value })}
                />
                <p className="mt-1.5 text-xs text-zinc-500">
                  Gratis en <a className="underline" href="https://www.themoviedb.org/settings/api" target="_blank" rel="noopener noreferrer">themoviedb.org/settings/api</a>.
                  TMDB exige citarla como fuente: las fichas generadas ya incluyen la atribución.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={label} htmlFor="tmdb-lang">Idioma de las fichas</label>
                  <select id="tmdb-lang" className={input} value={draft.tmdb.language} onChange={(e) => setTmdb({ language: e.target.value })}>
                    {['es-ES', 'es-MX', 'en-US', 'pt-BR', 'fr-FR', 'it-IT', 'de-DE'].map((l) => <option key={l}>{l}</option>)}
                  </select>
                </div>
                <div>
                  <label className={label} htmlFor="tmdb-region">País (plataformas)</label>
                  <select id="tmdb-region" className={input} value={draft.tmdb.region} onChange={(e) => setTmdb({ region: e.target.value })}>
                    {['ES', 'MX', 'AR', 'CO', 'CL', 'PE', 'US', 'BR', 'FR', 'IT', 'DE', 'GB'].map((r) => <option key={r}>{r}</option>)}
                  </select>
                </div>
              </div>
              <button onClick={testTmdb} disabled={testing || !draft.tmdb.token} className="flex items-center gap-2 rounded-xl border border-zinc-700 px-4 py-2.5 text-sm hover:bg-zinc-800 disabled:opacity-40">
                {testing ? <Loader2 size={16} className="animate-spin" /> : <Plug size={16} />} Probar clave
              </button>
            </>
          )}

          {testResult && (
            <p className={`rounded-xl px-4 py-3 text-sm ring-1 ${testResult.ok ? 'bg-emerald-500/10 text-emerald-200 ring-emerald-500/20' : 'bg-red-500/10 text-red-200 ring-red-500/20'}`}>
              {testResult.text}
            </p>
          )}

          <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-rose-500" checked={draft.remember} onChange={(e) => setDraft((d) => ({ ...d, remember: e.target.checked }))} />
              Recordar en este navegador
            </label>
            <p className="mt-2 flex gap-2 text-xs text-zinc-500">
              <ShieldAlert size={14} className="mt-0.5 shrink-0" />
              Se guardan sin cifrar en el archivo <code className="text-zinc-400">player-extractor/config/ajustes.json</code> (los usa cualquier navegador que abra la app y el script de la terminal) y solo se envían a tu WordPress y a TMDB. Úsalo en un equipo propio; puedes revocar la contraseña de aplicación en cualquier momento desde tu perfil de WordPress.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-zinc-800 px-5 py-4">
          <button onClick={onClose} className="rounded-xl border border-zinc-700 px-4 py-2.5 text-sm hover:bg-zinc-800">Cancelar</button>
          <button onClick={save} className="rounded-xl bg-rose-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-rose-400">Guardar</button>
        </div>
      </div>
    </div>
  );
}
