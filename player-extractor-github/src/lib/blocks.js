// Generadores de bloques de Gutenberg para el contenido de las entradas.

// Marca donde el publicador inserta los vídeos; si no está, se añaden al final.
export const VIDEO_SLOT = '<!-- pe:videos -->';

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// Atributos JSON de un comentario de bloque ("--" cerraría el comentario).
const blockAttrs = (obj) => JSON.stringify(obj).replace(/--/g, '\\u002d\\u002d');

export const paragraph = (html) => `<!-- wp:paragraph -->\n<p>${html}</p>\n<!-- /wp:paragraph -->`;

export const heading = (text, level = 2) =>
  `<!-- wp:heading${level !== 2 ? ` ${blockAttrs({ level })}` : ''} -->\n<h${level} class="wp-block-heading">${escapeHtml(text)}</h${level}>\n<!-- /wp:heading -->`;

export const list = (itemsHtml) =>
  `<!-- wp:list -->\n<ul class="wp-block-list">${itemsHtml
    .map((i) => `<!-- wp:list-item -->\n<li>${i}</li>\n<!-- /wp:list-item -->`)
    .join('\n')}</ul>\n<!-- /wp:list -->`;

// Texto plano escrito a mano → párrafos; si ya trae HTML o bloques, se deja tal cual.
export function textToBlocks(text) {
  const t = (text || '').trim();
  if (!t || /<[a-z!/]/i.test(t)) return t;
  return t.split(/\n{2,}/).map((p) => paragraph(escapeHtml(p).replace(/\n/g, '<br>'))).join('\n\n');
}

// ---- Vídeos admitidos: plataformas oficiales o tu propia biblioteca de medios ----
const PROVIDERS = [
  ['youtube', /^(www\.|m\.)?(youtube\.com|youtube-nocookie\.com|youtu\.be)$/i],
  ['vimeo', /^(www\.|player\.)?vimeo\.com$/i],
  ['dailymotion', /^(www\.)?(dailymotion\.com|dai\.ly)$/i],
];

export const ALLOWED_VIDEO_HINT = 'YouTube, Vimeo, Dailymotion o vídeos alojados en tu propio WordPress';

export function videoProvider(url, siteUrl) {
  let u;
  try { u = new URL(url); } catch { return null; }
  for (const [name, re] of PROVIDERS) if (re.test(u.hostname)) return name;
  try {
    const site = new URL(siteUrl).hostname.replace(/^www\./, '');
    const host = u.hostname.replace(/^www\./, '');
    if (host === site || host.endsWith('.' + site)) return 'self';
  } catch { /* sin sitio configurado */ }
  return null;
}

// WordPress solo convierte en reproductor las URL "normales" (watch?v=…), no las /embed/.
export function normalizeVideoUrl(url) {
  try {
    const u = new URL(url);
    const yt = u.pathname.match(/^\/(?:embed|shorts|live)\/([\w-]{6,})/);
    if (/youtube(-nocookie)?\.com$/i.test(u.hostname) && yt) return `https://www.youtube.com/watch?v=${yt[1]}`;
    const vimeo = u.hostname === 'player.vimeo.com' && u.pathname.match(/\/video\/(\d+)/);
    if (vimeo) return `https://vimeo.com/${vimeo[1]}`;
    const dm = u.pathname.match(/^\/embed\/video\/(\w+)/);
    if (/dailymotion\.com$/i.test(u.hostname) && dm) return `https://www.dailymotion.com/video/${dm[1]}`;
    return u.href;
  } catch {
    return url;
  }
}

export function videoBlock(url, provider, mediaId) {
  if (provider === 'self') {
    return `<!-- wp:video${mediaId ? ` ${blockAttrs({ id: mediaId })}` : ''} -->\n<figure class="wp-block-video"><video controls src="${escapeHtml(url)}"></video></figure>\n<!-- /wp:video -->`;
  }
  const attrs = blockAttrs({ url, type: 'video', providerNameSlug: provider, responsive: true, className: 'wp-embed-aspect-16-9 wp-has-aspect-ratio' });
  return `<!-- wp:embed ${attrs} -->\n<figure class="wp-block-embed is-type-video is-provider-${provider} wp-block-embed-${provider} wp-embed-aspect-16-9 wp-has-aspect-ratio"><div class="wp-block-embed__wrapper">\n${escapeHtml(url)}\n</div></figure>\n<!-- /wp:embed -->`;
}
