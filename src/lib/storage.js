// Ajustes e historial guardados en este navegador (localStorage puede fallar: modo privado, etc.).
import { DEFAULT_THEME } from './theme.js';

const SETTINGS_KEY = 'pe:settings';
const HISTORY_KEY = 'pe:history';
const HISTORY_MAX = 15;

export const DEFAULT_SETTINGS = {
  remember: true,
  wp: { siteUrl: '', username: '', appPassword: '', authType: 'app-password', apiMode: 'pretty', connectedAs: '' },
  tmdb: { token: '', language: 'es-ES', region: 'ES' },
  theme: DEFAULT_THEME,
};

const read = (key) => {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
};
const write = (key, value) => {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch { /* almacenamiento no disponible */ }
};

export function mergeSettings(saved = {}) {
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    wp: { ...DEFAULT_SETTINGS.wp, ...saved.wp },
    tmdb: { ...DEFAULT_SETTINGS.tmdb, ...saved.tmdb },
    theme: { ...DEFAULT_THEME, ...saved.theme },
  };
}

export const loadSettings = () => mergeSettings(read(SETTINGS_KEY) || {});

// Si "Recordar" está desactivado, los datos solo viven mientras la pestaña esté abierta.
export function saveSettings(settings) {
  write(SETTINGS_KEY, settings.remember ? settings : null);
  saveSharedSettings(settings.remember ? settings : null);
}

// ---- Ajustes compartidos en config/ajustes.json (los sirve el servidor de la app) ----

// Devuelve los ajustes del archivo, o null si no hay archivo o la app no tiene servidor (p. ej. dist/ abierto a mano).
export async function loadSharedSettings() {
  try {
    const res = await fetch('/api/settings', { cache: 'no-store' });
    if (!res.ok) return null;
    return mergeSettings(await res.json());
  } catch {
    return null;
  }
}

function saveSharedSettings(settings) {
  fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) })
    .catch(() => { /* sin servidor: se queda solo en este navegador */ });
}

// Últimas fichas publicadas o actualizadas desde la app (solo enlaces, nada de credenciales).
const PUBLISHED_KEY = 'pe:published';
const PUBLISHED_MAX = 30;

export const loadPublished = () => read(PUBLISHED_KEY) || [];

export function addPublished(entry) {
  const list = [{ date: new Date().toISOString(), ...entry }, ...loadPublished().filter((p) => !(p.id === entry.id && p.site === entry.site))].slice(0, PUBLISHED_MAX);
  write(PUBLISHED_KEY, list);
  window.dispatchEvent(new Event('pe:published'));
  return list;
}

export function clearPublished() {
  write(PUBLISHED_KEY, null);
  window.dispatchEvent(new Event('pe:published'));
  return [];
}

export const loadHistory = () => read(HISTORY_KEY) || [];

export function addToHistory(entry) {
  const list = [entry, ...loadHistory()].slice(0, HISTORY_MAX);
  write(HISTORY_KEY, list);
  return list;
}

export function removeFromHistory(id) {
  const list = loadHistory().filter((h) => h.id !== id);
  write(HISTORY_KEY, list);
  return list;
}

export function clearHistory() {
  write(HISTORY_KEY, null);
  return [];
}
