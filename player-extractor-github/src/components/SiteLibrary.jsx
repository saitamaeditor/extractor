import { useMemo, useRef, useState } from 'react';
import { RefreshCw, Loader2, Search, ExternalLink, Pencil, Film, Tv, CheckCircle2, AlertTriangle, Square, Settings } from 'lucide-react';
import { loadLibrary, missingFor, refreshItem } from '../lib/library.js';
import { summaryTitle } from '../lib/publish.js';
import { addPublished } from '../lib/storage.js';
import TmdbImg from './TmdbImg.jsx';

const input = 'rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm placeholder:text-zinc-600 focus:border-rose-500/60 focus:outline-none';
const smallBtn = 'flex items-center gap-1 rounded-lg border border-zinc-700 px-2 py-1 text-[11px] text-zinc-300 hover:bg-zinc-800 disabled:opacity-40';
const STATUS = { publish: 'Publicado', draft: 'Borrador', pending: 'Pendiente', private: 'Privado', future: 'Programado' };
const STATUSES = Object.entries(STATUS);
const DEFAULT_TYPE = { slug: 'post', restBase: 'posts', name: 'Entradas', taxonomies: ['category', 'post_tag'] };

// Películas y series que ya están en la web: qué les falta y actualización desde TMDB.
export default function SiteLibrary({ settings, onOpenSettings, notify }) {
  const { theme, wp } = settings;
  const types = theme.types.length ? theme.types : [DEFAULT_TYPE];
  const [items, setItems] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [addSeasons, setAddSeasons] = useState(true);
  const [work, setWork] = useState({}); // id → { state, text }
  const [bulk, setBulk] = useState(null);
  const stopRef = useRef(false);

  const load = async () => {
    setLoading(true);
    try {
      setItems(await loadLibrary(settings));
    } catch (e) {
      notify({ type: 'error', title: 'No se pudo leer tu web', message: e.message });
    } finally {
      setLoading(false);
    }
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (items || []).filter((it) =>
      (filter === 'all' || (filter === 'incomplete' ? it.missing.length : it.kind === filter))
      && (!q || it.title.toLowerCase().includes(q) || it.imdb?.includes(q)));
  }, [items, filter, query]);

  const counts = useMemo(() => ({
    all: items?.length || 0,
    movie: items?.filter((i) => i.kind === 'movie').length || 0,
    tv: items?.filter((i) => i.kind === 'tv').length || 0,
    incomplete: items?.filter((i) => i.missing.length).length || 0,
  }), [items]);

  const refresh = async (item) => {
    setWork((w) => ({ ...w, [item.id]: { state: 'working', text: 'Consultando TMDB…' } }));
    try {
      const res = await refreshItem(settings, types, item, {
        addSeasons,
        onStep: (text) => setWork((w) => ({ ...w, [item.id]: { state: 'working', text } })),
        onProgress: ({ done, total }) => setWork((w) => ({ ...w, [item.id]: { state: 'working', text: `Temporadas y episodios: ${done}/${total}` } })),
      });
      const text = summaryTitle(res, STATUSES) + (res.warnings.length ? ` · ${res.warnings.join(' · ')}` : '');
      setWork((w) => ({ ...w, [item.id]: { state: 'done', text } }));
      addPublished({ site: wp.siteUrl, id: item.id, title: item.title, kind: item.kind, status: item.status, link: item.link, edit: item.edit, action: 'update' });
      // La lista refleja cómo ha quedado la ficha en WordPress.
      const meta = res.post.meta || {};
      setItems((list) => list.map((it) => (it.id === item.id
        ? { ...it, missing: missingFor(res.post, theme), imdb: meta[theme.fields.imdb_id] || it.imdb, tmdb: meta[theme.fields.tmdb_id] || it.tmdb, poster: meta[theme.fields.poster_url] || it.poster }
        : it)));
      return true;
    } catch (e) {
      setWork((w) => ({ ...w, [item.id]: { state: 'error', text: e.status ? `${e.message} (HTTP ${e.status})` : e.message } }));
      return false;
    }
  };

  const refreshAll = async () => {
    const list = visible;
    if (!window.confirm(`Se actualizarán desde TMDB ${list.length} fichas (campos y taxonomías; títulos, textos e imágenes no se tocan).${addSeasons ? '\nEn las series se añadirán también las temporadas y episodios que falten.' : ''}\n\n¿Continuar?`)) return;
    stopRef.current = false;
    let ok = 0;
    for (let i = 0; i < list.length; i++) {
      if (stopRef.current) break;
      setBulk({ done: i, total: list.length });
      if (await refresh(list[i])) ok++;
    }
    setBulk(null);
    notify({ type: ok === list.length ? 'success' : 'warning', title: `Actualizadas ${ok} de ${list.length} fichas` });
  };

  if (!theme.enabled) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-800 p-10 text-center">
        <p className="font-semibold">Activa primero la estructura del theme</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-zinc-400">Esta sección lee tus películas y series de MovieEngine, así que necesita saber sus tipos y campos.</p>
        <button onClick={() => onOpenSettings('theme')} className="mx-auto mt-5 flex items-center gap-2 rounded-xl bg-rose-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-rose-400"><Settings size={16} /> Ajustes → Theme</button>
      </div>
    );
  }

  const busy = Boolean(bulk) || Object.values(work).some((w) => w.state === 'working');

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
        <button onClick={load} disabled={loading || busy} className="flex items-center gap-2 rounded-xl bg-rose-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-400 disabled:opacity-40">
          {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} {items ? 'Volver a cargar' : 'Cargar mis películas y series'}
        </button>
        <span className="text-xs text-zinc-500">Lee {wp.siteUrl.replace(/^https?:\/\//, '')} y marca lo que le falta a cada ficha según el mapeo de MovieEngine.</span>
      </div>

      {items && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {[['all', 'Todas'], ['movie', 'Películas'], ['tv', 'Series'], ['incomplete', 'Incompletas']].map(([key, label]) => (
              <button key={key} onClick={() => setFilter(key)} className={`rounded-full px-3.5 py-1.5 text-sm ${filter === key ? 'bg-zinc-100 font-semibold text-zinc-900' : 'bg-zinc-900 text-zinc-400 ring-1 ring-zinc-800 hover:text-zinc-200'}`}>
                {label} <span className="ml-1 opacity-60">{counts[key]}</span>
              </button>
            ))}
            <div className="ml-auto flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 px-3">
              <Search size={14} className="text-zinc-500" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar título o IMDb…" className="w-48 bg-transparent py-2 text-sm focus:outline-none" />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-400">
            <label className="flex items-center gap-2">
              <input type="checkbox" className="accent-rose-500" checked={addSeasons} onChange={(e) => setAddSeasons(e.target.checked)} disabled={busy} />
              En las series, añadir las temporadas y episodios que falten (con el mismo estado que la serie)
            </label>
            {bulk ? (
              <button onClick={() => { stopRef.current = true; }} className="ml-auto flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1.5 hover:bg-zinc-800"><Square size={12} /> Detener ({bulk.done}/{bulk.total})</button>
            ) : (
              <button onClick={refreshAll} disabled={!visible.length || busy} className="ml-auto flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1.5 hover:bg-zinc-800 disabled:opacity-40">
                <RefreshCw size={12} /> Actualizar las {visible.length} visibles
              </button>
            )}
          </div>

          {visible.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-500">{filter === 'incomplete' ? '¡Todas las fichas están completas!' : 'No hay fichas que coincidan.'}</p>
          ) : (
            <ul className="divide-y divide-zinc-800 overflow-hidden rounded-2xl border border-zinc-800">
              {visible.map((it) => {
                const w = work[it.id];
                return (
                  <li key={it.id} className="flex flex-wrap items-center gap-3 bg-zinc-900/40 px-3 py-2.5">
                    <TmdbImg src={it.poster} alt="" className="h-14 w-10 shrink-0 rounded object-cover" fallbackClassName="h-14 w-10 shrink-0 rounded" />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                        {it.kind === 'tv' ? <Tv size={13} className="shrink-0 text-zinc-500" /> : <Film size={13} className="shrink-0 text-zinc-500" />}
                        {it.title}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-500">
                        <span>{STATUS[it.status] || it.status}</span>
                        {it.imdb && <span className="font-mono">· {it.imdb}</span>}
                        {it.missing.length
                          ? it.missing.map((m) => <span key={m} className="rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-300">falta {m}</span>)
                          : <span className="flex items-center gap-1 text-emerald-400"><CheckCircle2 size={11} /> completa</span>}
                      </p>
                      {w && (
                        <p className={`mt-0.5 flex items-center gap-1 truncate text-[11px] ${w.state === 'error' ? 'text-red-300' : w.state === 'done' ? 'text-emerald-300' : 'text-sky-300'}`}>
                          {w.state === 'working' ? <Loader2 size={11} className="animate-spin" /> : w.state === 'error' ? <AlertTriangle size={11} /> : <CheckCircle2 size={11} />}
                          {w.text}
                        </p>
                      )}
                    </div>
                    <button onClick={() => refresh(it)} disabled={busy} className={smallBtn} title="Actualizar campos y taxonomías desde TMDB"><RefreshCw size={11} /> Actualizar</button>
                    <a href={it.link} target="_blank" rel="noopener noreferrer" className={smallBtn}><ExternalLink size={11} /> Ver</a>
                    <a href={it.edit} target="_blank" rel="noopener noreferrer" className={smallBtn}><Pencil size={11} /> Editar</a>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
