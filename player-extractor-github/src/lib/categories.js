// Clasificación automática de cada ficha (Películas, Series, Anime, Documentales, Infantil)
// a partir de los datos de TMDB, y su traducción a términos de WordPress.

export const CATEGORY_DEFS = [
  ['movie', 'Películas'],
  ['tv', 'Series'],
  ['anime', 'Anime'],
  ['documentary', 'Documentales'],
  ['kids', 'Infantil'],
];

export const categoryLabel = (key) => CATEGORY_DEFS.find(([k]) => k === key)?.[1] || key;

// Taxonomía vacía = esa categoría no añade ningún término (el tipo de contenido ya la distingue).
export const DEFAULT_CATEGORY_MAP = {
  movie: { taxonomy: '', term: 'Películas' },
  tv: { taxonomy: '', term: 'Series' },
  anime: { taxonomy: '', term: 'Anime' },
  documentary: { taxonomy: '', term: 'Documentales' },
  kids: { taxonomy: '', term: 'Infantil' },
};

// IDs de género de TMDB (son los mismos en cualquier idioma).
const ANIMATION = 16;
const DOCUMENTARY = 99;
const FAMILY = 10751;
const KIDS = 10762;

const isJapanese = (d) =>
  d.original_language === 'ja'
  || (d.origin_country || []).includes('JP')
  || (d.production_countries || []).some((c) => c.iso_3166_1 === 'JP');

// Devuelve { key, reason }: la categoría detectada y por qué, para mostrarlo en pantalla.
export function detectCategory(details, type) {
  const genres = new Set((details.genres || []).map((g) => g.id));
  if (genres.has(ANIMATION) && isJapanese(details)) return { key: 'anime', reason: 'Animación de origen japonés' };
  if (genres.has(DOCUMENTARY)) return { key: 'documentary', reason: 'Género documental en TMDB' };
  if (genres.has(KIDS)) return { key: 'kids', reason: 'Serie infantil en TMDB' };
  if (genres.has(FAMILY) && genres.has(ANIMATION)) return { key: 'kids', reason: 'Animación familiar' };
  return type === 'tv'
    ? { key: 'tv', reason: 'Serie de televisión' }
    : { key: 'movie', reason: 'Película' };
}
