import { useMemo, useRef, useState } from 'react';
import { ArrowLeft, Loader2, Play, Square, CheckCircle2, XCircle, SkipForward, Clock, ExternalLink, Pencil, Film, Tv } from 'lucide-react';
import { buildDraft, findByImdb, getDetails } from '../lib/tmdb.js';
import { typeForKind } from '../lib/theme.js';
import { categoryLabel } from '../lib/categories.js';
import { findExisting, publishDraft, summaryTitle } from '../lib/publish.js';
import { addPublished } from '../lib/storage.js';

const input = 'w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm placeholder:text-zinc-600 focus:border-rose-500/60 focus:outline-none disabled:opacity-40';
const smallBtn = 'flex items-center gap-1 rounded-lg border border-zinc-700 px-2 py-1 text-[11px] text-zinc-300 hover:bg-zinc-800';
const STATUSES = [['draft', 'Borrador'], ['pending', 'Pendiente de revisión'], ['publish', 'Publicado']];

const STATE = {
  waiting: { Icon: Clock, cls: 'text-zinc-500', text: 'En cola' },
  working: { Icon: Loader2, cls: 'text-sky-300', text: 'Trabajando…', spin: true },
  done: { Icon: CheckCircle2, cls: 'text-emerald-400', text: 'Hecho' },
  skipped: { Icon: SkipForward, cls: 'text-amber-300', text: 'Ya existía' },
  error: { Icon: XCircle, cls: 'text-red-400', text: 'Error' },
};

// Todos los IDs de IMDb del texto (sueltos, en enlaces, separados por comas o líneas), sin repetir.
const parseIds = (text) => [...new Set(String(text).match(/\btt\d{6,10}\b/g) || [])];

export default function BatchImport({ settings, types, onClose, onOpenSettings, notify }) {
  const { theme } = settings;
  const [text, setText] = useState('');
  const [status, setStatus] = useState('draft');
  const [withEpisodes, setWithEpisodes] = useState(true);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [rows, setRows] = useState([]);
  const [running, setRunning] = useState(false);
  const stopRef = useRef(false);

  const ids = useMemo(() => parseIds(text), [text]);
  const opts = { ...settings.tmdb, language: 'es-ES' };
  const counts = rows.reduce((c, r) => ({ ...c, [r.state]: (c[r.state] || 0) + 1 }), {});

  const update = (id, patch) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const run = async () => {
    if (!theme.enabled) {
      notify({ type: 'warning', title: 'Activa primero la estructura del theme', message: 'Sin ella, todo se publicaría como entradas normales.' });
      onOpenSettings('theme');
      return;
    }
    stopRef.current = false;
    setRunning(true);
    setRows(ids.map((id) => ({ id, state: 'waiting', step: '' })));
    const tally = { done: 0, skipped: 0, error: 0 };

    for (const id of ids) {
      if (stopRef.current) break;
      update(id, { state: 'working', step: 'Buscando en TMDB…' });
      try {
        const found = await findByImdb(id, opts);
        if (!found) throw new Error('TMDB no tiene este ID');
        const details = await getDetails(found.id, found.type, opts);
        const draft = buildDraft(details, found.type, opts);
        const restBase = typeForKind(theme, found.type);
        update(id, { title: draft.title, kind: found.type, category: draft.category, step: 'Comprobando duplicados…' });

        if (skipDuplicates) {
          const dup = await findExisting({ settings, restBase, form: draft });
          if (dup) {
            update(id, { state: 'skipped', step: `ID ${dup.id} (${dup.status})`, link: dup.link, edit: dup.editUrl });
            tally.skipped++;
            continue;
          }
        }

        const res = await publishDraft({
          settings, types, restBase, status,
          form: { ...draft, sendMeta: true },
          createEpisodes: found.type === 'tv' && withEpisodes && Boolean(theme.episodeType),
          selectedSeasons: draft.seasons.map((s) => s.number),
          onStep: (step) => update(id, { step }),
          onProgress: ({ done, total }) => update(id, { step: `Temporadas y episodios: ${done}/${total}` }),
          shouldStop: () => stopRef.current,
        });
        addPublished({ site: settings.wp.siteUrl, id: res.post.id, title: draft.title, kind: found.type, status: res.post.status, link: res.post.link, edit: res.editUrl, action: 'create' });
        update(id, {
          state: 'done',
          step: summaryTitle(res, STATUSES) + (res.warnings.length ? ` · ${res.warnings.join(' · ')}` : ''),
          link: res.post.link,
          edit: res.editUrl,
        });
        tally.done++;
      } catch (e) {
        tally.error++;
        update(id, { state: 'error', step: e.status ? `${e.message} (HTTP ${e.status})` : e.message });
        // Sin permisos o sin conexión: el resto fallaría igual.
        if ([401, 403].includes(e.status) || e.code === 'network') {
          stopRef.current = true;
          notify({ type: 'error', title: 'Importación detenida', message: e.message });
        }
      }
    }

    setRunning(false);
    notify({
      type: tally.error ? 'warning' : 'success',
      title: `Lote terminado: ${tally.done} ${tally.done === 1 ? 'creado' : 'creados'}`,
      message: [tally.skipped && `${tally.skipped} ya existían`, tally.error && `${tally.error} con error`].filter(Boolean).join(' · ') || undefined,
    });
  };

  return (
    <section className="space-y-5 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 sm:p-5">
      <div className="flex items-center gap-3">
        <button onClick={onClose} disabled={running} className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white disabled:opacity-40" title="Volver al publicador"><ArrowLeft size={18} /></button>
        <div>
          <h2 className="font-semibold">Importar varios IDs de IMDb</h2>
          <p className="text-xs text-zinc-500">Cada ID se busca en TMDB en castellano y se publica uno detrás de otro, con su categoría detectada.</p>
        </div>
      </div>

      <div>
        <textarea
          rows={6}
          className={`${input} font-mono text-xs`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={running}
          placeholder={'Pega IDs o enlaces de IMDb, uno por línea o separados por comas:\ntt0133093\nhttps://www.imdb.com/title/tt7366338/'}
        />
        <p className="mt-1 text-xs text-zinc-500">{ids.length} {ids.length === 1 ? 'ID detectado' : 'IDs detectados'} (los repetidos se cuentan una vez).</p>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
        <label className="flex items-center gap-2 text-zinc-300">
          Estado
          <select className={`${input} w-48 py-2`} value={status} onChange={(e) => setStatus(e.target.value)} disabled={running}>
            {STATUSES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs text-zinc-400">
          <input type="checkbox" className="accent-rose-500" checked={withEpisodes} disabled={running || !theme.episodeType} onChange={(e) => setWithEpisodes(e.target.checked)} />
          En las series, crear temporadas y episodios
        </label>
        <label className="flex items-center gap-2 text-xs text-zinc-400">
          <input type="checkbox" className="accent-rose-500" checked={skipDuplicates} disabled={running} onChange={(e) => setSkipDuplicates(e.target.checked)} />
          Saltar los que ya estén en la web
        </label>
        <div className="ml-auto flex gap-2">
          {running ? (
            <button onClick={() => { stopRef.current = true; }} className="flex items-center gap-2 rounded-xl border border-zinc-700 px-4 py-2.5 text-sm hover:bg-zinc-800">
              <Square size={14} /> Detener al terminar el actual
            </button>
          ) : (
            <button onClick={run} disabled={!ids.length} className="flex items-center gap-2 rounded-xl bg-rose-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-rose-400 disabled:opacity-40">
              <Play size={15} /> Importar {ids.length || ''}
            </button>
          )}
        </div>
      </div>

      {rows.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-zinc-500">
            {counts.done || 0} creados · {counts.skipped || 0} ya existían · {counts.error || 0} con error · {(counts.waiting || 0) + (counts.working || 0)} pendientes
          </p>
          <ul className="divide-y divide-zinc-800 overflow-hidden rounded-xl border border-zinc-800">
            {rows.map((r) => {
              const st = STATE[r.state];
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-3 bg-zinc-950/50 px-3 py-2.5 text-sm">
                  <st.Icon size={16} className={`shrink-0 ${st.cls} ${st.spin ? 'animate-spin' : ''}`} />
                  <span className="w-24 shrink-0 font-mono text-xs text-zinc-500">{r.id}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 font-medium text-zinc-200">
                      {r.kind && (r.kind === 'movie' ? <Film size={12} className="text-zinc-500" /> : <Tv size={12} className="text-zinc-500" />)}
                      {r.title || '—'}
                      {r.category && <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-normal text-zinc-400">{categoryLabel(r.category)}</span>}
                    </span>
                    <span className={`block truncate text-xs ${r.state === 'error' ? 'text-red-300' : 'text-zinc-500'}`}>{st.text}{r.step ? ` · ${r.step}` : ''}</span>
                  </span>
                  {r.link && <a href={r.link} target="_blank" rel="noopener noreferrer" className={smallBtn}><ExternalLink size={11} /> Ver</a>}
                  {r.edit && <a href={r.edit} target="_blank" rel="noopener noreferrer" className={smallBtn}><Pencil size={11} /> Editar</a>}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
