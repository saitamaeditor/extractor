// Mapeo entre los datos de la ficha y la estructura del theme (MovieEngine u otro):
// tipos de contenido, taxonomías y claves de los campos personalizados.
import { DEFAULT_CATEGORY_MAP } from './categories.js';

export const FIELD_DEFS = [
  ['tmdb_id', 'ID de TMDB'],
  ['imdb_id', 'ID de IMDb'],
  ['original_title', 'Título original'],
  ['tagline', 'Eslogan'],
  ['year', 'Año'],
  ['release_date', 'Fecha de estreno'],
  ['runtime', 'Duración (min)'],
  ['rating', 'Puntuación'],
  ['vote_count', 'Nº de votos'],
  ['poster_url', 'URL del póster'],
  ['backdrop_url', 'URL de la imagen de fondo'],
  ['trailer_url', 'Tráiler oficial (YouTube)'],
  ['video_url', 'Vídeo propio (YouTube, Vimeo o tu WordPress)'],
  ['genres', 'Géneros (texto)'],
  ['director', 'Dirección / creación'],
  ['cast', 'Reparto'],
  ['country', 'País'],
  ['status', 'Estado de la serie'],
  ['seasons_count', 'Nº de temporadas'],
  ['episodes_count', 'Nº de episodios'],
];

export const SEASON_FIELD_DEFS = [
  ['tmdb_id', 'ID de TMDB de la temporada'],
  ['series_id', 'ID de la serie en WordPress'],
  ['series_tmdb_id', 'ID de TMDB de la serie'],
  ['season_number', 'Nº de temporada'],
  ['season_title', 'Nombre de la temporada'],
  ['air_date', 'Fecha de estreno'],
  ['year', 'Año'],
  ['episode_count', 'Nº de episodios'],
  ['poster_url', 'URL del póster de la temporada'],
];

export const EPISODE_FIELD_DEFS = [
  ['tmdb_id', 'ID de TMDB del episodio'],
  ['series_id', 'ID de la serie en WordPress'],
  ['season_id', 'ID de la temporada en WordPress'],
  ['series_tmdb_id', 'ID de TMDB de la serie'],
  ['season_number', 'Nº de temporada'],
  ['episode_number', 'Nº de episodio'],
  ['episode_code', 'Código (S01E02)'],
  ['episode_title', 'Título del episodio'],
  ['air_date', 'Fecha de emisión'],
  ['still_url', 'URL de la imagen del episodio'],
  ['runtime', 'Duración (min)'],
  ['rating', 'Puntuación'],
  ['video_url', 'Vídeo propio (YouTube, Vimeo o tu WordPress)'],
];

export const TAXONOMY_DEFS = [
  ['genres', 'Géneros'],
  ['year', 'Año'],
  ['cast', 'Reparto'],
  ['director', 'Dirección (películas)'],
  ['creator', 'Creación (series)'],
  ['country', 'País'],
  ['language', 'Idioma original'],
  ['studio', 'Productora / estudio'],
  ['network', 'Cadena (series)'],
];

export const TEMPLATE_HELP = '{serie} {titulo} {temporada} {episodio} {temporada2} {episodio2} {anio}';

export const DEFAULT_THEME = {
  enabled: false,
  movieType: 'posts',
  seriesType: 'posts',
  episodeType: '',
  // 'meta' = nº de temporada en un campo · 'taxonomy' = término por temporada · 'post' = entrada propia por temporada
  seasonMode: 'meta',
  seasonTaxonomy: '',
  seasonTermTemplate: 'Temporada {temporada}',
  seasonType: '',
  seasonTitleTemplate: 'Temporada {temporada}',
  episodeTitleTemplate: '{serie} {temporada}x{episodio2}',
  useParent: false, // enlazar con la entrada padre (serie → temporada) en tipos jerárquicos
  // Subir el póster de TMDB como imagen destacada. MovieEngine prefiere la imagen destacada al
  // campo de póster, así que si la subida falla en el hosting la tarjeta se queda sin imagen.
  featuredFromPoster: true,
  taxonomies: {},
  categoryMap: DEFAULT_CATEGORY_MAP,
  fields: {},
  seasonFields: {},
  episodeFields: {},
  types: [],
  taxonomyList: [],
};

// Sin mapeo de theme se envían estos campos genéricos (solo se guardan si están registrados).
export const GENERIC_FIELDS = { tmdb_id: 'tmdb_id', imdb_id: 'imdb_id', year: 'anio', rating: 'puntuacion_tmdb' };

const pad = (n) => String(n ?? '').padStart(2, '0');

export function fillTemplate(template, { serie = '', titulo = '', temporada = '', episodio = '', anio = '' }) {
  const vars = { serie, titulo, temporada, episodio, anio, temporada2: pad(temporada), episodio2: pad(episodio) };
  return template.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m)).replace(/\(\s*\)/g, '').replace(/\s{2,}/g, ' ').trim();
}

export const episodeCode = (season, episode) => `S${pad(season)}E${pad(episode)}`;

// { tmdb_id: '603', … } + { tmdb_id: 'clave_del_theme' } → { clave_del_theme: '603' }
export function mapMeta(data, mapping) {
  const out = {};
  for (const [field, metaKey] of Object.entries(mapping || {})) {
    const key = (metaKey || '').trim();
    const value = data?.[field];
    if (!key || value === undefined || value === null || value === '') continue;
    out[key] = Array.isArray(value) ? value.join(', ') : String(value);
  }
  return out;
}

export const typeForKind = (theme, kind) =>
  ({ movie: theme.movieType, tv: theme.seriesType, episode: theme.episodeType })[kind] || 'posts';

const SAFE = /^[A-Za-z0-9_-]+$/;
const phpList = (items) => `array( ${items.map((i) => `'${i}'`).join(', ')} )`;

// Plugin "must-use" que registra en la API REST las claves mapeadas, para que WordPress las guarde.
export function companionPlugin(theme) {
  const slugOf = (restBase) => theme.types.find((t) => t.restBase === restBase)?.slug || (restBase === 'posts' ? 'post' : restBase);
  const keysOf = (mapping) => [...new Set(Object.values(mapping || {}).map((k) => (k || '').trim()).filter((k) => SAFE.test(k)))];
  const groups = [
    { types: [...new Set([theme.movieType, theme.seriesType].filter(Boolean).map(slugOf))], keys: keysOf(theme.fields) },
    { types: theme.seasonMode === 'post' && theme.seasonType ? [slugOf(theme.seasonType)] : [], keys: keysOf(theme.seasonFields) },
    { types: theme.episodeType ? [slugOf(theme.episodeType)] : [], keys: keysOf(theme.episodeFields) },
  ].map((g) => ({ ...g, types: g.types.filter((t) => SAFE.test(t)) })).filter((g) => g.types.length && g.keys.length);

  return `<?php
/**
 * Plugin Name: Publicador – campos REST del theme
 * Description: Permite que la API REST lea y guarde los campos personalizados que usa el publicador. Generado por Extractor de Reproductores.
 * Version: 1.4
 *
 * Instalación: guarda este archivo suelto en wp-content/mu-plugins/publicador-rest.php
 * (sustituyendo cualquier versión anterior; no dejes dos copias).
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

// Evita cargarlo dos veces (p. ej. si hay una copia en mu-plugins y otra en plugins).
if ( defined( 'PUBLICADOR_REST_VERSION' ) ) {
	return;
}
define( 'PUBLICADOR_REST_VERSION', '1.4' );

function publicador_rest_grupos() {
	return array(
${groups.map((g) => `		array( 'types' => ${phpList(g.types)}, 'keys' => ${phpList(g.keys)} ),`).join('\n')}
	);
}

function publicador_rest_claves() {
	$claves = array();
	foreach ( publicador_rest_grupos() as $grupo ) {
		$claves = array_merge( $claves, $grupo['keys'] );
	}
	return array_unique( $claves );
}

// Si el theme o un plugin registra las mismas claves sin API REST, se fuerza aquí
// que sean visibles y editables por la API (da igual quién las registre primero).
add_filter( 'register_meta_args', function ( $args, $defaults, $object_type, $meta_key ) {
	if ( 'post' === $object_type && in_array( $meta_key, publicador_rest_claves(), true ) ) {
		$args['show_in_rest'] = true;
		$args['single']       = true;
		if ( empty( $args['auth_callback'] ) ) {
			$args['auth_callback'] = function () {
				return current_user_can( 'edit_posts' );
			};
		}
	}
	return $args;
}, 99, 4 );

// Registro propio, con prioridad alta para ejecutarse después del theme.
function publicador_rest_registrar() {
	foreach ( publicador_rest_grupos() as $grupo ) {
		foreach ( $grupo['types'] as $type ) {
			// La API REST solo expone "meta" en tipos que admiten campos personalizados.
			add_post_type_support( $type, 'custom-fields' );
			foreach ( $grupo['keys'] as $key ) {
				if ( registered_meta_key_exists( 'post', $key, $type ) ) {
					continue; // ya registrada (el filtro de arriba la ha abierto a la API)
				}
				register_post_meta( $type, $key, array(
					'show_in_rest'  => true,
					'single'        => true,
					'type'          => 'string',
					'auth_callback' => function () {
						return current_user_can( 'edit_posts' );
					},
				) );
			}
		}
	}
}
add_action( 'init', 'publicador_rest_registrar', 999 );
add_action( 'rest_api_init', 'publicador_rest_registrar', 999 );

// Marca de diagnóstico: permite comprobar desde la app que este plugin se está ejecutando.
add_filter( 'rest_post_dispatch', function ( $response ) {
	if ( $response instanceof WP_HTTP_Response ) {
		$response->header( 'X-Publicador-Rest', PUBLICADOR_REST_VERSION );
	}
	return $response;
} );
add_filter( 'rest_exposed_cors_headers', function ( $headers ) {
	$headers[] = 'X-Publicador-Rest';
	return $headers;
} );

// Diagnóstico: nombres (nunca valores) de los campos guardados en cada entrada,
// solo en modo edición y para quien puede editarla. Sirve para ajustar el mapeo.
add_action( 'rest_api_init', function () {
	$tipos = array();
	foreach ( publicador_rest_grupos() as $grupo ) {
		$tipos = array_merge( $tipos, $grupo['types'] );
	}
	register_rest_field( array_unique( $tipos ), 'publicador_meta_keys', array(
		'get_callback' => function ( $post, $field, $request ) {
			if ( 'edit' !== $request['context'] || ! current_user_can( 'edit_post', $post['id'] ) ) {
				return null;
			}
			return array_values( array_keys( get_post_meta( $post['id'] ) ) );
		},
		'schema'       => array( 'type' => 'array', 'context' => array( 'edit' ), 'readonly' => true ),
	) );
} );
`;
}
