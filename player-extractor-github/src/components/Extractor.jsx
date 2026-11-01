import { useMemo, useRef, useState } from 'react';
import {
  Wand2, Trash2, FileCode2, Copy, Check, ExternalLink, Play, Film, Frame, Server, Link2,
  Search, CornerUpRight, Upload, FileText, Download, History, Activity, Loader2, RotateCcw, X,
} from 'lucide-react';
import { extract, KINDS, SAMPLE_HTML } from '../lib/extractor.js';
import { toCSV, toJSON, download, stamp } from '../lib/exporters.js';
import { checkMany } from '../lib/linkcheck.js';
import { addToHistory, clearHistory, loadHistory, removeFromHistory } from '../lib/storage.js';
import PreviewModal from './PreviewModal.jsx';

const TONES = {
  sky: 'bg-sky-500/15 text-sky-300 ring-sky-500/30',
  emerald: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
  rose: 'bg-rose-500/15 text-rose-300 ring-rose-500/30',
  amber: 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
};

const ACCEPTED_FILE = /\.(html?|xhtml|txt|json|js|xml|php)$/i;
const ACCEPTED_LABEL = '.html, .htm, .txt o .json';
const ACCEPT_ATTR = '.html,.htm,.xhtml,.txt,.json,.js,.xml,.php,text/html,text/plain,application/json';
const MAX_FILE_BYTES = 20 * 1024 * 1024;

const KIND_ICON = { iframe: Frame, direct: Film, server: Server, redirect: CornerUpRight };

const CHECK_STYLE = {
  checking: { cls: 'text-zinc-400', text: 'Comprobando…' },
  ok: { cls: 'text-emerald-400', text: 'Activo' },
  reachable: { cls: 'text-sky-300', text: 'Responde' },
  warn: { cls: 'text-amber-300', text: 'Error del servidor' },
  down: { cls: 'text-red-400', text: 'No responde' },
};

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
}

const btn = 'flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-40';

export default function Extractor() {
  const [html, setHtml] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [includeAll, setIncludeAll] = useState(false);
  const [results, setResults] = useState(null);
  const [stats, setStats] = useState(null);
  const [showDiscarded, setShowDiscarded] = useState(false);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [copied, setCopied] = useState(null);
  const [preview, setPreview] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [fileInfo, setFileInfo] = useState(null);
  const [history, setHistory] = useState(loadHistory);
  const [showHistory, setShowHistory] = useState(false);
  const [checks, setChecks] = useState({});
  const [checkingAll, setCheckingAll] = useState(false);
  const fileInputRef = useRef(null);

  const run = (source = html, sourceName = fileInfo?.names?.join(', ') || 'Texto pegado') => {
    const { items, stats } = extract(source, { baseUrl, includeAll });
    setResults(items);
    setStats(stats);
    setShowDiscarded(false);
    setFilter('all');
    setQuery('');
    setChecks({});
    if (items.length) {
      setHistory(addToHistory({
        id: Date.now(),
        date: new Date().toISOString(),
        source: sourceName,
        items: items.map(({ url, kind, server, label, origins }) => ({ url, kind, server, label, origins })),
      }));
    }
  };

  // Lee uno o varios archivos, los junta en el área de texto y extrae al instante.
  const loadFiles = async (fileList) => {
    const files = [...(fileList || [])];
    if (!files.length) return;
    const rejected = files.filter((f) => !ACCEPTED_FILE.test(f.name) || f.size > MAX_FILE_BYTES);
    const valid = files.filter((f) => !rejected.includes(f));
    if (!valid.length) {
      setFileInfo({ error: `Archivo no admitido. Usa ${ACCEPTED_LABEL} de hasta ${MAX_FILE_BYTES / 1024 / 1024} MB.` });
      return;
    }
    try {
      const texts = await Promise.all(valid.map((f) => f.text()));
      const content = texts.join('\n\n');
      setHtml(content);
      setFileInfo({
        names: valid.map((f) => f.name),
        size: valid.reduce((n, f) => n + f.size, 0),
        error: rejected.length ? `Se ignoraron ${rejected.length} archivo(s) no admitidos.` : '',
      });
      run(content, valid.map((f) => f.name).join(', '));
    } catch {
      setFileInfo({ error: 'No se pudo leer el archivo.' });
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    loadFiles(e.dataTransfer.files);
  };

  const flash = (key) => {
    setCopied(key);
    setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
  };

  const counts = useMemo(() => {
    const c = { all: 0, server: 0, redirect: 0, iframe: 0, direct: 0 };
    (results || []).forEach((r) => { c.all++; c[r.kind]++; });
    return c;
  }, [results]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (results || []).filter((r) =>
      (filter === 'all' || r.kind === filter) &&
      (!q || r.url.toLowerCase().includes(q) || (r.server || '').toLowerCase().includes(q) || r.label.toLowerCase().includes(q))
    );
  }, [results, filter, query]);

  const copyAll = async () => {
    await copyText(visible.map((r) => r.url).join('\n'));
    flash('all');
  };

  const setCheck = (url, result) => setChecks((c) => ({ ...c, [url]: result }));

  const checkAll = async () => {
    setCheckingAll(true);
    await checkMany(visible.map((r) => r.url), setCheck);
    setCheckingAll(false);
  };

  const restore = (entry) => {
    setResults(entry.items.map((it, i) => ({ id: i + 1, label: '', origins: [], ...it })));
    setStats(null);
    setChecks({});
    setFilter('all');
    setQuery('');
    setShowHistory(false);
  };

  return (
    <>
      {/* Entrada */}
      <section
        className={`relative rounded-2xl border bg-zinc-900/60 p-4 transition sm:p-5 ${dragging ? 'border-rose-500/70 ring-4 ring-rose-500/15' : 'border-zinc-800'}`}
        onDragEnter={(e) => { e.preventDefault(); setDragging(true); }}
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false); }}
        onDrop={onDrop}
      >
        {dragging && (
          <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-2xl bg-zinc-950/85 backdrop-blur-sm">
            <div className="text-center">
              <Upload size={36} className="mx-auto mb-3 text-rose-400" />
              <p className="font-semibold">Suelta el archivo para extraer los reproductores</p>
              <p className="mt-1 text-sm text-zinc-400">{ACCEPTED_LABEL}</p>
            </div>
          </div>
        )}

        {/* Importar archivo */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputRef.current?.click(); } }}
          className="mb-4 flex cursor-pointer flex-col items-center gap-3 rounded-xl border border-dashed border-zinc-700 bg-zinc-950/60 px-4 py-5 text-center transition hover:border-rose-500/60 hover:bg-zinc-950 sm:flex-row sm:text-left"
        >
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-rose-500/15 text-rose-300">
            <Upload size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-zinc-200">Arrastra aquí un archivo o haz clic para subirlo</p>
            <p className="text-xs text-zinc-500">
              {ACCEPTED_LABEL} · hasta {MAX_FILE_BYTES / 1024 / 1024} MB · se analiza al instante (también varios a la vez)
            </p>
          </div>
          <span className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300">Seleccionar archivo</span>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPT_ATTR}
            className="hidden"
            onChange={(e) => { loadFiles(e.target.files); e.target.value = ''; }}
          />
        </div>

        {fileInfo && (
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
            {fileInfo.names?.map((n) => (
              <span key={n} className="inline-flex items-center gap-1.5 rounded-md bg-zinc-800 px-2 py-1 text-zinc-300">
                <FileText size={12} /> {n}
              </span>
            ))}
            {fileInfo.size != null && <span className="text-zinc-500">{(fileInfo.size / 1024).toFixed(1)} KB</span>}
            {fileInfo.error && <span className="text-amber-300">{fileInfo.error}</span>}
          </div>
        )}

        <div className="mb-2 flex items-center justify-between">
          <label htmlFor="html" className="text-sm font-medium text-zinc-300">…o pega el código HTML / JSON</label>
          <span className="text-xs text-zinc-500">{html.length.toLocaleString('es')} caracteres</span>
        </div>
        <textarea
          id="html"
          value={html}
          onChange={(e) => setHtml(e.target.value)}
          onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') run(); }}
          placeholder="Pega aquí el HTML de la página (Ctrl+U o DevTools → Elements → Copy outerHTML) o la respuesta JSON de su API de reproductores…"
          spellCheck={false}
          className="h-72 w-full resize-y rounded-xl border border-zinc-800 bg-zinc-950 p-4 font-mono text-xs leading-relaxed text-zinc-200 placeholder:text-zinc-600 focus:border-rose-500/60 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
        />

        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
          <div className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950 px-3">
            <Link2 size={16} className="shrink-0 text-zinc-500" />
            <input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="URL de la página (opcional, para resolver rutas relativas)"
              className="w-full bg-transparent py-2.5 text-sm placeholder:text-zinc-600 focus:outline-none"
            />
          </div>
          <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-zinc-400">
            <input type="checkbox" checked={includeAll} onChange={(e) => setIncludeAll(e.target.checked)} className="h-4 w-4 accent-rose-500" />
            Incluir posibles reproductores desconocidos
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={() => run()}
            disabled={!html.trim()}
            className="flex items-center gap-2 rounded-xl bg-rose-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-rose-500/20 transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Wand2 size={16} /> Extraer Reproductores y Enlaces
          </button>
          <button onClick={() => { setHtml(SAMPLE_HTML); setFileInfo(null); }} className="flex items-center gap-2 rounded-xl border border-zinc-700 px-4 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800">
            <FileCode2 size={16} /> Cargar ejemplo
          </button>
          <button
            onClick={() => { setHtml(''); setResults(null); setStats(null); setFileInfo(null); setChecks({}); }}
            className="flex items-center gap-2 rounded-xl border border-zinc-700 px-4 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            <Trash2 size={16} /> Limpiar
          </button>
          <button
            onClick={() => setShowHistory((s) => !s)}
            className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm hover:bg-zinc-800 ${showHistory ? 'border-zinc-500 text-zinc-100' : 'border-zinc-700 text-zinc-300'}`}
          >
            <History size={16} /> Historial <span className="opacity-60">{history.length}</span>
          </button>
          <span className="ml-auto hidden self-center text-xs text-zinc-600 sm:block">Ctrl + Enter para extraer</span>
        </div>

        {/* Historial de análisis */}
        {showHistory && (
          <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
            {history.length === 0 ? (
              <p className="px-1 py-2 text-sm text-zinc-500">Aún no hay análisis guardados. Se guardan aquí, en este navegador, los últimos 15 con resultados.</p>
            ) : (
              <>
                <ul className="scroll-thin max-h-64 space-y-1 overflow-auto">
                  {history.map((h) => (
                    <li key={h.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-zinc-900">
                      <span className="w-32 shrink-0 text-xs text-zinc-500">{new Date(h.date).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' })}</span>
                      <span className="min-w-0 flex-1 truncate text-zinc-300">{h.source}</span>
                      <span className="shrink-0 text-xs text-zinc-500">{h.items.length} enlaces</span>
                      <button onClick={() => restore(h)} className={btn} title="Volver a ver estos resultados"><RotateCcw size={13} /> Cargar</button>
                      <button onClick={() => setHistory(removeFromHistory(h.id))} className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200" title="Borrar del historial"><X size={14} /></button>
                    </li>
                  ))}
                </ul>
                <button onClick={() => setHistory(clearHistory())} className="mt-2 px-2 text-xs text-zinc-500 underline underline-offset-2 hover:text-zinc-300">Vaciar historial</button>
              </>
            )}
          </div>
        )}
      </section>

      {/* Resultados */}
      {results && (
        <section className="mt-8">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {[['all', 'Todos'], ...Object.entries(KINDS).map(([k, v]) => [k, v.label])].map(([key, label]) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`rounded-full px-3.5 py-1.5 text-sm transition ${filter === key ? 'bg-zinc-100 font-semibold text-zinc-900' : 'bg-zinc-900 text-zinc-400 ring-1 ring-zinc-800 hover:text-zinc-200'}`}
              >
                {label} <span className="ml-1 opacity-60">{counts[key]}</span>
              </button>
            ))}
            <div className="ml-auto flex w-full items-center gap-2 sm:w-auto">
              <div className="flex flex-1 items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 px-3 sm:w-56 sm:flex-none">
                <Search size={14} className="text-zinc-500" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filtrar…" className="w-full bg-transparent py-2 text-sm focus:outline-none" />
              </div>
              <button
                onClick={copyAll}
                disabled={!visible.length}
                className="flex shrink-0 items-center gap-2 rounded-xl bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-white disabled:opacity-40"
              >
                {copied === 'all' ? <Check size={16} /> : <Copy size={16} />}
                {copied === 'all' ? '¡Copiados!' : `Copiar todos los reproductores (${visible.length})`}
              </button>
            </div>
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-2">
            <button onClick={() => download(toJSON(visible), `reproductores-${stamp()}.json`, 'application/json')} disabled={!visible.length} className={btn}>
              <Download size={14} /> Exportar JSON
            </button>
            <button onClick={() => download(toCSV(visible), `reproductores-${stamp()}.csv`, 'text/csv;charset=utf-8')} disabled={!visible.length} className={btn}>
              <Download size={14} /> Exportar CSV
            </button>
            <button onClick={checkAll} disabled={!visible.length || checkingAll} className={btn}>
              {checkingAll ? <Loader2 size={14} className="animate-spin" /> : <Activity size={14} />}
              {checkingAll ? 'Comprobando…' : 'Comprobar todos'}
            </button>
            <span className="text-xs text-zinc-600">Exporta y comprueba lo que se ve con el filtro actual.</span>
          </div>

          {stats && (
            <div className="mb-4 space-y-2 text-xs">
              {stats.ajaxOptions > 0 && (
                <p className="rounded-xl bg-amber-500/10 px-4 py-3 text-amber-200 ring-1 ring-amber-500/20">
                  Hay {stats.ajaxOptions} opciones de reproductor que la web carga por AJAX al hacer clic: su enlace no está en este HTML.
                  Abre la página, pulsa cada opción y copia el HTML desde DevTools → Elements (o el iframe que aparezca).
                </p>
              )}
              {stats.relativeSkipped > 0 && (
                <p className="rounded-xl bg-amber-500/10 px-4 py-3 text-amber-200 ring-1 ring-amber-500/20">
                  {stats.relativeSkipped} iframe(s) usan rutas relativas y no se pudieron resolver. Escribe la URL de la página en el campo de arriba.
                </p>
              )}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-zinc-500">
                {stats.base && <span>URL base: <span className="font-mono text-zinc-400">{stats.base}</span></span>}
                {stats.discarded.length > 0 && (
                  <button onClick={() => setShowDiscarded((s) => !s)} className="underline decoration-zinc-700 underline-offset-2 hover:text-zinc-300">
                    {stats.discarded.length} imágenes descartadas {showDiscarded ? '(ocultar)' : '(ver)'}
                  </button>
                )}
              </div>
              {showDiscarded && (
                <ul className="scroll-thin max-h-48 overflow-auto rounded-xl border border-zinc-800 bg-zinc-950 p-3 font-mono text-zinc-500">
                  {stats.discarded.map((d) => <li key={d.url} className="break-all">{d.url}</li>)}
                </ul>
              )}
            </div>
          )}

          {visible.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-800 p-10 text-center text-sm text-zinc-500">
              {results.length === 0
                ? 'No se encontraron reproductores. Muchas webs cargan los servidores con JavaScript al pulsar una opción: copia el HTML desde DevTools (Elements) después de hacer clic en el reproductor, o activa “Incluir posibles reproductores desconocidos”.'
                : 'Ningún resultado coincide con el filtro.'}
            </div>
          ) : (
            <ul className="space-y-2.5">
              {visible.map((r) => {
                const kind = KINDS[r.kind];
                const Icon = KIND_ICON[r.kind];
                const check = checks[r.url];
                return (
                  <li key={r.url} className="group rounded-xl border border-zinc-800 bg-zinc-900/60 p-3.5 transition hover:border-zinc-700 sm:p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                      <div className="min-w-0 flex-1">
                        <div className="mb-1.5 flex flex-wrap items-center gap-2">
                          <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ${TONES[kind.tone]}`}>
                            <Icon size={12} /> {kind.label}
                          </span>
                          {r.server && <span className="text-sm font-semibold text-zinc-100">{r.server}</span>}
                          {r.label && <span className="truncate text-xs text-zinc-400">· {r.label}</span>}
                          {r.origins.length > 0 && <span className="text-xs text-zinc-600">desde {r.origins.join(', ')}</span>}
                          {check && (
                            <span className={`text-xs font-medium ${CHECK_STYLE[check.state].cls}`} title={check.detail}>
                              ● {CHECK_STYLE[check.state].text}{check.detail?.startsWith('HTTP') ? ` (${check.detail})` : ''}
                            </span>
                          )}
                        </div>
                        <p className="break-all font-mono text-xs text-zinc-300">{r.url}</p>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-1.5">
                        <button onClick={async () => { await copyText(r.url); flash(r.url); }} className={btn} title="Copiar enlace individual">
                          {copied === r.url ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                          {copied === r.url ? 'Copiado' : 'Copiar'}
                        </button>
                        <button onClick={() => setPreview(r)} className={btn} title="Probar el reproductor aquí">
                          <Play size={14} /> Probar
                        </button>
                        <button
                          onClick={() => checkMany([r.url], setCheck)}
                          disabled={check?.state === 'checking'}
                          className={btn}
                          title="Comprobar si el enlace responde"
                        >
                          <Activity size={14} /> Comprobar
                        </button>
                        <a href={r.url} target="_blank" rel="noopener noreferrer" className={btn} title="Abrir en pestaña nueva">
                          <ExternalLink size={14} /> Abrir
                        </a>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {Object.values(checks).some((c) => c.state === 'reachable') && (
            <p className="mt-3 text-xs text-zinc-600">
              “Responde” significa que el servidor contesta, pero el navegador no deja ver si el vídeo concreto sigue existiendo (falta permiso CORS). Para estar seguro, usa “Probar”.
            </p>
          )}
        </section>
      )}

      {preview && <PreviewModal item={preview} onClose={() => setPreview(null)} />}
    </>
  );
}
