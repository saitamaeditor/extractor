import { useEffect, useRef, useState } from 'react';
import {
  Send, Loader2, Plus, X, Image as ImageIcon, Video, RefreshCw, Settings, CheckCircle2, ExternalLink, Pencil, Upload,
  Square, LayoutTemplate, Search, ListPlus, AlertTriangle,
} from 'lucide-react';
import { createClient } from '../lib/wordpress.js';
import { ALLOWED_VIDEO_HINT, VIDEO_SLOT, videoProvider } from '../lib/blocks.js';
import { fillTemplate, typeForKind } from '../lib/theme.js';
import { CATEGORY_DEFS } from '../lib/categories.js';
import { findExisting, publishDraft, summaryTitle } from '../lib/publish.js';
import BatchImport from './BatchImport.jsx';
import PublishedLog from './PublishedLog.jsx';
import { addPublished } from '../lib/storage.js';
import { buildDraft, findByImdb, getDetails, parseImdbId } from '../lib/tmdb.js';
import TmdbImg from './TmdbImg.jsx';

const input = 'w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm placeholder:text-zinc-600 focus:border-rose-500/60 focus:outline-none disabled:opacity-40';
const label = 'mb-1.5 block text-xs font-medium text-zinc-400';
const smallBtn = 'flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-40';

const EMPTY_FORM = {
  kind: 'movie', title: '', excerpt: '', content: '', videos: [], featuredImage: null,
  categories: '', tags: '', meta: [], sendMeta: true, category: 'movie',
  data: {}, taxonomyValues: {}, seasons: [], tmdbId: null, seriesName: '',
  episode: { seriesId: '', season: '1', number: '1' },
};

const KINDS = [['movie', 'Película'], ['tv', 'Serie'], ['episode', 'Episodio suelto']];

const STATUSES = [
  ['draft', 'Borrador'],
  ['pending', 'Pendiente de revisión'],
  ['publish', 'Publicado'],
  ['private', 'Privado'],
];

const DEFAULT_TYPE = { slug: 'post', restBase: 'posts', name: 'Entradas', taxonomies: ['category', 'post_tag'] };

export default function WordPressPublisher({ settings, draft, onOpenSettings, notify }) {
  const { wp, theme } = settings;
  const [form, setForm] = useState(EMPTY_FORM);
  const [types, setTypes] = useState(theme.types.length ? theme.types : [DEFAULT_TYPE]);
  const [postType, setPostType] = useState(theme.enabled ? theme.movieType : 'posts');
  const [status, setStatus] = useState('draft');
  const [loadingTypes, setLoadingTypes] = useState(false);
  const [busy, setBusy] = useState('');
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const [newVideo, setNewVideo] = useState('');
  const [selectedSeasons, setSelectedSeasons] = useState([]);
  const [createEpisodes, setCreateEpisodes] = useState(false);
  const [uploadStills, setUploadStills] = useState(false);
  const [duplicate, setDuplicate] = useState(null);
  const [batchOpen, setBatchOpen] = useState(false);
  const [imdbQuery, setImdbQuery] = useState('');
  const [lookingUp, setLookingUp] = useState(false);
  const stopRef = useRef(false);
  const imageFileRef = useRef(null);
  const videoFileRef = useRef(null);

  const configured = Boolean(wp.siteUrl && wp.appPassword && (wp.authType === 'bearer' || wp.username));
  const type = types.find((t) => t.restBase === postType) || types[0];
  const supportsCategories = type.taxonomies.includes('category');
  const supportsTags = type.taxonomies.includes('post_tag');
  const canCreateEpisodes = form.kind === 'tv' && theme.enabled && form.seasons.length > 0
    && types.some((t) => t.restBase === theme.episodeType)
    && (theme.seasonMode !== 'post' || types.some((t) => t.restBase === theme.seasonType));
  const seasonsAsPosts = theme.seasonMode === 'post' && Boolean(theme.seasonType);

  useEffect(() => {
    if (theme.types.length) setTypes(theme.types);
  }, [theme.types]);

  // Rellena el formulario con una ficha de TMDB (búsqueda por IMDb o catálogo).
  const applyDraft = (d) => {
    const kind = d.kind || 'movie';
    setForm({ ...EMPTY_FORM, ...d, kind, sendMeta: true });
    setPostType(theme.enabled ? typeForKind(theme, kind) : 'posts');
    setSelectedSeasons((d.seasons || []).map((s) => s.number));
    setCreateEpisodes(Boolean(theme.enabled && theme.episodeType && d.seasons?.length));
    setResult(null);
    setProgress(null);
  };

  useEffect(() => {
    if (!draft) return;
    applyDraft(draft);
    checkDuplicate(draft, theme.enabled ? typeForKind(theme, draft.kind || 'movie') : 'posts');
  }, [draft]); // eslint-disable-line react-hooks/exhaustive-deps

  // ¿Esta ficha ya está en la web? Se avisa al cargarla (y otra vez al publicar).
  const checkDuplicate = async (d, restBase) => {
    setDuplicate(null);
    try {
      setDuplicate(await findExisting({ settings, restBase, form: { ...EMPTY_FORM, ...d } }));
    } catch { /* la comprobación nunca bloquea */ }
  };

  // Búsqueda por IMDb: la ficha se pide siempre en castellano (es-ES).
  const lookupImdb = async (e) => {
    e?.preventDefault();
    const imdbId = parseImdbId(imdbQuery);
    if (!imdbId) {
      notify({ type: 'warning', title: 'ID de IMDb no válido', message: 'Debe tener la forma tt1234567 (o pega el enlace de IMDb).' });
      return;
    }
    if (!settings.tmdb.token) {
      onOpenSettings('tmdb');
      return;
    }
    const opts = { ...settings.tmdb, language: 'es-ES' };
    setLookingUp(true);
    try {
      const found = await findByImdb(imdbId, opts);
      if (!found) {
        notify({ type: 'warning', title: `TMDB no tiene ningún título con el ID ${imdbId}` });
        return;
      }
      const details = await getDetails(found.id, found.type, opts);
      const loaded = buildDraft(details, found.type, opts);
      applyDraft(loaded);
      checkDuplicate(loaded, theme.enabled ? typeForKind(theme, found.type) : 'posts');
      if (found.episode) notify({ type: 'info', title: 'Ese ID es de un episodio', message: `Se ha cargado la serie completa (episodio ${found.episode.season}x${found.episode.number}).` });
    } catch (err) {
      notify({ type: 'error', title: 'Error al consultar TMDB', message: err.message });
    } finally {
      setLookingUp(false);
    }
  };

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const setEpisode = (patch) => setForm((f) => ({ ...f, episode: { ...f.episode, ...patch } }));

  const changeKind = (kind) => {
    set({ kind });
    if (theme.enabled) setPostType(typeForKind(theme, kind));
  };

  const loadTypes = async () => {
    setLoadingTypes(true);
    try {
      const list = await createClient(wp).postTypes();
      if (list.length) setTypes(list);
      notify({ type: 'info', title: `${list.length} tipos de contenido disponibles`, message: list.map((t) => t.name).join(', ') });
    } catch (e) {
      notify({ type: 'error', title: 'No se pudieron cargar los tipos de contenido', message: e.message });
    } finally {
      setLoadingTypes(false);
    }
  };

  const addVideoUrl = () => {
    const url = newVideo.trim();
    if (!url) return;
    if (!videoProvider(url, wp.siteUrl)) {
      notify({ type: 'warning', title: 'Vídeo no admitido', message: `Solo se pueden insertar vídeos de ${ALLOWED_VIDEO_HINT}.` });
      return;
    }
    set({ videos: [...form.videos, { url }] });
    setNewVideo('');
  };

  const addVideoFile = (file) => {
    if (!file) return;
    if (!file.type.startsWith('video/')) {
      notify({ type: 'warning', title: 'Archivo no válido', message: 'Elige un archivo de vídeo (.mp4, .webm…).' });
      return;
    }
    set({ videos: [...form.videos, { file, name: file.name }] });
  };

  const setImageFile = (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      notify({ type: 'warning', title: 'Archivo no válido', message: 'La imagen destacada debe ser una imagen.' });
      return;
    }
    set({ featuredImage: { file, preview: URL.createObjectURL(file), alt: form.title } });
  };

  // Resultado común a publicar y a actualizar: tarjeta, aviso e historial.
  const finish = (res, action) => {
    const title = res.post.title?.raw || form.title.trim();
    setResult({ id: res.post.id, link: res.post.link, edit: res.editUrl, status: res.post.status, title, episodes: res.episodes, summary: summaryTitle(res, STATUSES) });
    setDuplicate(action === 'create' ? { id: res.post.id, title, status: res.post.status, link: res.post.link, editUrl: res.editUrl } : null);
    addPublished({ site: wp.siteUrl, id: res.post.id, title, kind: form.kind, status: res.post.status, link: res.post.link, edit: res.editUrl, action });
    notify({
      type: res.warnings.length ? 'warning' : 'success',
      title: summaryTitle(res, STATUSES),
      message: [`ID ${res.post.id} · ${res.typeName}`, ...res.warnings].join(' · '),
      links: [{ href: res.post.link, label: 'Ver' }, { href: res.editUrl, label: 'Editar en WordPress' }],
    });
  };

  // Ficha que ya existe: se refrescan sus datos de TMDB y, en series, se añade lo que falte.
  const updateExisting = async () => {
    if (!duplicate) return;
    const addSeasons = form.kind === 'tv' && canCreateEpisodes && createEpisodes;
    if (!window.confirm(
      `Se actualizarán los datos de TMDB (campos y taxonomías) de “${duplicate.title}” (ID ${duplicate.id}). El título, el texto y la imagen no se tocan.`
      + (addSeasons ? '\n\nTambién se añadirán las temporadas y episodios marcados que todavía no tenga.' : '')
      + '\n\n¿Continuar?',
    )) return;
    stopRef.current = false;
    setResult(null);
    setProgress(null);
    try {
      const res = await publishDraft({
        settings, types, form, restBase: type.restBase, status,
        createEpisodes: addSeasons, selectedSeasons, uploadStills,
        onStep: setBusy, onProgress: setProgress, shouldStop: () => stopRef.current,
        existingId: duplicate.id,
      });
      finish(res, 'update');
    } catch (e) {
      notify({ type: 'error', title: 'No se pudo actualizar la ficha', message: e.status ? `${e.message} (HTTP ${e.status}${e.code ? ` · ${e.code}` : ''})` : e.message });
    } finally {
      setBusy('');
    }
  };

  const publish = async () => {
    if (!form.title.trim()) {
      notify({ type: 'warning', title: 'Falta el título' });
      return;
    }
    // Sin la estructura del theme todo acaba en "Entradas": se pide confirmación para que no pase sin querer.
    if (!theme.enabled && !window.confirm(
      `La estructura del theme no está activa en este navegador.\n\n“${form.title.trim()}” se publicará como entrada normal de WordPress (${type.name}), sin los tipos ni los campos de MovieEngine.\n\n¿Publicar igualmente?`,
    )) {
      onOpenSettings('theme');
      return;
    }
    let dup = null;
    try { dup = await findExisting({ settings, restBase: type.restBase, form }); } catch { /* no bloquea */ }
    if (dup && !window.confirm(`Ya existe “${dup.title}” en tu web (ID ${dup.id}, ${dup.status}).\n\n¿Crear otra igualmente?`)) {
      setDuplicate(dup);
      return;
    }
    stopRef.current = false;
    setResult(null);
    setProgress(null);
    try {
      const res = await publishDraft({
        settings, types, form, restBase: type.restBase, status,
        createEpisodes: canCreateEpisodes && createEpisodes,
        selectedSeasons, uploadStills,
        onStep: setBusy,
        onProgress: setProgress,
        shouldStop: () => stopRef.current,
      });
      finish(res, 'create');
    } catch (e) {
      notify({ type: 'error', title: 'WordPress rechazó la publicación', message: e.status ? `${e.message} (HTTP ${e.status}${e.code ? ` · ${e.code}` : ''})` : e.message });
    } finally {
      setBusy('');
    }
  };

  if (!configured) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-800 p-10 text-center">
        <p className="font-semibold">Conecta tu WordPress para publicar</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-zinc-400">Necesitas la URL del sitio, tu usuario y una contraseña de aplicación (Usuarios → Perfil → Contraseñas de aplicación).</p>
        <button onClick={() => onOpenSettings('wp')} className="mx-auto mt-5 flex items-center gap-2 rounded-xl bg-rose-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-rose-400">
          <Settings size={16} /> Configurar conexión
        </button>
      </div>
    );
  }

  const mappedCount = theme.enabled ? Object.values(form.kind === 'episode' ? theme.episodeFields : theme.fields).filter((k) => k?.trim()).length : 0;

  if (batchOpen) {
    return <BatchImport settings={settings} types={types} onClose={() => setBatchOpen(false)} onOpenSettings={onOpenSettings} notify={notify} />;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <section className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 sm:p-5">
        {!theme.enabled && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-amber-500/10 px-4 py-3 text-xs text-amber-200 ring-1 ring-amber-500/20">
            <span className="flex-1">
              La estructura del theme no está configurada en este navegador: se publicará como entrada normal de WordPress, sin los tipos ni los campos de MovieEngine.
            </span>
            <button onClick={() => onOpenSettings('theme')} className="rounded-lg border border-amber-500/40 px-3 py-1.5 font-medium hover:bg-amber-500/10">Configurar o importar</button>
          </div>
        )}

        {/* Búsqueda por IMDb: rellena todo el formulario con la ficha de TMDB en castellano */}
        <form onSubmit={lookupImdb} className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
          <label className={label} htmlFor="wp-imdb">Buscar por ID de IMDb</label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id="wp-imdb"
              className={`${input} font-mono`}
              value={imdbQuery}
              onChange={(e) => setImdbQuery(e.target.value)}
              placeholder="tt0133093  ·  o https://www.imdb.com/title/tt0133093/"
              autoComplete="off"
            />
            <button type="submit" disabled={lookingUp || !imdbQuery.trim() || Boolean(busy)} className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-rose-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-400 disabled:opacity-40">
              {lookingUp ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />} Buscar
            </button>
          </div>
          <p className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
            <span>Ficha en castellano (es-ES): detecta película o serie, categoría, temporadas y campos del theme.</span>
            <button type="button" onClick={() => setBatchOpen(true)} className="flex items-center gap-1 text-zinc-400 underline underline-offset-2 hover:text-zinc-200">
              <ListPlus size={13} /> Importar varios IDs
            </button>
          </p>
        </form>

        {duplicate && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-red-500/10 px-4 py-3 text-xs text-red-200 ring-1 ring-red-500/25">
            <AlertTriangle size={15} className="shrink-0 text-red-300" />
            <span className="min-w-0 flex-1">
              Ya existe en tu web: <strong>{duplicate.title}</strong> (ID {duplicate.id}, {STATUSES.find(([s]) => s === duplicate.status)?.[1] || duplicate.status}).
              {' '}Si publicas, quedará duplicada; mejor actualízala{form.kind === 'tv' ? ' (y añade las temporadas que falten)' : ''}.
            </span>
            <button onClick={updateExisting} disabled={Boolean(busy)} className="flex items-center gap-1.5 rounded-lg bg-red-500/20 px-3 py-1.5 text-xs font-medium text-red-100 hover:bg-red-500/30 disabled:opacity-40">
              <RefreshCw size={12} /> Actualizar esta ficha
            </button>
            <a href={duplicate.link} target="_blank" rel="noopener noreferrer" className={smallBtn}><ExternalLink size={12} /> Ver</a>
            <a href={duplicate.editUrl} target="_blank" rel="noopener noreferrer" className={smallBtn}><Pencil size={12} /> Editar</a>
          </div>
        )}

        {form.source === 'tmdb' && (
          <p className="rounded-xl bg-sky-500/10 px-4 py-2.5 text-xs text-sky-200 ring-1 ring-sky-500/20">
            Ficha de TMDB cargada{form.data?.imdb_id ? ` (${form.data.imdb_id})` : ''}. Revisa y ajusta lo que quieras antes de publicar.
          </p>
        )}

        <div className="flex flex-wrap gap-1 rounded-xl bg-zinc-950 p-1">
          {KINDS.map(([k, text]) => (
            <button key={k} onClick={() => changeKind(k)} className={`flex-1 rounded-lg px-3 py-1.5 text-sm ${form.kind === k ? 'bg-zinc-800 font-semibold text-white' : 'text-zinc-400 hover:text-zinc-200'}`}>
              {text}
            </button>
          ))}
        </div>

        <div>
          <label className={label} htmlFor="wp-title">{form.kind === 'episode' ? 'Título del episodio' : 'Título'}</label>
          <input id="wp-title" className={input} value={form.title} onChange={(e) => set({ title: e.target.value })} placeholder="Título de la película o serie" />
        </div>

        {form.kind === 'episode' && (
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={label}>ID de la serie en WP</label>
              <input className={input} inputMode="numeric" value={form.episode.seriesId} onChange={(e) => setEpisode({ seriesId: e.target.value.replace(/\D/g, '') })} placeholder="123" />
            </div>
            <div>
              <label className={label}>Temporada</label>
              <input className={input} type="number" min="0" value={form.episode.season} onChange={(e) => setEpisode({ season: e.target.value })} />
            </div>
            <div>
              <label className={label}>Episodio</label>
              <input className={input} type="number" min="0" value={form.episode.number} onChange={(e) => setEpisode({ number: e.target.value })} />
            </div>
          </div>
        )}

        <div>
          <label className={label} htmlFor="wp-excerpt">Sinopsis / extracto</label>
          <textarea id="wp-excerpt" rows={3} className={input} value={form.excerpt} onChange={(e) => set({ excerpt: e.target.value })} />
        </div>
        <div>
          <label className={label} htmlFor="wp-content">Contenido</label>
          <textarea
            id="wp-content"
            rows={10}
            className={`${input} font-mono text-xs leading-relaxed`}
            value={form.content}
            onChange={(e) => set({ content: e.target.value })}
            placeholder="Texto libre (cada párrafo separado por una línea en blanco) o HTML / bloques de Gutenberg."
          />
          <p className="mt-1.5 text-xs text-zinc-500">Los vídeos se insertan donde esté <code className="text-zinc-400">{VIDEO_SLOT}</code>, o al final si no está.</p>
        </div>

        {/* Vídeos */}
        <div>
          <span className={label}>Vídeos</span>
          {form.videos.length > 0 && (
            <ul className="mb-2 space-y-1.5">
              {form.videos.map((v, i) => (
                <li key={i} className="flex items-center gap-2 rounded-lg bg-zinc-950 px-3 py-2 text-xs">
                  <Video size={14} className="shrink-0 text-zinc-500" />
                  <span className="min-w-0 flex-1 truncate font-mono text-zinc-300">{v.url || `${v.name} (se subirá a tu biblioteca de medios)`}</span>
                  <button onClick={() => set({ videos: form.videos.filter((_, j) => j !== i) })} className="text-zinc-500 hover:text-zinc-200" title="Quitar"><X size={14} /></button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <input
              className={input}
              value={newVideo}
              onChange={(e) => setNewVideo(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addVideoUrl()}
              placeholder="https://www.youtube.com/watch?v=…"
            />
            <button onClick={addVideoUrl} className={smallBtn}><Plus size={14} /> Añadir</button>
            <button onClick={() => videoFileRef.current?.click()} className={smallBtn} title="Subir un vídeo propio"><Upload size={14} /> Archivo</button>
            <input ref={videoFileRef} type="file" accept="video/*" className="hidden" onChange={(e) => { addVideoFile(e.target.files?.[0]); e.target.value = ''; }} />
          </div>
          <p className="mt-1.5 text-xs text-zinc-500">Admitidos: {ALLOWED_VIDEO_HINT}. El primero también va al campo “Vídeo propio” del theme.</p>
        </div>

        {/* Temporadas y episodios (serie desde TMDB) */}
        {form.kind === 'tv' && form.seasons.length > 0 && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-semibold">Temporadas y episodios</span>
              {!canCreateEpisodes && (
                <button onClick={() => onOpenSettings('theme')} className="text-xs text-zinc-400 underline underline-offset-2 hover:text-zinc-200">Elegir tipo de episodios en Ajustes → Theme</button>
              )}
            </div>
            <label className={`mb-3 flex items-center gap-2 text-sm ${canCreateEpisodes ? '' : 'opacity-40'}`}>
              <input type="checkbox" className="accent-rose-500" disabled={!canCreateEpisodes} checked={createEpisodes && canCreateEpisodes} onChange={(e) => setCreateEpisodes(e.target.checked)} />
              {seasonsAsPosts ? 'Crear las temporadas y sus episodios' : 'Crear un episodio por cada episodio de TMDB'}, en orden
            </label>
            <div className={`grid gap-1.5 sm:grid-cols-2 ${createEpisodes && canCreateEpisodes ? '' : 'pointer-events-none opacity-40'}`}>
              {form.seasons.map((s) => (
                <label key={s.number} className="flex items-center gap-2 rounded-lg bg-zinc-900 px-3 py-2 text-xs">
                  <input
                    type="checkbox"
                    className="accent-rose-500"
                    checked={selectedSeasons.includes(s.number)}
                    onChange={(e) => setSelectedSeasons((sel) => (e.target.checked ? [...sel, s.number] : sel.filter((n) => n !== s.number)))}
                  />
                  <span className="flex-1 text-zinc-300">{s.name}</span>
                  <span className="text-zinc-500">{s.episodes} ep.</span>
                </label>
              ))}
            </div>
            {createEpisodes && canCreateEpisodes && (
              <>
                <label className="mt-3 flex items-center gap-2 text-xs text-zinc-400">
                  <input type="checkbox" className="accent-rose-500" checked={uploadStills} onChange={(e) => setUploadStills(e.target.checked)} />
                  Subir la imagen de cada episodio como imagen destacada (más lento)
                </label>
                <p className="mt-2 text-xs text-zinc-500">
                  Se crearán {seasonsAsPosts ? `${selectedSeasons.length} temporadas (“${fillTemplate(theme.seasonTitleTemplate, { serie: form.seriesName, titulo: form.seasons[0]?.name, temporada: 1, anio: form.seasons[0]?.airDate?.slice(0, 4) })}”) y ` : ''}
                  {form.seasons.filter((s) => selectedSeasons.includes(s.number)).reduce((n, s) => n + s.episodes, 0)} episodios con el título “
                  {fillTemplate(theme.episodeTitleTemplate, { serie: form.seriesName, titulo: 'Piloto', temporada: 1, episodio: 1 })}”
                  {theme.seasonMode === 'taxonomy' && theme.seasonTaxonomy ? `, cada uno en su término “${fillTemplate(theme.seasonTermTemplate, { serie: form.seriesName, temporada: 1 })}”` : ''}.
                </p>
              </>
            )}
          </div>
        )}

        {/* Campos personalizados */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs font-medium text-zinc-400">
              <input type="checkbox" className="accent-rose-500" checked={form.sendMeta} onChange={(e) => set({ sendMeta: e.target.checked })} />
              Enviar campos personalizados (meta)
            </label>
            <button onClick={() => set({ meta: [...form.meta, { key: '', value: '' }] })} className="text-xs text-zinc-400 hover:text-zinc-200">+ Añadir campo</button>
          </div>
          <p className="mb-2 flex items-center gap-1.5 text-xs text-zinc-500">
            <LayoutTemplate size={13} />
            {theme.enabled
              ? `${mappedCount} campos del theme mapeados para ${form.kind === 'episode' ? 'episodios' : 'esta ficha'}.`
              : 'Sin mapeo de theme: se envían campos genéricos (tmdb_id, imdb_id…).'}
            <button onClick={() => onOpenSettings('theme')} className="underline underline-offset-2 hover:text-zinc-300">Configurar</button>
          </p>
          {form.meta.length > 0 && (
            <div className="space-y-1.5">
              {form.meta.map((m, i) => (
                <div key={i} className="flex gap-2">
                  <input className={`${input} font-mono text-xs`} placeholder="clave" value={m.key} onChange={(e) => set({ meta: form.meta.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)) })} />
                  <input className={`${input} text-xs`} placeholder="valor" value={m.value} onChange={(e) => set({ meta: form.meta.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })} />
                  <button onClick={() => set({ meta: form.meta.filter((_, j) => j !== i) })} className="px-1 text-zinc-500 hover:text-zinc-200" title="Quitar"><X size={14} /></button>
                </div>
              ))}
            </div>
          )}
          <p className="mt-1.5 text-xs text-zinc-500">
            WordPress solo guarda los campos registrados para la API REST; el plugin auxiliar de Ajustes → Theme los registra por ti.
          </p>
        </div>
      </section>

      {/* Columna lateral */}
      <aside className="space-y-4">
        <div className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
          <div className="flex items-center justify-between text-xs">
            <span className="truncate text-zinc-400" title={wp.siteUrl}>{wp.siteUrl.replace(/^https?:\/\//, '')}</span>
            <button onClick={() => onOpenSettings('wp')} className="text-zinc-500 hover:text-zinc-200" title="Ajustes"><Settings size={14} /></button>
          </div>
          {wp.connectedAs && <p className="text-xs text-emerald-400">● {wp.connectedAs}</p>}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-xs font-medium text-zinc-400" htmlFor="wp-type">Tipo de contenido</label>
              <button onClick={loadTypes} disabled={loadingTypes} className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-200" title="Cargar tipos personalizados (CPT) del sitio">
                <RefreshCw size={12} className={loadingTypes ? 'animate-spin' : ''} /> Cargar
              </button>
            </div>
            <select id="wp-type" className={input} value={postType} onChange={(e) => setPostType(e.target.value)}>
              {types.map((t) => <option key={t.restBase} value={t.restBase}>{t.name} ({t.slug})</option>)}
            </select>
          </div>
          <div>
            <label className={label} htmlFor="wp-category">Categoría</label>
            <select id="wp-category" className={input} value={form.category} onChange={(e) => set({ category: e.target.value })}>
              {CATEGORY_DEFS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
            </select>
            {form.categoryReason && <p className="mt-1 text-xs text-zinc-500">Detectada: {form.categoryReason}</p>}
          </div>
          <div>
            <label className={label} htmlFor="wp-status">Estado</label>
            <select id="wp-status" className={input} value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUSES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className={label} htmlFor="wp-cats">Categorías</label>
            <input id="wp-cats" className={input} disabled={!supportsCategories} value={form.categories} onChange={(e) => set({ categories: e.target.value })} placeholder={supportsCategories ? 'Películas, Estrenos' : 'No disponible en este tipo'} />
          </div>
          <div>
            <label className={label} htmlFor="wp-tags">Etiquetas</label>
            <input id="wp-tags" className={input} disabled={!supportsTags} value={form.tags} onChange={(e) => set({ tags: e.target.value })} placeholder={supportsTags ? 'Acción, Ciencia ficción' : 'No disponible en este tipo'} />
          </div>
        </div>

        <div className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
          <span className={label}>Imagen destacada</span>
          {form.featuredImage ? (
            <div className="relative">
              <TmdbImg src={form.featuredImage.preview || form.featuredImage.url} alt="" className="max-h-64 w-full rounded-xl object-contain" fallbackClassName="h-40 w-full rounded-xl" />
              <button onClick={() => set({ featuredImage: null })} className="absolute right-2 top-2 rounded-lg bg-black/70 p-1.5 text-zinc-300 hover:text-white" title="Quitar imagen"><X size={14} /></button>
            </div>
          ) : (
            <button onClick={() => imageFileRef.current?.click()} className="grid h-32 w-full place-items-center rounded-xl border border-dashed border-zinc-700 text-xs text-zinc-500 hover:border-zinc-500 hover:text-zinc-300">
              <span className="flex flex-col items-center gap-2"><ImageIcon size={20} /> Elegir imagen</span>
            </button>
          )}
          <input ref={imageFileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { setImageFile(e.target.files?.[0]); e.target.value = ''; }} />
          <input
            className={`${input} text-xs`}
            placeholder="…o pega la URL de una imagen"
            value={form.featuredImage?.url || ''}
            onChange={(e) => set({ featuredImage: e.target.value ? { url: e.target.value, alt: form.title } : null })}
          />
        </div>

        <button
          onClick={publish}
          disabled={Boolean(busy)}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-rose-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-rose-500/20 hover:bg-rose-400 disabled:opacity-60"
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          {busy || 'Publicar en WordPress'}
        </button>
        {progress && (
          <div className="space-y-2">
            <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
              <div className="h-full bg-rose-500 transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
            </div>
            <div className="flex items-center justify-between text-xs text-zinc-500">
              <span>Episodios: {progress.done} / {progress.total}</span>
              {busy && <button onClick={() => { stopRef.current = true; }} className="flex items-center gap-1 text-zinc-400 hover:text-white"><Square size={11} /> Detener</button>}
            </div>
          </div>
        )}
        <button onClick={() => { setForm(EMPTY_FORM); setResult(null); setProgress(null); }} className="w-full text-xs text-zinc-500 hover:text-zinc-300">Vaciar formulario</button>

        {result && (
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm">
            <p className="flex items-center gap-2 font-semibold text-emerald-200"><CheckCircle2 size={16} /> {result.title}</p>
            <p className="mt-1 text-xs text-emerald-300/80">
              ID {result.id} · estado: {STATUSES.find(([s]) => s === result.status)?.[1] || result.status}
            </p>
            <p className="mt-1 text-xs text-emerald-200/90">
              {result.summary}{result.episodes?.failed.length ? ` · ${result.episodes.failed.length} con error` : ''}
            </p>
            <div className="mt-3 flex gap-2">
              <a href={result.link} target="_blank" rel="noopener noreferrer" className={smallBtn}><ExternalLink size={13} /> Ver</a>
              <a href={result.edit} target="_blank" rel="noopener noreferrer" className={smallBtn}><Pencil size={13} /> Editar</a>
            </div>
          </div>
        )}

        <PublishedLog site={wp.siteUrl} />
      </aside>
    </div>
  );
}
