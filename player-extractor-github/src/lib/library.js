// Revisión de las fichas que ya hay en la web y su actualización desde TMDB.
import { createClient } from './wordpress.js';
import { buildDraft, findByImdb, getDetails } from './tmdb.js';
import { publishDraft } from './publish.js';

// Datos que debería tener toda ficha importada de TMDB (clave neutra → nombre visible).
export const CHECKS = [
  ['imdb_id', 'IMDb'],
  ['tmdb_id', 'TMDB'],
  ['poster_url', 'Póster'],
  ['backdrop_url', 'Fondo'],
  ['release_date', 'Estreno'],
  ['rating', 'Puntuación'],
  ['trailer_url', 'Tráiler'],
];

const decode = (s) => String(s || '').replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(Number(n))).replace(/&amp;/g, '&').replace(/&quot;/g, '"');

// Qué le falta a una entrada de WordPress (tal como la devuelve la API con context=edit).
export function missingFor(p, theme) {
  const meta = p.meta || {};
  const missing = CHECKS.filter(([k]) => theme.fields[k] && !meta[theme.fields[k]]).map(([, label]) => label);
  const genreTax = theme.taxonomies?.genres;
  if (genreTax && Array.isArray(p[genreTax]) && !p[genreTax].length) missing.push('Géneros');
  return missing;
}

// Películas y series de la web con lo que les falta, según el mapeo del theme.
export async function loadLibrary(settings) {
  const { theme } = settings;
  const client = createClient(settings.wp);
  const kinds = [['movie', theme.movieType], ['tv', theme.seriesType]].filter(([, rb], i, arr) => rb && arr.findIndex(([, r]) => r === rb) === i);
  const items = [];
  for (const [kind, restBase] of kinds) {
    for (const p of await client.listAll(restBase)) {
      const meta = p.meta || {};
      const value = (k) => (theme.fields[k] ? meta[theme.fields[k]] : '');
      const missing = missingFor(p, theme);
      items.push({
        id: p.id,
        kind,
        restBase,
        title: decode(p.title?.raw || p.title?.rendered),
        status: p.status,
        link: p.link,
        edit: client.editUrl(p.id),
        modified: p.modified,
        imdb: value('imdb_id'),
        tmdb: value('tmdb_id'),
        poster: value('poster_url'),
        missing,
      });
    }
  }
  return items.sort((a, b) => b.modified.localeCompare(a.modified));
}

/**
 * Refresca una ficha existente con los datos de TMDB en castellano. En las series puede
 * añadir también las temporadas y episodios que falten (con el mismo estado que la serie).
 */
export async function refreshItem(settings, types, item, { addSeasons = false, onStep, onProgress } = {}) {
  const opts = { ...settings.tmdb, language: 'es-ES' };
  let id = item.tmdb;
  if (!id && item.imdb) id = (await findByImdb(item.imdb, opts))?.id;
  if (!id) throw new Error('La ficha no tiene ID de TMDB ni de IMDb: búscala por IMDb en el Publicador.');
  const details = await getDetails(id, item.kind, opts);
  const draft = buildDraft(details, item.kind, opts);
  return publishDraft({
    settings, types, restBase: item.restBase, status: item.status,
    form: { ...draft, sendMeta: true },
    existingId: item.id,
    createEpisodes: item.kind === 'tv' && addSeasons,
    selectedSeasons: draft.seasons.map((s) => s.number),
    onStep, onProgress,
  });
}
