// Publicación de una ficha en WordPress: película, serie (con temporadas y episodios) o episodio suelto.
// La usan tanto la pantalla de importación por IMDb como el publicador manual.
import { createClient } from './wordpress.js';
import { normalizeVideoUrl, textToBlocks, VIDEO_SLOT, videoBlock, videoProvider } from './blocks.js';
import { DEFAULT_CATEGORY_MAP } from './categories.js';
import { episodeCode, fillTemplate, GENERIC_FIELDS, mapMeta } from './theme.js';
import { episodeContent, episodeData, getSeason, imageCandidates, seasonContent, seasonData } from './tmdb.js';

const splitNames = (s) => (s || '').split(',').map((x) => x.trim()).filter(Boolean);
export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * @param {object} p
 * @param {object} p.settings    Ajustes completos (wp, tmdb, theme).
 * @param {Array}  p.types       Tipos de contenido del sitio (con sus taxonomías).
 * @param {object} p.form        Ficha: title, excerpt, content, videos, featuredImage, categories, tags,
 *                               meta, sendMeta, data, taxonomyValues, seasons, tmdbId, seriesName, kind, category, episode.
 * @param {string} p.restBase    Tipo de contenido donde se crea la entrada principal.
 * @param {string} p.status      draft | pending | publish | private
 * @param {boolean} p.createEpisodes  Serie: crear temporadas/episodios.
 * @param {number[]} p.selectedSeasons
 * @param {boolean} p.uploadStills    Subir la imagen de cada temporada/episodio.
 * @param {(text: string) => void} p.onStep
 * @param {(progress: {done: number, total: number}) => void} p.onProgress
 * @param {() => boolean} p.shouldStop
 * @param {number|null} p.existingId  Si se indica, no se crea una entrada nueva: se actualizan los
 *                                    campos y taxonomías de esa (sin tocar título, contenido ni imagen)
 *                                    y, en las series, solo se añaden las temporadas/episodios que falten.
 */
export async function publishDraft({
  settings, types, form, restBase, status,
  createEpisodes = false, selectedSeasons = [], uploadStills = false,
  onStep = () => {}, onProgress = () => {}, shouldStop = () => false,
  existingId = null,
}) {
  const { wp, theme } = settings;
  const client = createClient(wp);
  const typeByRest = (rb) => types.find((t) => t.restBase === rb);
  const type = typeByRest(restBase) || { restBase, name: restBase, taxonomies: [] };
  const supports = (forType, restBaseOfTax) => {
    const slug = theme.taxonomyList.find((t) => t.restBase === restBaseOfTax)?.slug
      || ({ categories: 'category', tags: 'post_tag' })[restBaseOfTax];
    return Boolean(forType?.taxonomies.includes(slug));
  };
  const warnings = [];

  // Los términos ya resueltos se reutilizan: una serie larga repite año, reparto… en cientos de episodios.
  const termCache = new Map();
  const cachedTerms = async (taxonomy, names) => {
    const keyOf = (n) => `${taxonomy}:${n.toLowerCase()}`;
    const missing = [...new Set(names)].filter((n) => !termCache.has(keyOf(n)));
    if (missing.length) {
      const ids = await client.resolveTerms(taxonomy, missing);
      missing.forEach((n, i) => termCache.set(keyOf(n), ids[i]));
    }
    return names.map((n) => termCache.get(keyOf(n)));
  };
  const addTerms = (target, taxonomy, ids) => {
    target[taxonomy] = [...new Set([...(target[taxonomy] || []), ...ids])];
  };

  // Términos de las taxonomías del theme (géneros, año, reparto…) → { rest_base: [ids] }.
  const themeTerms = async (values, forType) => {
    const out = {};
    if (!theme.enabled || !forType) return out;
    for (const [key, taxonomy] of Object.entries(theme.taxonomies)) {
      const names = (values[key] || []).map(String).filter(Boolean);
      if (taxonomy && names.length && supports(forType, taxonomy)) addTerms(out, taxonomy, await cachedTerms(taxonomy, names));
    }
    return out;
  };

  const seasonTerm = async (season, seriesName) => {
    if (theme.seasonMode !== 'taxonomy' || !theme.seasonTaxonomy) return {};
    const name = fillTemplate(theme.seasonTermTemplate, { serie: seriesName, temporada: season });
    return { [theme.seasonTaxonomy]: await cachedTerms(theme.seasonTaxonomy, [name]) };
  };

  // Descarga la imagen (probando los dominios alternativos de TMDB) y la sube a la biblioteca de medios.
  const uploadImageFromUrl = async (url, name, alt) => {
    let blob;
    let lastError;
    for (const candidate of imageCandidates(url)) {
      try {
        const res = await fetch(candidate);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        blob = await res.blob();
        break;
      } catch (e) {
        lastError = e;
      }
    }
    if (!blob) throw lastError || new Error('No se pudo descargar la imagen');
    const media = await client.uploadMedia(blob, `${name}-${new URL(url).pathname.split('/').pop() || 'imagen'}`, { alt, title: name });
    return media.id;
  };

  const isEpisode = form.kind === 'episode';

  // 1) Imagen destacada: archivo local o URL (p. ej. el póster de TMDB).
  // El póster de TMDB puede omitirse: el theme lo muestra desde su campo de URL.
  const skipPoster = Boolean(existingId) || (theme.enabled && theme.featuredFromPoster === false && form.source === 'tmdb' && !form.featuredImage?.file);
  let featured_media;
  if (form.featuredImage && !skipPoster) {
    onStep('Subiendo imagen destacada…');
    try {
      if (form.featuredImage.file) {
        const media = await client.uploadMedia(form.featuredImage.file, `${form.title}-${form.featuredImage.file.name}`, { alt: form.featuredImage.alt || form.title, title: form.title });
        featured_media = media.id;
      } else {
        featured_media = await uploadImageFromUrl(form.featuredImage.url, form.title, form.featuredImage.alt || form.title);
      }
    } catch (e) {
      if (e.status || e.code) throw e; // error de WordPress
      warnings.push('No se pudo descargar la imagen destacada desde su URL; la entrada se creó sin ella.');
    }
  }

  // 2) Vídeos: plataformas oficiales o archivos propios subidos a la biblioteca de medios.
  const videoBlocks = [];
  const videoUrls = [];
  for (const v of existingId ? [] : form.videos || []) {
    if (v.file) {
      onStep(`Subiendo vídeo ${v.name}…`);
      const media = await client.uploadMedia(v.file, v.name, { title: form.title });
      videoBlocks.push(videoBlock(media.source_url, 'self', media.id));
      videoUrls.push(media.source_url);
    } else {
      const provider = videoProvider(v.url, wp.siteUrl);
      if (!provider) throw new Error(`Vídeo no admitido: ${v.url}`);
      const url = provider === 'self' ? v.url : normalizeVideoUrl(v.url);
      videoBlocks.push(videoBlock(url, provider));
      videoUrls.push(url);
    }
  }

  // 3) Categorías, etiquetas, taxonomías del theme y categoría automática.
  onStep('Preparando categorías y taxonomías…');
  const terms = {};
  if (supports(type, 'categories') && form.categories?.trim()) addTerms(terms, 'categories', await client.resolveTerms('categories', splitNames(form.categories)));
  if (supports(type, 'tags') && form.tags?.trim()) addTerms(terms, 'tags', await client.resolveTerms('tags', splitNames(form.tags)));
  if (!isEpisode) {
    for (const [tax, ids] of Object.entries(await themeTerms(form.taxonomyValues || {}, type))) addTerms(terms, tax, ids);
  }
  const category = form.category && { ...DEFAULT_CATEGORY_MAP[form.category], ...(theme.categoryMap || {})[form.category] };
  if (category?.taxonomy && category.term?.trim()) {
    if (supports(type, category.taxonomy)) addTerms(terms, category.taxonomy, await cachedTerms(category.taxonomy, [category.term.trim()]));
    else warnings.push(`La categoría "${category.term}" no se asignó: ${type.name} no usa esa taxonomía.`);
  }

  // 4) Campos personalizados: mapeo del theme + campos añadidos a mano.
  const data = { ...form.data };
  if (videoUrls[0]) data.video_url = videoUrls[0];
  if (data.trailer_url && !videoProvider(data.trailer_url, wp.siteUrl)) delete data.trailer_url;
  if (isEpisode) {
    Object.assign(data, {
      series_id: form.episode.seriesId,
      season_number: form.episode.season,
      episode_number: form.episode.number,
      episode_code: episodeCode(form.episode.season, form.episode.number),
      episode_title: form.title,
    });
  }
  const mapping = theme.enabled ? (isEpisode ? theme.episodeFields : theme.fields) : GENERIC_FIELDS;
  const manualMeta = Object.fromEntries((form.meta || []).filter((m) => m.key.trim()).map((m) => [m.key.trim(), m.value]));
  const meta = form.sendMeta === false ? {} : { ...mapMeta(data, mapping), ...manualMeta };
  if (isEpisode && form.episode.season) Object.assign(terms, await seasonTerm(form.episode.season, form.seriesName || ''));

  // 5) Contenido final con los vídeos en su sitio.
  let content = textToBlocks(form.content);
  const videosHtml = videoBlocks.join('\n\n');
  content = content.includes(VIDEO_SLOT) ? content.replace(VIDEO_SLOT, videosHtml) : [content, videosHtml].filter(Boolean).join('\n\n');

  let post;
  if (existingId) {
    // Actualización: solo los datos que vienen de TMDB; el título, el texto y la imagen se respetan.
    onStep('Actualizando la ficha existente…');
    post = await client.updatePost(type.restBase, existingId, { ...terms, ...(Object.keys(meta).length ? { meta } : {}) });
  } else {
  onStep('Creando la entrada en WordPress…');
  post = await client.createPost(type.restBase, {
    title: form.title.trim(),
    content,
    excerpt: form.excerpt || '',
    status,
    ...(featured_media ? { featured_media } : {}),
    ...terms,
    ...(isEpisode && theme.enabled && theme.useParent && form.episode.seriesId ? { parent: Number(form.episode.seriesId) } : {}),
    ...(isEpisode ? { menu_order: Number(form.episode.number) || 0 } : {}),
    ...(Object.keys(meta).length ? { meta } : {}),
  });
  }

  // 6) Serie: temporadas y episodios en orden.
  let episodes = null;
  if (createEpisodes && form.kind === 'tv' && selectedSeasons.length && theme.enabled) {
    episodes = await createSeasonsAndEpisodes();
    if (episodes.failed.length) warnings.push(`${episodes.failed.length} con error: ${episodes.failed.slice(0, 2).join(' · ')}`);
    if (episodes.stopped) warnings.push('La creación de episodios se detuvo antes de terminar.');
  }

  return { post, editUrl: client.editUrl(post.id), typeName: type.name, episodes, warnings, updated: Boolean(existingId) };

  async function createSeasonsAndEpisodes() {
    const episodeType = typeByRest(theme.episodeType);
    const seasonType = theme.seasonMode === 'post' ? typeByRest(theme.seasonType) : null;
    if (!episodeType) throw new Error('Elige el tipo de los episodios en Ajustes → Theme.');
    const seasons = form.seasons.filter((s) => selectedSeasons.includes(s.number)).sort((a, b) => a.number - b.number);
    const total = seasons.reduce((n, s) => n + s.episodes, 0) + (seasonType ? seasons.length : 0);
    const created = [];
    const createdSeasons = [];
    const failed = [];
    let skipped = 0;
    let done = 0;
    let stopped = false;
    const tick = () => onProgress({ done: ++done, total });
    onProgress({ done, total });
    const existing = existingId ? await loadExistingStructure(seasonType, episodeType) : null;

    for (const season of seasons) {
      if (shouldStop()) { stopped = true; break; }
      onStep(`Cargando temporada ${season.number} de TMDB…`);
      const detail = await getSeason(form.tmdbId, season.number, settings.tmdb);
      const list = [...(detail.episodes || [])].sort((a, b) => a.episode_number - b.episode_number);
      const sTerms = await seasonTerm(season.number, form.seriesName);

      // Temporada como entrada propia (MovieEngine: Serie → Temporadas → Episodios).
      let seasonPost = existing?.seasons.has(season.number) ? { id: existing.seasons.get(season.number) } : null;
      const existingEpisodes = existing?.episodes.get(season.number) || new Set();
      if (seasonPost) {
        skipped++;
        tick();
      } else if (seasonType) {
        onStep(`Creando temporada ${season.number}…`);
        const sData = { ...seasonData(form.tmdbId, season, detail), series_id: post.id };
        try {
          let media;
          if (uploadStills && sData.poster_url) {
            try { media = await uploadImageFromUrl(sData.poster_url, `${form.seriesName}-T${season.number}`, `${form.seriesName} – ${sData.season_title}`); } catch { /* sin imagen */ }
          }
          seasonPost = await client.createPost(seasonType.restBase, {
            title: fillTemplate(theme.seasonTitleTemplate, { serie: form.seriesName, titulo: sData.season_title, temporada: season.number, anio: sData.year }),
            content: seasonContent(season, detail),
            excerpt: detail.overview || season.overview || '',
            status,
            menu_order: season.number,
            ...(theme.useParent && seasonType.hierarchical ? { parent: post.id } : {}),
            ...(media ? { featured_media: media } : {}),
            ...(await themeTerms({ year: sData.year ? [sData.year] : [] }, seasonType)),
            meta: mapMeta(sData, theme.seasonFields),
          });
          createdSeasons.push({ number: season.number, id: seasonPost.id });
        } catch (e) {
          failed.push(`Temporada ${season.number}: ${e.message}`);
          if ([401, 403, 404].includes(e.status)) { stopped = true; break; }
        }
        tick();
      }

      for (const ep of list) {
        if (shouldStop()) { stopped = true; break; }
        const code = episodeCode(season.number, ep.episode_number);
        if (existingEpisodes.has(ep.episode_number)) {
          skipped++;
          tick();
          continue;
        }
        onStep(`Creando ${code}…`);
        try {
          const eData = { ...episodeData(form.tmdbId, season.number, ep), series_id: post.id, season_id: seasonPost?.id || '', episode_code: code };
          let media;
          if (uploadStills && eData.still_url) {
            try { media = await uploadImageFromUrl(eData.still_url, `${form.seriesName}-${code}`, `${form.seriesName} ${code}`); } catch { /* sin imagen */ }
          }
          const epPost = await client.createPost(episodeType.restBase, {
            title: fillTemplate(theme.episodeTitleTemplate, { serie: form.seriesName, titulo: ep.name, temporada: season.number, episodio: ep.episode_number, anio: (ep.air_date || '').slice(0, 4) }),
            content: episodeContent(ep),
            excerpt: ep.overview || '',
            status,
            menu_order: ep.episode_number,
            ...(theme.useParent && episodeType.hierarchical ? { parent: seasonPost?.id || post.id } : {}),
            ...(media ? { featured_media: media } : {}),
            ...sTerms,
            ...(await themeTerms({ year: ep.air_date ? [ep.air_date.slice(0, 4)] : [] }, episodeType)),
            meta: mapMeta(eData, theme.episodeFields),
          });
          created.push({ code, id: epPost.id });
        } catch (e) {
          failed.push(`${code}: ${e.message}`);
          // Sin permisos o tipo inexistente: no tiene sentido seguir intentándolo.
          if ([401, 403, 404].includes(e.status)) { stopped = true; break; }
        }
        tick();
      }
      if (stopped) break;
    }
    return { created, createdSeasons, failed, stopped, skipped };
  }

  // Temporadas y episodios que la serie ya tiene en WordPress, según los campos que los enlazan:
  // { seasons: Map(nº temporada → ID), episodes: Map(nº temporada → Set(nº episodio)) }.
  async function loadExistingStructure(seasonType, episodeType) {
    const sf = theme.seasonFields || {};
    const ef = theme.episodeFields || {};
    const seasons = new Map();
    const episodes = new Map();
    const addEpisode = (season, number) => {
      if (!Number.isFinite(season) || !Number.isFinite(number)) return;
      if (!episodes.has(season)) episodes.set(season, new Set());
      episodes.get(season).add(number);
    };

    if (seasonType && sf.series_id && sf.season_number) {
      onStep('Leyendo las temporadas que ya tiene la serie…');
      for (const p of await client.listAll(seasonType.restBase)) {
        if (String(p.meta?.[sf.series_id]) === String(post.id)) seasons.set(Number(p.meta[sf.season_number]), p.id);
      }
    }
    if (ef.episode_number && (ef.season_id || ef.series_id)) {
      onStep('Leyendo los episodios que ya tiene la serie…');
      const seasonOfId = new Map([...seasons].map(([n, id]) => [String(id), n]));
      for (const p of await client.listAll(episodeType.restBase)) {
        const m = p.meta || {};
        const bySeason = ef.season_id ? seasonOfId.get(String(m[ef.season_id])) : undefined;
        const bySeries = ef.series_id && String(m[ef.series_id]) === String(post.id) ? Number(m[ef.season_number]) : undefined;
        addEpisode(bySeason ?? bySeries, Number(m[ef.episode_number]));
      }
    }
    return { seasons, episodes };
  }
}

const normalizeTitle = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

/**
 * Busca en WordPress una entrada que ya sea esta ficha: mismo ID de IMDb en el campo del theme
 * o mismo título. Devuelve { id, title, status, link, editUrl } o null.
 */
export async function findExisting({ settings, restBase, form }) {
  const { wp, theme } = settings;
  const client = createClient(wp);
  const imdbKey = (theme.enabled ? theme.fields?.imdb_id : GENERIC_FIELDS.imdb_id) || '';
  const imdb = form.data?.imdb_id || '';
  const name = form.seriesName || form.title.replace(/\s*\(\d{4}\)\s*$/, '');
  const list = await client.searchPosts(restBase, name);
  const match = list.find((p) => (imdb && imdbKey && p.meta?.[imdbKey] === imdb) || normalizeTitle(p.title?.raw) === normalizeTitle(form.title));
  return match ? { id: match.id, title: match.title?.raw || match.title?.rendered, status: match.status, link: match.link, editUrl: client.editUrl(match.id) } : null;
}

// Texto del aviso final, común a las dos pantallas.
export function summaryTitle(result, statuses) {
  const { post, episodes, updated } = result;
  const base = updated
    ? 'Ficha actualizada'
    : post.status === 'publish'
      ? 'Entrada publicada'
      : `Entrada creada (${statuses.find(([s]) => s === post.status)?.[1] || post.status})`;
  if (!episodes) return base;
  return `${base}${episodes.createdSeasons.length ? ` + ${plural(episodes.createdSeasons.length, 'temporada')}` : ''} + ${plural(episodes.created.length, 'episodio')}${updated ? ' nuevos' : ''}`
    + (episodes.skipped ? ` (${episodes.skipped} ya estaban)` : '');
}
