<?php
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
		array( 'types' => array( 'movie_engine_movie', 'movie_engine_series' ), 'keys' => array( '_movie_engine_tmdb_id', '_movie_engine_imdb_id', '_movie_engine_year', '_movie_engine_release_date', '_movie_engine_runtime', '_movie_engine_rating', '_movie_engine_trailer', '_movie_engine_poster_url', '_movie_engine_backdrop_url', '_movie_engine_status', '_movie_engine_number_of_seasons', '_movie_engine_number_of_episodes' ) ),
		array( 'types' => array( 'movie_engine_season' ), 'keys' => array( '_movie_engine_tmdb_id', '_movie_engine_series_id', '_movie_engine_season_number', '_movie_engine_air_date', '_movie_engine_season_year', '_movie_engine_poster_url', '_movie_engine_episode_count' ) ),
		array( 'types' => array( 'movie_engine_episode' ), 'keys' => array( '_movie_engine_tmdb_id', '_movie_engine_series_id', '_movie_engine_season_id', '_movie_engine_season_number', '_movie_engine_episode_number', '_movie_engine_air_date', '_movie_engine_runtime' ) ),
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
