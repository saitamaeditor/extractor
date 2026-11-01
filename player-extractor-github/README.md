# Publicador morvehtv

App para crear fichas de películas y series con los datos de TMDB (en castellano) y publicarlas en un WordPress con el theme **Hello MovieEngine** y el plugin **Cine Movie Engine**.

- **Publicador**: busca por IMDb o por título, detecta duplicados y publica películas, series, temporadas y episodios. También importa varios IDs de golpe.
- **Mi web**: lista lo que ya hay publicado, marca lo que le falta a cada ficha y la actualiza desde TMDB.
- **Catálogo TMDB**: explora TMDB y manda cualquier título al Publicador.
- **Extractor**: analiza HTML pegado y lista iframes y enlaces de vídeo.

Hecha con React 18, Vite 5 y Tailwind CSS 3.

## Uso en tu ordenador

Necesitas [Node.js](https://nodejs.org) 18 o más reciente.

```bash
npm install
npm start
```

Se abre en http://localhost:5180. En **Ajustes** pon:

1. **WordPress**: la URL de la web, tu usuario y una *contraseña de aplicación* (Usuarios → Perfil → Contraseñas de aplicación). Nunca tu contraseña normal.
2. **Theme**: carga los tipos y campos de MovieEngine, o importa `wordpress/configuracion-theme-morvehtv.json`.
3. **TMDB**: tu clave de API (v3) o token de lectura (v4) de https://www.themoviedb.org/settings/api.

Los ajustes se guardan en `config/ajustes.json`. Esa carpeta está en `.gitignore` y **no se sube nunca** al repositorio.

### Publicar desde la terminal

Usa los mismos ajustes que la app:

```bash
npm run publicar -- tt0133093 tt7366338
npm run publicar -- --archivo=ids.txt --estado=publish
```

Opciones: `--estado=draft|pending|publish`, `--sin-episodios`, `--actualizar`, `--archivo=ruta`, `--simular`.

## Plugin de WordPress

`wordpress/publicador-rest.php` es un *mu-plugin* que deja escribir los campos de MovieEngine por la API REST. Súbelo a `wp-content/mu-plugins/`. También se puede descargar desde la app (Ajustes → Theme).

## GitHub Pages

El workflow `.github/workflows/pages.yml` compila la app y la publica cada vez que se sube algo a `main`.

1. En el repositorio: **Settings → Pages → Source: GitHub Actions**.
2. Sube los cambios a `main`. La web queda en `https://<usuario>.github.io/<repositorio>/`.

Diferencias con la versión local:

- Los ajustes se guardan solo en el navegador de cada persona (no hay `config/ajustes.json`).
- Tu WordPress tiene que permitir peticiones (CORS) desde `https://<usuario>.github.io`.
- La página es pública. Sin una contraseña de aplicación nadie puede publicar en tu web, pero no la dejes guardada en un ordenador compartido.
- `npm run publicar` solo funciona en local.
