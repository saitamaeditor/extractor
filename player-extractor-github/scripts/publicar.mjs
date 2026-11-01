#!/usr/bin/env node
// Publica en WordPress fichas de TMDB (en castellano) a partir de IDs de IMDb, sin abrir la app.
// Usa los mismos ajustes que la app: config/ajustes.json (se crea al guardar Ajustes en la app).
//
//   npm run publicar -- tt0133093 tt7366338
//   npm run publicar -- --archivo=ids.txt --estado=publish
//
// Opciones:
//   --estado=draft|pending|publish   Estado de lo que se crea (por defecto: draft)
//   --sin-episodios                  En las series, no crear temporadas ni episodios
//   --actualizar                     Si ya existe, actualizar sus datos (y añadir lo que falte) en vez de saltarla
//   --archivo=ruta                   Leer los IDs de un archivo de texto (uno por línea o como sea)
//   --simular                        Solo mostrar qué haría, sin tocar la web

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { mergeSettings } from '../src/lib/storage.js';
import { buildDraft, findByImdb, getDetails } from '../src/lib/tmdb.js';
import { typeForKind } from '../src/lib/theme.js';
import { categoryLabel } from '../src/lib/categories.js';
import { findExisting, publishDraft, summaryTitle } from '../src/lib/publish.js';

const SETTINGS_FILE = fileURLToPath(new URL('../config/ajustes.json', import.meta.url));
const STATUSES = [['draft', 'Borrador'], ['pending', 'Pendiente de revisión'], ['publish', 'Publicado']];

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => args.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=') ?? fallback;

const status = option('estado', 'draft');
const dryRun = flag('simular');
const update = flag('actualizar');
const withEpisodes = !flag('sin-episodios');

let text = args.filter((a) => !a.startsWith('--')).join('\n');
const file = option('archivo');
if (file) text += '\n' + fs.readFileSync(file, 'utf8');
const ids = [...new Set(text.match(/\btt\d{6,10}\b/g) || [])];

const fail = (msg) => { console.error(`✖ ${msg}`); process.exit(1); };

if (!ids.length) fail('No hay IDs de IMDb. Ejemplo: npm run publicar -- tt0133093');
if (!STATUSES.some(([s]) => s === status)) fail(`Estado no válido: ${status} (usa draft, pending o publish)`);
if (!fs.existsSync(SETTINGS_FILE)) fail('No encuentro config/ajustes.json. Abre la app, revisa Ajustes y pulsa Guardar para crearlo.');

const settings = mergeSettings(JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')));
if (!settings.wp.siteUrl || !settings.wp.appPassword) fail('Faltan los datos de conexión con WordPress en los ajustes.');
if (!settings.tmdb.token) fail('Falta la clave de TMDB en los ajustes.');
if (!settings.theme.enabled) fail('La estructura del theme no está activa: todo iría a Entradas. Actívala en Ajustes → Theme.');

const types = settings.theme.types.length ? settings.theme.types : [{ slug: 'post', restBase: 'posts', name: 'Entradas', taxonomies: ['category', 'post_tag'] }];
const opts = { ...settings.tmdb, language: 'es-ES' };

console.log(`${dryRun ? '[SIMULACIÓN] ' : ''}${ids.length} ID(s) · estado: ${status} · ${settings.wp.siteUrl}\n`);
const tally = { done: 0, updated: 0, skipped: 0, error: 0 };

for (const id of ids) {
  process.stdout.write(`${id}  `);
  try {
    const found = await findByImdb(id, opts);
    if (!found) throw new Error('TMDB no tiene este ID');
    const details = await getDetails(found.id, found.type, opts);
    const draft = buildDraft(details, found.type, opts);
    const restBase = typeForKind(settings.theme, found.type);
    process.stdout.write(`${draft.title} [${found.type === 'tv' ? 'serie' : 'película'} · ${categoryLabel(draft.category)}]  `);

    const dup = await findExisting({ settings, restBase, form: draft });
    if (dup && !update) {
      tally.skipped++;
      console.log(`→ ya existe (ID ${dup.id}), se salta. Usa --actualizar para refrescarla.`);
      continue;
    }
    if (dryRun) {
      console.log(dup ? `→ se actualizaría la ID ${dup.id}` : `→ se crearía en ${restBase}`);
      continue;
    }

    const res = await publishDraft({
      settings, types, restBase,
      status: dup ? dup.status : status,
      form: { ...draft, sendMeta: true },
      existingId: dup?.id || null,
      createEpisodes: found.type === 'tv' && withEpisodes,
      selectedSeasons: draft.seasons.map((s) => s.number),
    });
    dup ? tally.updated++ : tally.done++;
    console.log(`→ ${summaryTitle(res, STATUSES)} · ${res.post.link}${res.warnings.length ? `\n    ⚠ ${res.warnings.join(' · ')}` : ''}`);
  } catch (e) {
    tally.error++;
    console.log(`→ ✖ ${e.status ? `${e.message} (HTTP ${e.status})` : e.message}`);
    if ([401, 403].includes(e.status) || e.code === 'network') fail('Se detiene: sin permisos o sin conexión con WordPress.');
  }
}

console.log(`\nCreadas: ${tally.done} · Actualizadas: ${tally.updated} · Ya existían: ${tally.skipped} · Errores: ${tally.error}`);
process.exit(tally.error ? 1 : 0);
