// Cliente mínimo de la API REST de WordPress (contraseñas de aplicación o token Bearer).

export class WPError extends Error {
  constructor(message, { status, code, data } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

export function normalizeSiteUrl(raw) {
  let s = (raw || '').trim();
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  try {
    const u = new URL(s);
    return (u.origin + u.pathname).replace(/\/+$/, '').replace(/\/wp-json$/i, '').replace(/\/wp-admin$/i, '');
  } catch {
    return '';
  }
}

const base64 = (str) => btoa(String.fromCharCode(...new TextEncoder().encode(str)));

// Fuera del navegador (script de la terminal) no hay DOM: se decodifican las entidades más comunes.
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decodeHtml = (s) => {
  if (typeof document === 'undefined') {
    return String(s).replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => {
      if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
      return ENTITIES[e.toLowerCase()] ?? m;
    });
  }
  const ta = document.createElement('textarea');
  ta.innerHTML = s;
  return ta.value;
};

// Traduce los errores habituales de la API REST a algo accionable.
function explain(status, data) {
  const byCode = {
    incorrect_password: 'Usuario o contraseña de aplicación incorrectos.',
    invalid_username: 'Ese usuario no existe en el sitio.',
    invalid_email: 'Ese usuario no existe en el sitio.',
    application_passwords_disabled: 'Las contraseñas de aplicación están desactivadas en este sitio (algún plugin de seguridad las bloquea).',
    rest_not_logged_in: 'WordPress no recibió las credenciales. Hay servidores (Apache/CGI) que eliminan la cabecera Authorization: revisa el .htaccess o tu plugin de seguridad.',
    rest_cannot_create: 'Tu usuario no tiene permiso para crear este tipo de contenido.',
    rest_cannot_publish: 'Tu usuario no puede publicar: prueba con estado "Borrador" o "Pendiente".',
    rest_upload_user_quota_exceeded: 'Se ha superado la cuota de subida del usuario.',
    rest_upload_sideload_error: 'WordPress rechazó el archivo (tipo no permitido o sin permisos de escritura).',
    rest_no_route: 'Esa ruta no existe: comprueba el tipo de contenido o que la API REST esté activa.',
    rest_invalid_param: 'Algún campo no es válido',
  };
  const msg = data?.message ? decodeHtml(data.message.replace(/<[^>]+>/g, '')) : '';
  if (data?.code && byCode[data.code]) return msg && data.code === 'rest_invalid_param' ? `${byCode[data.code]}: ${msg}` : byCode[data.code];
  if (msg) return msg;
  if (status === 401) return 'Credenciales no válidas.';
  if (status === 403) return 'Acceso denegado (permisos o firewall del hosting).';
  if (status === 404) return 'No se encontró la API REST en esa URL.';
  if (status === 413) return 'El archivo es demasiado grande para el servidor.';
  return `WordPress respondió con un error ${status}.`;
}

function sanitizeFilename(name, type) {
  const ext = (type || '').split('/')[1]?.replace('jpeg', 'jpg').replace(/[^a-z0-9]/gi, '') || 'bin';
  const clean = (name || 'archivo')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
    .slice(0, 80) || 'archivo';
  return /\.[a-z0-9]{2,5}$/i.test(clean) ? clean : `${clean}.${ext}`;
}

// Tipos internos de WordPress que no son contenido publicable.
const INTERNAL_TYPES = new Set([
  'attachment', 'wp_block', 'wp_template', 'wp_template_part', 'wp_navigation',
  'wp_global_styles', 'wp_font_family', 'wp_font_face', 'nav_menu_item',
]);

export function createClient({ siteUrl, username = '', appPassword = '', authType = 'app-password', apiMode = 'pretty' }) {
  const site = normalizeSiteUrl(siteUrl);
  if (!site) throw new WPError('Falta la URL del sitio WordPress (Ajustes).');
  if (!appPassword.trim() || (authType === 'app-password' && !username.trim())) {
    throw new WPError('Faltan las credenciales de WordPress (Ajustes).');
  }
  const auth = authType === 'bearer'
    ? `Bearer ${appPassword.trim()}`
    : `Basic ${base64(`${username.trim()}:${appPassword.replace(/\s+/g, '')}`)}`;

  const buildUrl = (path, params = {}, mode = apiMode) => {
    const qs = new URLSearchParams(params).toString();
    return mode === 'query'
      ? `${site}/?rest_route=${path}${qs ? '&' + qs : ''}`
      : `${site}/wp-json${path}${qs ? '?' + qs : ''}`;
  };

  const request = async (path, { method = 'GET', params, body, headers = {}, mode } = {}) => {
    // Blob y FormData se envían tal cual (el navegador pone su Content-Type); el resto, como JSON.
    const isRaw = body instanceof Blob || body instanceof FormData;
    let res;
    try {
      res = await fetch(buildUrl(path, params, mode), {
        method,
        headers: { Authorization: auth, ...(body && !isRaw ? { 'Content-Type': 'application/json' } : {}), ...headers },
        body: isRaw ? body : body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new WPError('No se pudo conectar con WordPress. Revisa la URL, que el sitio use HTTPS y que el hosting no bloquee peticiones desde otro origen (CORS).', { code: 'network' });
    }
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { /* no es JSON */ }
    if (!res.ok) throw new WPError(explain(res.status, data), { status: res.status, code: data?.code, data });
    if (data === null && text) {
      throw new WPError('La respuesta no es JSON: ¿la URL apunta a un WordPress con la API REST activa?', { status: res.status, code: 'not_json' });
    }
    return data;
  };

  return {
    site,

    // Comprueba las credenciales y detecta si el sitio usa /wp-json o ?rest_route=.
    async testConnection() {
      let lastError;
      for (const mode of ['pretty', 'query']) {
        try {
          const me = await request('/wp/v2/users/me', { params: { context: 'edit' }, mode });
          return { me, apiMode: mode };
        } catch (e) {
          lastError = e;
          if (e.code !== 'not_json' && e.status !== 404) throw e;
        }
      }
      throw lastError;
    },

    async postTypes() {
      const types = await request('/wp/v2/types', { params: { context: 'edit' } });
      return Object.values(types)
        .filter((t) => t.rest_base && !INTERNAL_TYPES.has(t.slug))
        .map((t) => ({ slug: t.slug, restBase: t.rest_base, name: t.name, taxonomies: t.taxonomies || [], hierarchical: Boolean(t.hierarchical) }));
    },

    // Se sube como formulario (multipart): no necesita la cabecera Content-Disposition,
    // que algunos servidores no permiten en peticiones desde otro origen.
    uploadMedia(blob, filename, { alt = '', title = '' } = {}) {
      const form = new FormData();
      form.append('file', blob, sanitizeFilename(filename, blob.type));
      if (alt) form.append('alt_text', alt);
      if (title) form.append('title', title);
      return request('/wp/v2/media', { method: 'POST', body: form });
    },

    async taxonomies() {
      const list = await request('/wp/v2/taxonomies', { params: { context: 'edit' } });
      return Object.values(list)
        .filter((t) => t.rest_base && t.slug !== 'nav_menu' && t.slug !== 'wp_pattern_category')
        .map((t) => ({ slug: t.slug, restBase: t.rest_base, name: t.name, types: t.types || [], hierarchical: Boolean(t.hierarchical) }));
    },

    // Busca entradas (cualquier estado salvo papelera) por texto; con context=edit incluye sus campos.
    searchPosts(restBase, search) {
      return request(`/wp/v2/${restBase}`, { params: { search, status: 'any', context: 'edit', per_page: 20 } });
    },

    getPost(restBase, id) {
      return request(`/wp/v2/${restBase}/${id}`, { params: { context: 'edit' } });
    },

    // Devuelve los IDs de los términos (categorías, etiquetas o taxonomías del theme) por nombre, creándolos si no existen.
    async resolveTerms(taxonomy, names) {
      const ids = [];
      for (const name of names) {
        const found = await request(`/wp/v2/${taxonomy}`, { params: { search: name, per_page: 20 } });
        const match = found.find((t) => decodeHtml(t.name).toLowerCase() === name.toLowerCase());
        if (match) { ids.push(match.id); continue; }
        try {
          const created = await request(`/wp/v2/${taxonomy}`, { method: 'POST', body: { name } });
          ids.push(created.id);
        } catch (e) {
          if (e.code === 'term_exists' && e.data?.data?.term_id) ids.push(e.data.data.term_id);
          else throw e;
        }
      }
      return ids;
    },

    createPost(restBase, payload) {
      return request(`/wp/v2/${restBase}`, { method: 'POST', body: payload });
    },

    updatePost(restBase, id, payload) {
      return request(`/wp/v2/${restBase}/${id}`, { method: 'POST', body: payload });
    },

    // Todas las entradas de un tipo (página a página, de 100 en 100), en cualquier estado salvo papelera.
    async listAll(restBase, params = {}) {
      const all = [];
      for (let page = 1; page <= 50; page++) {
        const batch = await request(`/wp/v2/${restBase}`, { params: { status: 'any', context: 'edit', per_page: 100, page, ...params } });
        all.push(...batch);
        if (batch.length < 100) break;
      }
      return all;
    },

    editUrl(id) {
      return `${site}/wp-admin/post.php?post=${id}&action=edit`;
    },
  };
}
