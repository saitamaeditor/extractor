// Cliente de The Movie Database (TMDB) y generador de fichas para WordPress.
import { escapeHtml, heading, list, paragraph, VIDEO_SLOT } from './blocks.js';
import { detectCategory } from './categories.js';

const API = 'https://api.themoviedb.org/3';

// image.tmdb.org es el dominio oficial de imágenes; media.themoviedb.org sirve los mismos archivos
// y se usa como alternativa cuando una red o una extensión bloquea el primero.
const IMAGE_HOSTS = ['https://image.tmdb.org', 'https://media.themoviedb.org'];

export const tmdbImage = (path, size = 'w500') => (path ? `${IMAGE_HOSTS[0]}/t/p/${size}${path}` : '');

// Misma imagen en cada dominio de TMDB (las URL que no son de TMDB se devuelven tal cual).
export function imageCandidates(url) {
  if (!url) return [];
  const host = IMAGE_HOSTS.find((h) => url.startsWith(h + '/'));
  if (!host) return [url];
  const rest = url.slice(host.length);
  return [url, ...IMAGE_HOSTS.filter((h) => h !== host).map((h) => h + rest)];
}

// Acepta la "API Key" (v3) o el "Token de acceso de lectura" (v4, empieza por eyJ).
function authFor(token) {
  const t = (token || '').trim();
  return t.startsWith('eyJ') ? { headers: { Authorization: `Bearer ${t}` }, params: {} } : { headers: {}, params: { api_key: t } };
}

async function tmdb(path, token, params = {}) {
  if (!token?.trim()) throw new Error('Falta la clave de la API de TMDB (Ajustes → TMDB).');
  const auth = authFor(token);
  let res;
  try {
    res = await fetch(`${API}${path}?${new URLSearchParams({ ...auth.params, ...params })}`, {
      headers: { accept: 'application/json', ...auth.headers },
    });
  } catch {
    throw new Error('No se pudo conectar con TMDB.');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(res.status === 401 ? 'La clave de TMDB no es válida.' : data?.status_message || `Error de TMDB (${res.status}).`);
  return data;
}

export async function searchTitles(query, { token, language, type = 'multi' }) {
  const data = await tmdb(`/search/${type}`, token, { query, language, include_adult: 'false' });
  return data.results
    .filter((r) => (r.media_type ? ['movie', 'tv'].includes(r.media_type) : true))
    .map((r) => ({
      id: r.id,
      type: r.media_type || type,
      title: r.title || r.name,
      original: r.original_title || r.original_name,
      year: (r.release_date || r.first_air_date || '').slice(0, 4),
      poster: tmdbImage(r.poster_path, 'w185'),
      overview: r.overview,
    }));
}

// Acepta "tt0133093" o una URL de IMDb (https://www.imdb.com/title/tt0133093/).
export function parseImdbId(text) {
  return (String(text || '').match(/\btt\d{6,10}\b/) || [])[0] || '';
}

// Busca en TMDB el título que corresponde a un ID de IMDb (película, serie o episodio).
export async function findByImdb(imdbId, { token, language }) {
  const data = await tmdb(`/find/${imdbId}`, token, { external_source: 'imdb_id', language });
  const movie = data.movie_results?.[0];
  const tv = data.tv_results?.[0];
  const episode = data.tv_episode_results?.[0];
  if (movie) return { id: movie.id, type: 'movie' };
  if (tv) return { id: tv.id, type: 'tv' };
  if (episode) return { id: episode.show_id, type: 'tv', episode: { season: episode.season_number, number: episode.episode_number } };
  return null;
}

export function getDetails(id, type, { token, language }) {
  return tmdb(`/${type}/${id}`, token, {
    language,
    append_to_response: 'videos,credits,watch/providers,external_ids',
    include_video_language: `${language.slice(0, 2)},en,null`,
  });
}

export function getSeason(tvId, seasonNumber, { token, language }) {
  return tmdb(`/tv/${tvId}/season/${seasonNumber}`, token, { language });
}

// Tráiler oficial de YouTube, priorizando el idioma de la web.
export function pickTrailer(details, language = 'es') {
  const lang = language.slice(0, 2);
  const score = (v) => (v.type === 'Trailer' ? 4 : v.type === 'Teaser' ? 2 : 0) + (v.official ? 2 : 0) + (v.iso_639_1 === lang ? 3 : 0);
  const best = (details.videos?.results || [])
    .filter((v) => v.site === 'YouTube' && ['Trailer', 'Teaser'].includes(v.type))
    .sort((a, b) => score(b) - score(a))[0];
  return best ? `https://www.youtube.com/watch?v=${best.key}` : '';
}

const PROVIDER_GROUPS = [
  ['flatrate', 'Suscripción'],
  ['free', 'Gratis'],
  ['ads', 'Gratis con anuncios'],
  ['rent', 'Alquiler'],
  ['buy', 'Compra'],
];

// Plataformas legales donde verla en el país indicado (datos de JustWatch vía TMDB).
export function providersFor(details, region) {
  const r = details['watch/providers']?.results?.[region];
  if (!r) return null;
  const groups = PROVIDER_GROUPS
    .map(([key, label]) => ({ label, items: (r[key] || []).map((p) => ({ name: p.provider_name, logo: tmdbImage(p.logo_path, 'w92') })) }))
    .filter((g) => g.items.length);
  return groups.length ? { link: r.link, groups } : null;
}

export function factsFor(details, type) {
  const isMovie = type === 'movie';
  const year = (details.release_date || details.first_air_date || '').slice(0, 4);
  const runtime = isMovie ? details.runtime : details.episode_run_time?.[0];
  const people = isMovie
    ? (details.credits?.crew || []).filter((c) => c.job === 'Director').map((c) => c.name)
    : (details.created_by || []).map((c) => c.name);
  return [
    ['Título original', details.original_title || details.original_name],
    ['Año', year],
    [isMovie ? 'Duración' : 'Duración por episodio', runtime ? `${runtime} min` : ''],
    ['Géneros', (details.genres || []).map((g) => g.name).join(', ')],
    [isMovie ? 'Dirección' : 'Creación', people.join(', ')],
    ['Reparto', (details.credits?.cast || []).slice(0, 8).map((c) => c.name).join(', ')],
    ['Temporadas', isMovie ? '' : details.number_of_seasons],
    ['Puntuación TMDB', details.vote_count ? `${details.vote_average.toFixed(1)}/10 (${details.vote_count} votos)` : ''],
  ].filter(([, v]) => v);
}

// Convierte la ficha de TMDB en un borrador listo para el publicador de WordPress.
export function buildDraft(details, type, { region, language }) {
  const isMovie = type === 'movie';
  const title = details.title || details.name;
  const year = (details.release_date || details.first_air_date || '').slice(0, 4);
  const providers = providersFor(details, region);
  const trailer = pickTrailer(details, language);
  const genres = (details.genres || []).map((g) => g.name);

  const blocks = [
    paragraph(escapeHtml(details.overview || 'Sinopsis no disponible.')),
    heading('Ficha'),
    list(factsFor(details, type).map(([k, v]) => `<strong>${escapeHtml(k)}:</strong> ${escapeHtml(v)}`)),
  ];
  if (trailer) blocks.push(heading('Tráiler'), VIDEO_SLOT);
  blocks.push(heading(`Dónde ver ${title}`));
  if (providers) {
    providers.groups.forEach((g) => blocks.push(paragraph(`<strong>${escapeHtml(g.label)}:</strong> ${g.items.map((p) => escapeHtml(p.name)).join(', ')}`)));
    blocks.push(paragraph(`<a href="${escapeHtml(providers.link)}" target="_blank" rel="noopener">Ver todas las opciones</a> · Disponibilidad en ${escapeHtml(region)} proporcionada por JustWatch.`));
  } else {
    blocks.push(paragraph(`Ahora mismo no hay plataformas registradas en ${escapeHtml(region)} para este título.`));
  }
  blocks.push(paragraph('<em>Datos e imágenes de The Movie Database (TMDB). Este sitio usa la API de TMDB, pero no está respaldado ni certificado por TMDB.</em>'));

  const people = isMovie
    ? (details.credits?.crew || []).filter((c) => c.job === 'Director').map((c) => c.name)
    : (details.created_by || []).map((c) => c.name);
  const cast = (details.credits?.cast || []).slice(0, 8).map((c) => c.name);
  const countries = (details.production_countries || []).map((c) => c.name);

  const category = detectCategory(details, type);

  return {
    source: 'tmdb',
    kind: type,
    category: category.key,
    categoryReason: category.reason,
    tmdbId: details.id,
    seriesName: title,
    // Valores con nombre neutro: el mapeo del theme decide en qué campo va cada uno.
    data: {
      tmdb_id: details.id,
      imdb_id: details.external_ids?.imdb_id || details.imdb_id || '',
      original_title: details.original_title || details.original_name || '',
      tagline: details.tagline || '',
      year,
      release_date: details.release_date || details.first_air_date || '',
      runtime: (isMovie ? details.runtime : details.episode_run_time?.[0]) || '',
      rating: details.vote_count ? details.vote_average.toFixed(1) : '',
      vote_count: details.vote_count || '',
      poster_url: tmdbImage(details.poster_path, 'w500'),
      backdrop_url: tmdbImage(details.backdrop_path, 'original'),
      trailer_url: trailer,
      genres,
      director: people,
      cast,
      country: countries,
      status: isMovie ? '' : details.status || '',
      seasons_count: isMovie ? '' : details.number_of_seasons || '',
      episodes_count: isMovie ? '' : details.number_of_episodes || '',
    },
    taxonomyValues: {
      genres,
      year: year ? [year] : [],
      cast: cast.slice(0, 5),
      director: isMovie ? people : [],
      creator: isMovie ? [] : people,
      country: countries,
      language: (details.spoken_languages || []).slice(0, 2).map((l) => l.name || l.english_name).filter(Boolean),
      studio: (details.production_companies || []).slice(0, 3).map((c) => c.name),
      network: isMovie ? [] : (details.networks || []).map((n) => n.name),
    },
    seasons: isMovie ? [] : (details.seasons || [])
      .filter((s) => s.season_number > 0 && s.episode_count > 0)
      .map((s) => ({ number: s.season_number, name: s.name, episodes: s.episode_count, airDate: s.air_date, posterPath: s.poster_path, overview: s.overview })),
    title: year ? `${title} (${year})` : title,
    excerpt: details.overview || '',
    content: blocks.join('\n\n'),
    videos: trailer ? [{ url: trailer }] : [],
    featuredImage: details.poster_path ? { url: tmdbImage(details.poster_path, 'w780'), alt: `Póster de ${title}` } : null,
    categories: isMovie ? 'Películas' : 'Series',
    tags: genres.join(', '),
    meta: [],
  };
}

// Datos de una temporada (de la lista de la serie y, si se cargó, de su detalle).
export function seasonData(seriesTmdbId, season, detail = {}) {
  const airDate = detail.air_date || season.airDate || '';
  return {
    tmdb_id: detail.id || '',
    series_tmdb_id: seriesTmdbId,
    season_number: season.number,
    season_title: detail.name || season.name || '',
    air_date: airDate,
    year: airDate.slice(0, 4),
    episode_count: detail.episodes?.length || season.episodes || '',
    poster_url: tmdbImage(detail.poster_path || season.posterPath, 'w500'),
  };
}

export function seasonContent(season, detail = {}) {
  const overview = detail.overview || season.overview;
  return [
    paragraph(escapeHtml(overview || 'Sinopsis no disponible.')),
    paragraph('<em>Datos de The Movie Database (TMDB).</em>'),
  ].join('\n\n');
}

// Datos de un episodio de TMDB con los mismos nombres neutros que usa el mapeo del theme.
export function episodeData(seriesTmdbId, seasonNumber, ep) {
  return {
    tmdb_id: ep.id || '',
    series_tmdb_id: seriesTmdbId,
    season_number: seasonNumber,
    episode_number: ep.episode_number,
    episode_title: ep.name || '',
    air_date: ep.air_date || '',
    still_url: tmdbImage(ep.still_path, 'w780'),
    runtime: ep.runtime || '',
    rating: ep.vote_count ? ep.vote_average.toFixed(1) : '',
  };
}

export function episodeContent(ep) {
  return [
    paragraph(escapeHtml(ep.overview || 'Sinopsis no disponible.')),
    paragraph('<em>Datos de The Movie Database (TMDB).</em>'),
  ].join('\n\n');
}
