// Motor de análisis de reproductores. Trabaja solo sobre el HTML pegado,
// en el navegador; no hace ninguna petición de red.

export const KINDS = {
  iframe: { label: 'Iframe', tone: 'sky' },
  direct: { label: 'Vídeo directo', tone: 'emerald' },
  server: { label: 'Servidor externo', tone: 'rose' },
  redirect: { label: 'Redirección', tone: 'amber' },
};

// Servidores de vídeo habituales: nombre visible + patrones de host/URL.
const SERVERS = [
  ['Upstream', /upstream\.to|upstreamcdn/i],
  ['DoodStream', /dood(stream)?\.|d0+d\.|ds2play|ds2video|dooood|doods\.|d-s\.io|do7go/i],
  ['Voe', /(^|\.)voe\.sx|voe-?un-?block|voeunbl|\/\/voe\.|jilliandescribecompany|christopheruntilpoint|walterprettytheir/i],
  ['Mixdrop', /mixdro?p\.|mixdrp|mdy48tn|mdbekjwqa|mxdrop|mdzsmutpcvykb/i],
  ['Streamtape', /streamta+pe|strtape|stape\.fun|streamadblock|tapeadsenjoyer|watchadsontape/i],
  ['Filemoon', /filemoon|kerapoxy|moonmov|fmoonembed|filemooon/i],
  ['StreamWish', /streamwish|embedwish|playerwish|wishembed|swdyu|sfastwish|awish\.|dwish\.|wishfast|strwish|flaswish|cdnwish/i],
  ['VidHide', /vidhide|vidhidepro|vidhidevip|filelions|alions\.|dlions\.|mlions\.|lion?s?file|vid\w*hide/i],
  ['LuluStream', /lulu(stream|vdoo?|vid|\.st)|luluvdo/i],
  ['Netu / HQQ', /hqq\.(to|tv|ac)|netu\.|waaw\.|richhioon/i],
  ['Uqload', /uqload/i],
  ['Ok.ru', /ok\.ru\/(video|videoembed)/i],
  ['Vidmoly', /vidmoly/i],
  ['Vidoza', /vidoza/i],
  ['Vudeo', /vudeo/i],
  ['Mp4Upload', /mp4upload/i],
  ['SuperVideo', /supervideo/i],
  ['StreamSB', /streamsb|sbembed|sbplay|sbfull|watchsb|sbanh|embedsb|lvturbo|sbthe/i],
  ['Fembed', /fembed|femax|feurl|fplayer|diasfem/i],
  ['Streamlare', /streamlare|slwatch/i],
  ['VidGuard', /vidguard|vgfplay|vgembed|listeamed|bembed\.net|v6embed/i],
  ['GoodStream', /goodstream/i],
  ['StreamHide', /streamhide|guccihide|louishide|ahvsh/i],
  ['Vidsrc', /vidsrc/i],
  ['Embedsito / Plustream', /embedsito|plustream/i],
  ['Powvideo', /powvideo|povvideo|powvldeo/i],
  ['Gamovideo', /gamovideo/i],
  ['Streamvid', /streamvid\.net/i],
  ['Mega', /mega\.nz\/embed|mega\.co\.nz/i],
  ['Google Drive', /drive\.google\.com\/file|docs\.google\.com\/file/i],
  ['YouTube', /youtube(-nocookie)?\.com\/embed|youtu\.be\//i],
  ['Vimeo', /player\.vimeo\.com/i],
  ['Dailymotion', /dailymotion\.com\/embed|dai\.ly/i],
];

const DIRECT_EXT = /\.(mp4|m4v|m3u8|mpd|flv|webm|mkv|mov|ts)(?=$|[?#&/])/i;

// ---- Filtro de exclusión: solo imágenes y dominios de carátulas/logos/avatares ----
const IMAGE_EXT = /\.(png|jpe?g|jfif|gif|webp|avif|svg|ico|bmp|tiff?|heic)(?=$|[?#&])/i;
const IMAGE_HOSTS = /(^|\.)(image\.tmdb\.org|themoviedb\.org|googleusercontent\.com|ggpht\.com|gravatar\.com|ytimg\.com|imgur\.com|ibb\.co|pinimg\.com|twimg\.com|media-amazon\.com|ssl-images-amazon\.com|fanart\.tv|artworks\.thetvdb\.com)$/i;

// Hojas de estilo, scripts y fuentes nunca son un reproductor (no se cuentan como descartes).
const NON_MEDIA_EXT = /\.(css|js|mjs|map|woff2?|ttf|otf|eot)(?=$|[?#&])/i;

// Publicidad, analítica, redes sociales y endpoints internos de WordPress.
const NOISE = /googletagmanager|google-analytics|doubleclick|googlesyndication|adservice|facebook\.com\/plugins|facebook\.net|twitter\.com\/widgets|platform\.twitter|disqus|recaptcha|hcaptcha|cloudflareinsights|histats|yandex|adsterra|popads|propellerads|exoclick|juicyads|a-ads\.com|admin-ajax\.php|\/wp-json\/|xmlrpc\.php|wp-login\.php|\/feed\/?$/i;

// Atributos donde estas webs guardan la URL del reproductor: cualquier URL que
// no sea imagen se acepta como reproductor.
const PLAYER_ATTRS = new Set([
  'src', 'data-src', 'data-lazy-src', 'data-litespeed-src', 'data-url', 'data-link',
  'data-embed', 'data-player', 'data-video', 'data-iframe', 'data-server', 'data-tplayer',
  'data-option', 'data-file', 'data-stream', 'data-source', 'data-frame', 'data-href',
  'data-redirect', 'data-go', 'data-out', 'data-target-url', 'data-playback', 'data-link-playback',
]);

// Enlaces de redirección hacia el reproductor real: /t/XXXX (cinubo), /go/, /out/, /r/…
const REDIRECT_PATH = /\/(t|r|go|out|redirect|redir|link|links|enlace|ir|goto|ext|ver-online)\/[A-Za-z0-9_=.-]{6,}\/?$/i;
const REDIRECT_SCRIPT = /\/(go|out|redirect|redir|link|enlace|r)\.php$/i;

// Claves de JSON (respuestas de API, data-link-playback…) que contienen la URL del reproductor.
const URL_KEYS = /^(url|uri|href|link|src|file|embed|embed_?url|embed_?link|iframe|player|player_?url|video|video_?url|stream|stream_?url|source|hls|m3u8|mp4|playback|link_?playback|server_?url|watch|watch_?url|redirect|target|go)$/i;

// Etiquetas cuyos atributos son imágenes o metadatos, nunca reproductores.
const SKIP_TAGS = new Set(['IFRAME', 'FRAME', 'SCRIPT', 'STYLE', 'VIDEO', 'SOURCE', 'IMG', 'PICTURE', 'SVG', 'IMAGE', 'USE', 'LINK', 'META']);

const URL_IN_TEXT = /(?:https?:)?\/\/[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(?::\d+)?(?:\/[^\s"'<>`\\)]*)?/gi;

// Claves típicas de configuración de reproductores en JS/JSON: file: "...", "embed_url": "..."
const PLAYER_KEY = /["']?(?:file|src|source|url|embed(?:_?url)?|iframe|player|link|video(?:_?url)?|stream|hls|mp4)["']?\s*[:=]\s*["'`]((?:https?:)?\/\/[^"'`\s<>]+|\/[^/"'`\s<>][^"'`\s<>]*)/gi;

const safeDecode = (s) => { try { return decodeURIComponent(s); } catch { return s; } };

// Se mira solo host + ruta: un servidor citado en ?url=… no convierte la redirección en servidor.
export function serverName(url) {
  let target = url;
  try { const u = new URL(url); target = u.origin + u.pathname; } catch { /* se usa tal cual */ }
  for (const [name, re] of SERVERS) if (re.test(target)) return name;
  return null;
}

// Idioma indicado en el elemento o en sus contenedores (filas de tablas de servidores, pestañas…).
function languageFor(el) {
  for (let node = el, i = 0; node && node.getAttribute && i < 5; node = node.parentElement, i++) {
    const v = node.getAttribute('data-lang') || node.getAttribute('data-language') || node.getAttribute('data-idioma') || node.getAttribute('data-audio');
    if (v) return v.trim().slice(0, 30);
  }
  return '';
}

// ¿Es una imagen (por extensión o por dominio de carátulas/logos)?
export function isImage(url) {
  try {
    const u = new URL(url);
    const path = safeDecode(u.pathname);
    if (DIRECT_EXT.test(path)) return false; // un vídeo real nunca se descarta
    return IMAGE_EXT.test(path) || IMAGE_HOSTS.test(u.hostname);
  } catch {
    return false;
  }
}

function decodeEntities(str) {
  if (!str || !/[&\\]/.test(str)) return str;
  let s = str
    .replace(/\\u002[fF]/g, '/')
    .replace(/\\u0026/g, '&')
    .replace(/\\x2[fF]/g, '/')
    .replace(/\\\//g, '/');
  if (s.includes('&')) {
    const ta = document.createElement('textarea');
    ta.innerHTML = s;
    s = ta.value;
  }
  return s;
}

// Limpia una URL encontrada y la deja absoluta; devuelve null si no es válida.
export function cleanUrl(raw, base) {
  if (!raw) return null;
  let s = decodeEntities(String(raw).trim()).replace(/^['"`(]+|['"`),;.\]]+$/g, '');
  if (/^%2F%2F|^https?%3A/i.test(s)) s = safeDecode(s);
  if (!s || /^(javascript|data|blob|mailto|tel|about):/i.test(s) || s === '#') return null;
  if (s.startsWith('//')) s = 'https:' + s;
  try {
    const u = new URL(s, base || undefined);
    if (!/^https?:$/.test(u.protocol)) return null;
    return u.href;
  } catch {
    return null;
  }
}

// Intenta decodificar valores en Base64 (muy usado en data-player / data-src).
function tryBase64(value) {
  const v = value.trim();
  if (v.length < 16 || v.length > 4000 || !/^[A-Za-z0-9+/_-]+={0,2}$/.test(v)) return null;
  try {
    const decoded = atob(v.replace(/-/g, '+').replace(/_/g, '/'));
    if (/^(https?:)?\/\//i.test(decoded) || /<iframe/i.test(decoded)) return decoded;
  } catch { /* no era Base64 */ }
  return null;
}

function looksLikePlayer(url) {
  return /\/(embed|e|v|play|player|video|videos|watch|iframe|stream|reproductor|ver)\b|embed|player|\?(v|id|file|url|video)=/i.test(url);
}

// mode: 'embed'  → viene de un iframe o atributo de reproductor: se acepta cualquier URL que no sea imagen.
//       'maybe'  → viene de un script u otro atributo: se acepta si tiene pinta de reproductor.
//       'strict' → texto general: solo servidores conocidos o vídeo directo.
function classify(url, mode) {
  const path = new URL(url).pathname;
  if (DIRECT_EXT.test(path) || /\.(m3u8|mp4|mpd)(?=$|[?#&/])/i.test(url)) return { kind: 'direct', server: serverName(url) };
  if (NON_MEDIA_EXT.test(path)) return null;
  const server = serverName(url);
  if (server) return { kind: 'server', server };
  if (REDIRECT_PATH.test(path) || REDIRECT_SCRIPT.test(path)) return { kind: 'redirect', server: null };
  if (mode === 'embed' || (mode === 'maybe' && looksLikePlayer(url))) return { kind: 'iframe', server: null };
  return null;
}

function inferBase(doc) {
  const candidates = [
    doc.querySelector('base[href]')?.getAttribute('href'),
    doc.querySelector('link[rel="canonical"]')?.getAttribute('href'),
    doc.querySelector('meta[property="og:url"]')?.getAttribute('content'),
  ];
  for (const c of candidates) {
    const u = cleanUrl(c);
    if (u) return u;
  }
  return undefined;
}

export function extract(html, { baseUrl = '', includeAll = false } = {}) {
  const found = new Map();
  const discarded = new Map();
  const relativeSkipped = new Set();

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const base = cleanUrl(baseUrl) || inferBase(doc);

  const add = (raw, origin, { mode = 'strict', label = '', kind } = {}) => {
    try {
      const url = cleanUrl(raw, base);
      if (!url) {
        if (mode === 'embed' && /^\.{0,2}\/[^/]/.test(String(raw).trim())) relativeSkipped.add(String(raw).trim());
        return;
      }
      if (isImage(url)) {
        if (mode !== 'strict' || /\.(m3u8|mp4)|embed|player/i.test(url)) discarded.set(url, origin);
        return;
      }
      if (NOISE.test(url) && !serverName(url)) return;

      // Redirecciones con el destino en un parámetro: go.php?url=https%3A%2F%2Fvoe.sx%2F… o en Base64.
      let wrapsTarget = false;
      for (const [, v] of new URL(url).searchParams) {
        const target = /^(https?:)?\/\//i.test(v) ? v : tryBase64(v);
        if (target && /^(https?:)?\/\//i.test(target) && target !== url) {
          wrapsTarget = true;
          add(target, origin + ' → destino de redirección', { mode: 'embed', label });
        }
      }

      let info = kind ? { kind, server: serverName(url) } : classify(url, mode);
      if (wrapsTarget && (!info || info.kind === 'iframe')) info = { kind: 'redirect', server: null };
      if (!info) return;
      const prev = found.get(url);
      if (prev) {
        if (!prev.origins.includes(origin)) prev.origins.push(origin);
        if (label && !prev.label) prev.label = label;
        return;
      }
      found.set(url, { id: found.size + 1, url, ...info, origins: [origin], label });
    } catch {
      // Una URL rara nunca debe tumbar el análisis completo.
    }
  };

  const handleDecoded = (decoded, origin, label = '') => {
    if (/<iframe/i.test(decoded)) {
      const m = decoded.match(/src\s*=\s*["']?([^"'\s>]+)/i);
      if (m) add(m[1], origin, { mode: 'embed', label });
    } else {
      add(decoded, origin, { mode: 'embed', label });
    }
  };

  const scanText = (text, origin, mode) => {
    const t = decodeEntities(text);
    for (const m of t.matchAll(PLAYER_KEY)) add(m[1], origin, { mode: 'embed' });
    for (const m of t.matchAll(URL_IN_TEXT)) add(m[0], origin, { mode });
    for (const m of t.matchAll(/<iframe[^>]+src\s*=\s*["']?([^"'\s>]+)/gi)) add(m[1], origin + ' (iframe en texto)', { mode: 'embed' });
    for (const m of t.matchAll(/["']([A-Za-z0-9+/_-]{20,}={0,2})["']/g)) {
      const d = tryBase64(m[1]);
      if (d) handleDecoded(d, origin + ' (Base64)');
    }
  };

  const parseJson = (text) => {
    const t = text.trim();
    if (!/^[[{]/.test(t)) return undefined;
    try { return JSON.parse(t); } catch { return undefined; }
  };

  // Nombre visible de un objeto de API: servidor · idioma · calidad.
  const labelFrom = (obj) => {
    const info = obj.info && typeof obj.info === 'object' ? obj.info : {};
    const pick = (...keys) => {
      for (const k of keys) {
        const v = obj[k] ?? info[k];
        if ((typeof v === 'string' || typeof v === 'number') && String(v).length <= 40 && !/\/\//.test(String(v))) return String(v).trim();
      }
      return '';
    };
    return [pick('server', 'servidor', 'name', 'nombre', 'title', 'host'), pick('language', 'lang', 'idioma', 'audio'), pick('quality', 'calidad')]
      .filter(Boolean).join(' · ');
  };

  const handleString = (s, origin, label, isUrlKey) => {
    const t = s.trim();
    if (t.length < 6) return;
    const nested = parseJson(t);
    if (nested !== undefined) return walkJson(nested, origin, label);
    if (/<iframe/i.test(t)) return handleDecoded(t, origin, label);
    const decoded = tryBase64(t);
    if (decoded) return handleDecoded(decoded, origin + ' (Base64)', label);
    if (/^(https?:)?\/\/|^\.{0,2}\/[^/]/i.test(t)) return add(t, origin, { mode: isUrlKey ? 'embed' : 'maybe', label });
    if (/https?:\/\//i.test(t)) scanText(t, origin, 'maybe');
  };

  // Recorre respuestas JSON de API y objetos de reproductores a cualquier profundidad.
  const walkJson = (value, origin, label = '', depth = 0) => {
    if (depth > 30 || value == null) return;
    if (typeof value === 'string') return handleString(value, origin, label, false);
    if (Array.isArray(value)) return value.forEach((v) => walkJson(v, origin, label, depth + 1));
    if (typeof value !== 'object') return;
    const lbl = labelFrom(value) || label;
    for (const [k, v] of Object.entries(value)) {
      if (typeof v === 'string') handleString(v, origin, lbl, URL_KEYS.test(k));
      else walkJson(v, origin, lbl, depth + 1);
    }
  };

  const scanRoot = (root) => {
    // 1) Iframes, frames y objetos incrustados.
    root.querySelectorAll('iframe, frame, embed, object').forEach((el) => {
      for (const attr of ['src', 'data-src', 'data-lazy-src', 'data-litespeed-src', 'data', 'data-url']) {
        const v = el.getAttribute(attr);
        if (v) add(v, `<${el.tagName.toLowerCase()} ${attr}>`, { mode: 'embed', label: el.getAttribute('title') || '' });
      }
    });

    // 2) <video> / <source>: siempre vídeo directo (salvo que sea una imagen).
    root.querySelectorAll('video, source, audio').forEach((el) => {
      for (const attr of ['src', 'data-src']) {
        const v = el.getAttribute(attr);
        if (v) add(v, `<${el.tagName.toLowerCase()}>`, { kind: 'direct' });
      }
    });

    // 3) Opciones de servidor: <li data-src="...">, botones, enlaces, inputs, etc.
    root.querySelectorAll('*').forEach((el) => {
      if (SKIP_TAGS.has(el.tagName.toUpperCase())) return;
      for (const attr of el.getAttributeNames()) {
        const isPlayerAttr = PLAYER_ATTRS.has(attr);
        if (!isPlayerAttr && !attr.startsWith('data-') && attr !== 'href' && attr !== 'value' && attr !== 'onclick') continue;
        const v = el.getAttribute(attr);
        if (!v || v.length < 6) continue;
        const text = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60);
        const lang = languageFor(el);
        const label = [text, lang && !text.includes(lang) ? lang : ''].filter(Boolean).join(' · ');
        const origin = `atributo ${attr}`;
        const json = parseJson(v);
        if (json !== undefined) { walkJson(json, origin + ' (JSON)', label); continue; }
        const decoded = tryBase64(v);
        if (decoded) { handleDecoded(decoded, origin + ' (Base64)', label); continue; }
        if (/<iframe/i.test(v)) { handleDecoded(decodeEntities(v), origin, label); continue; }
        if (attr === 'onclick') { scanText(v, origin, 'maybe'); continue; }
        if (/^(https?:)?\/\/|^\.{0,2}\/[^/]/i.test(v)) {
          const mode = attr === 'href' ? 'strict' : isPlayerAttr ? 'embed' : 'maybe';
          add(v, origin, { mode, label });
        }
      }
    });

    // 4) Scripts incrustados (jwplayer, JSON de servidores, variables…).
    root.querySelectorAll('script').forEach((s) => {
      const json = s.textContent && parseJson(s.textContent);
      if (json !== undefined && json !== '') walkJson(json, '<script> (JSON)');
      if (s.textContent) scanText(s.textContent, '<script>', 'maybe');
      const src = s.getAttribute('src');
      if (src && serverName(src)) add(src, '<script src>');
    });

    // 5) <template> guarda su contenido aparte del DOM: se analiza también.
    root.querySelectorAll('template').forEach((t) => scanRoot(t.content));
  };

  // 0) Si lo pegado es directamente una respuesta JSON de API, se recorre entera.
  const rootJson = parseJson(html);
  if (rootJson !== undefined) walkJson(rootJson, 'respuesta JSON');

  scanRoot(doc);

  // 6) Barrido del HTML bruto (comentarios, HTML escapado dentro de strings…).
  scanText(html, 'texto del HTML', includeAll ? 'maybe' : 'strict');

  // Opciones que la web carga por AJAX al hacer clic (DooPlay y similares): su URL no está en el HTML.
  const ajaxOptions = doc.querySelectorAll('[data-post][data-nume], .dooplay_player_option').length;

  const order = { server: 0, redirect: 1, iframe: 2, direct: 3 };
  const items = [...found.values()].sort((a, b) => order[a.kind] - order[b.kind] || a.id - b.id);
  return {
    items,
    stats: {
      base: base || '',
      discarded: [...discarded.entries()].map(([url, origin]) => ({ url, origin })),
      relativeSkipped: relativeSkipped.size,
      ajaxOptions,
    },
  };
}

export function isHls(url) {
  return /\.m3u8(\?|#|$)/i.test(url) || /m3u8/i.test(url);
}

export const SAMPLE_HTML = `<!-- Ejemplo de página de serie -->
<link rel="canonical" href="https://www.ejemplo-series.com/serie/mi-serie/">
<div class="player-options">
  <ul>
    <li class="option" data-player="aHR0cHM6Ly92b2Uuc3gvZS9hYmMxMjN4eXo=">Voe · Latino</li>
    <li class="option" data-src="https://dood.wf/e/k9zt3x1lq0">DoodStream · Castellano</li>
    <li class="option" data-embed="//mixdrop.ag/e/3n8w0x2mhq">Mixdrop · Subtitulado</li>
    <li class="option" data-url="https://luluvdo.com/e/7hq2m9xk4p">LuluStream · Latino</li>
  </ul>
</div>
<div class="links" data-link-playback='[{"url":"https:\\/\\/www.ejemplo-series.com\\/t\\/Xk92LmQpa1","info":{"language":"Latino","server":"Lulustream"}},{"url":"\\/t\\/Pq7Zr3Nw0b","info":{"language":"Subtitulado"}}]'></div>
<a href="https://www.ejemplo-series.com/go.php?url=https%3A%2F%2Flulustream.com%2Fe%2Flulu123">Ver en Lulustream</a>
<div id="player">
  <img class="poster" src="https://image.tmdb.org/t/p/w500/poster.jpg" alt="Carátula">
  <iframe src="https://upstream.to/embed-q1w2e3r4t5y6.html" allowfullscreen></iframe>
  <iframe data-src="https://www.example-player.net/embed/xyz" class="lazy"></iframe>
  <iframe src="/reproductor/embed.php?id=1234"></iframe>
</div>
<video controls poster="https://lh3.googleusercontent.com/thumb=w640">
  <source src="https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8" type="application/x-mpegURL">
</video>
<script>
  var servers = {"filemoon":"https:\\/\\/filemoon.sx\\/e\\/p8o7i6u5y4","wish":"https://streamwish.to/e/a1s2d3f4g5"};
  jwplayer("vplayer").setup({ file: "https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4", image: "https://image.tmdb.org/t/p/w1280/fondo.webp" });
</script>
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXX"></script>`;
