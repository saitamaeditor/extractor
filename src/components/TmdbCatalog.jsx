import { useState } from 'react';
import { Search, Loader2, Settings, Send, Copy, Check, Film, Tv, Star, ExternalLink } from 'lucide-react';
import { buildDraft, factsFor, findByImdb, getDetails, parseImdbId, pickTrailer, providersFor, searchTitles, tmdbImage } from '../lib/tmdb.js';
import { VIDEO_SLOT } from '../lib/blocks.js';
import TmdbImg from './TmdbImg.jsx';

const input = 'w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm placeholder:text-zinc-600 focus:border-rose-500/60 focus:outline-none';

export default function TmdbCatalog({ settings, onOpenSettings, onUseDraft, notify }) {
  const [query, setQuery] = useState('');
  const [type, setType] = useState('multi');
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState(null);
  const [loadingId, setLoadingId] = useState(null);
  const [copied, setCopied] = useState(false);

  const { tmdb } = settings;

  const search = async (e) => {
    e?.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    try {
      // Un ID o enlace de IMDb abre la ficha directamente, en el idioma configurado.
      const imdbId = parseImdbId(query);
      if (imdbId) {
        const found = await findByImdb(imdbId, tmdb);
        if (!found) {
          notify({ type: 'warning', title: `TMDB no tiene ningún título con el ID ${imdbId}` });
          return;
        }
        if (found.episode) notify({ type: 'info', title: 'Ese ID es de un episodio', message: `Se abre la serie (episodio ${found.episode.season}x${found.episode.number}).` });
        setResults(null);
        await open(found);
        return;
      }
      setResults(await searchTitles(query.trim(), { ...tmdb, type }));
    } catch (err) {
      notify({ type: 'error', title: 'Error al buscar en TMDB', message: err.message });
    } finally {
      setSearching(false);
    }
  };

  const open = async (r) => {
    setLoadingId(r.id);
    try {
      const details = await getDetails(r.id, r.type, tmdb);
      setSelected({ type: r.type, details, draft: buildDraft(details, r.type, tmdb) });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      notify({ type: 'error', title: 'No se pudo cargar la ficha', message: err.message });
    } finally {
      setLoadingId(null);
    }
  };

  const copyHtml = async () => {
    const { draft } = selected;
    const trailer = draft.videos[0]?.url;
    await navigator.clipboard.writeText(draft.content.replace(VIDEO_SLOT, trailer ? `<p>${trailer}</p>` : ''));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (!tmdb.token) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-800 p-10 text-center">
        <p className="font-semibold">Conecta TMDB para crear fichas automáticas</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-zinc-400">
          Con una clave gratuita de The Movie Database obtienes sinopsis, póster, reparto, tráiler oficial y las plataformas legales donde ver cada título.
        </p>
        <button onClick={() => onOpenSettings('tmdb')} className="mx-auto mt-5 flex items-center gap-2 rounded-xl bg-rose-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-rose-400">
          <Settings size={16} /> Añadir clave de TMDB
        </button>
      </div>
    );
  }

  const d = selected?.details;
  const providers = d && providersFor(d, tmdb.region);
  const trailer = d && pickTrailer(d, tmdb.language);
  const ytId = trailer && new URL(trailer).searchParams.get('v');

  return (
    <div className="space-y-6">
      <form onSubmit={search} className="flex flex-col gap-2 sm:flex-row">
        <div className="flex flex-1 items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950 px-3">
          <Search size={16} className="text-zinc-500" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar película o serie, o pegar un ID de IMDb (tt0133093)…" className="w-full bg-transparent py-2.5 text-sm focus:outline-none" />
        </div>
        <select value={type} onChange={(e) => setType(e.target.value)} className={`${input} sm:w-40`}>
          <option value="multi">Todo</option>
          <option value="movie">Películas</option>
          <option value="tv">Series</option>
        </select>
        <button type="submit" disabled={searching || !query.trim()} className="flex items-center justify-center gap-2 rounded-xl bg-rose-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-rose-400 disabled:opacity-40">
          {searching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />} Buscar
        </button>
      </form>

      {/* Ficha seleccionada */}
      {selected && (
        <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/60">
          {d.backdrop_path && <div className="h-40 bg-cover bg-center opacity-40" style={{ backgroundImage: `url(${tmdbImage(d.backdrop_path, 'w1280')})` }} />}
          <div className={`grid gap-6 p-5 sm:grid-cols-[180px_1fr] ${d.backdrop_path ? '-mt-24' : ''}`}>
            {d.poster_path ? (
              <TmdbImg src={tmdbImage(d.poster_path, 'w342')} alt={`Póster de ${d.title || d.name}`} className="relative w-40 rounded-xl shadow-2xl sm:w-full" fallbackClassName="relative h-60 w-40 rounded-xl sm:w-full" />
            ) : <div className="grid h-60 place-items-center rounded-xl bg-zinc-800 text-xs text-zinc-500">Sin póster</div>}
            <div className="relative min-w-0">
              <h2 className="text-2xl font-bold tracking-tight">{selected.draft.title}</h2>
              <p className="mt-1 flex items-center gap-3 text-sm text-zinc-400">
                {selected.type === 'movie' ? <Film size={14} /> : <Tv size={14} />}
                {selected.type === 'movie' ? 'Película' : 'Serie'}
                {d.vote_count > 0 && <span className="flex items-center gap-1"><Star size={13} className="text-amber-400" /> {d.vote_average.toFixed(1)}</span>}
              </p>
              <p className="mt-4 text-sm leading-relaxed text-zinc-300">{d.overview || 'Sinopsis no disponible en este idioma.'}</p>

              <dl className="mt-4 grid gap-x-6 gap-y-1.5 text-xs sm:grid-cols-2">
                {factsFor(d, selected.type).slice(0, 8).map(([k, v]) => (
                  <div key={k} className="min-w-0"><dt className="inline text-zinc-500">{k}: </dt><dd className="inline text-zinc-300">{v}</dd></div>
                ))}
              </dl>

              <div className="mt-5">
                <h3 className="mb-2 text-sm font-semibold">Dónde verla en {tmdb.region}</h3>
                {providers ? (
                  <div className="space-y-2">
                    {providers.groups.map((g) => (
                      <div key={g.label} className="flex flex-wrap items-center gap-2">
                        <span className="w-36 text-xs text-zinc-500">{g.label}</span>
                        {g.items.map((p) => (
                          <TmdbImg key={p.name} src={p.logo} alt={p.name} title={p.name} className="h-8 w-8 rounded-lg" />
                        ))}
                      </div>
                    ))}
                    <a href={providers.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-zinc-400 underline underline-offset-2 hover:text-zinc-200">
                      Todas las opciones (JustWatch) <ExternalLink size={11} />
                    </a>
                  </div>
                ) : (
                  <p className="text-xs text-zinc-500">No hay plataformas registradas en {tmdb.region} para este título.</p>
                )}
              </div>
            </div>
          </div>

          {ytId && (
            <div className="px-5 pb-5">
              <h3 className="mb-2 text-sm font-semibold">Tráiler oficial</h3>
              <div className="aspect-video overflow-hidden rounded-xl bg-black">
                <iframe
                  src={`https://www.youtube-nocookie.com/embed/${ytId}`}
                  title="Tráiler"
                  className="h-full w-full"
                  allow="encrypted-media; picture-in-picture; fullscreen"
                  allowFullScreen
                />
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2 border-t border-zinc-800 px-5 py-4">
            <button onClick={() => onUseDraft(selected.draft)} className="flex items-center gap-2 rounded-xl bg-rose-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-rose-400">
              <Send size={16} /> Enviar al publicador de WordPress
            </button>
            <button onClick={copyHtml} className="flex items-center gap-2 rounded-xl border border-zinc-700 px-4 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800">
              {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? 'Copiado' : 'Copiar HTML de la ficha'}
            </button>
            <span className="self-center text-xs text-zinc-600">Datos e imágenes de TMDB · disponibilidad de JustWatch</span>
          </div>
        </section>
      )}

      {/* Resultados de búsqueda */}
      {results && (
        results.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-zinc-800 p-10 text-center text-sm text-zinc-500">Sin resultados para “{query}”.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {results.map((r) => (
              <li key={`${r.type}-${r.id}`}>
                <button onClick={() => open(r)} disabled={loadingId != null} className="group w-full text-left">
                  <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-zinc-800 ring-1 ring-zinc-800 transition group-hover:ring-rose-500/60">
                    <TmdbImg src={r.poster} alt="" loading="lazy" className="h-full w-full object-cover" />
                    {loadingId === r.id && <div className="absolute inset-0 grid place-items-center bg-black/60"><Loader2 className="animate-spin" /></div>}
                    <span className="absolute left-2 top-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-medium">{r.type === 'movie' ? 'Película' : 'Serie'}</span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm font-medium">{r.title}</p>
                  <p className="text-xs text-zinc-500">{r.year || '—'}</p>
                </button>
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  );
}
