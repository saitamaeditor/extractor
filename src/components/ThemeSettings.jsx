import { useRef, useState } from 'react';
import { RefreshCw, Download, Search, Loader2, Upload } from 'lucide-react';
import { createClient } from '../lib/wordpress.js';
import { download } from '../lib/exporters.js';
import { companionPlugin, EPISODE_FIELD_DEFS, FIELD_DEFS, SEASON_FIELD_DEFS, TAXONOMY_DEFS, TEMPLATE_HELP } from '../lib/theme.js';
import { CATEGORY_DEFS, DEFAULT_CATEGORY_MAP } from '../lib/categories.js';

const input = 'w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm placeholder:text-zinc-600 focus:border-rose-500/60 focus:outline-none disabled:opacity-40';
const label = 'mb-1.5 block text-xs font-medium text-zinc-400';
const h3 = 'text-xs font-semibold uppercase tracking-wider text-zinc-500';

function FieldTable({ defs, mapping, onChange }) {
  return (
    <div className="grid gap-x-3 gap-y-1.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {defs.map(([key, text]) => (
        <label key={key} className="contents">
          <span className="self-center truncate text-xs text-zinc-400" title={key}>{text}</span>
          <input
            className={`${input} font-mono text-xs`}
            placeholder="clave del campo (vacío = no enviar)"
            value={mapping[key] || ''}
            onChange={(e) => onChange({ ...mapping, [key]: e.target.value })}
          />
        </label>
      ))}
    </div>
  );
}

export default function ThemeSettings({ wp, theme, onChange }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [probe, setProbe] = useState({ type: theme.movieType, id: '' });
  const [probeResult, setProbeResult] = useState(null);
  const [importedName, setImportedName] = useState('');
  const importRef = useRef(null);

  const set = (patch) => onChange({ ...theme, ...patch });
  const types = theme.types.length ? theme.types : [{ slug: 'post', restBase: 'posts', name: 'Entradas', taxonomies: ['category', 'post_tag'] }];
  const typeOptions = types.map((t) => <option key={t.restBase} value={t.restBase}>{t.name} ({t.slug})</option>);

  // Taxonomías que admite alguno de los tipos elegidos para películas o series.
  const slugsOf = (...rbs) => types.filter((t) => rbs.includes(t.restBase)).map((t) => t.slug);
  const mainTaxonomies = theme.taxonomyList.filter((t) => t.types.some((ty) => slugsOf(theme.movieType, theme.seriesType).includes(ty)));
  const episodeTaxonomies = theme.taxonomyList.filter((t) => t.types.some((ty) => slugsOf(theme.episodeType).includes(ty)));

  const loadStructure = async () => {
    setLoading(true);
    setError('');
    try {
      const client = createClient(wp);
      const [typesList, taxonomyList] = await Promise.all([client.postTypes(), client.taxonomies()]);
      set({ types: typesList, taxonomyList });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // Muestra los campos y términos de una entrada ya creada con el theme, para saber qué claves usa.
  const inspect = async () => {
    setLoading(true);
    setError('');
    setProbeResult(null);
    try {
      const post = await createClient(wp).getPost(probe.type, probe.id.trim());
      const taxonomies = theme.taxonomyList.filter((t) => Array.isArray(post[t.restBase])).map((t) => `${t.name} → ${t.restBase}: [${post[t.restBase].join(', ')}]`);
      setProbeResult({ title: post.title?.raw || post.title?.rendered || `#${post.id}`, meta: Object.entries(post.meta || {}), taxonomies, parent: post.parent });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // La configuración del theme no lleva credenciales: se puede pasar tal cual a otro navegador.
  const exportConfig = () => download(JSON.stringify({ app: 'publicador-theme', version: 1, theme }, null, 2), 'configuracion-theme.json', 'application/json');

  const importConfig = async (file) => {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const imported = parsed?.app === 'publicador-theme' ? parsed.theme : parsed;
      if (!imported || typeof imported !== 'object' || !('movieType' in imported)) throw new Error('El archivo no es una configuración del theme.');
      onChange({ ...theme, ...imported });
      setError('');
      setImportedName(file.name);
    } catch (e) {
      setError(e.message || 'No se pudo leer el archivo.');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 text-xs">
        <span className="flex-1 text-zinc-400">
          ¿Usas la app en otro navegador? Exporta esta configuración e impórtala allí (no incluye contraseñas ni claves).
          {importedName && <span className="mt-1 block text-emerald-400">Importada “{importedName}”. Pulsa Guardar para aplicarla.</span>}
        </span>
        <button onClick={exportConfig} className="flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1.5 hover:bg-zinc-800"><Download size={13} /> Exportar</button>
        <button onClick={() => importRef.current?.click()} className="flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1.5 hover:bg-zinc-800"><Upload size={13} /> Importar</button>
        <input ref={importRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => { importConfig(e.target.files?.[0]); e.target.value = ''; }} />
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input type="checkbox" className="h-4 w-4 accent-rose-500" checked={theme.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
        Publicar con la estructura de mi theme (MovieEngine u otro)
      </label>

      <div className={theme.enabled ? 'space-y-5' : 'pointer-events-none space-y-5 opacity-40'}>
        <button onClick={loadStructure} disabled={loading} className="flex items-center gap-2 rounded-xl border border-zinc-700 px-4 py-2 text-sm hover:bg-zinc-800 disabled:opacity-40">
          {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Cargar tipos y taxonomías del sitio
        </button>
        {theme.types.length > 0 && <p className="-mt-3 text-xs text-zinc-500">{theme.types.length} tipos y {theme.taxonomyList.length} taxonomías cargados.</p>}
        {error && <p className="rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-200 ring-1 ring-red-500/20">{error}</p>}

        {/* Tipos de contenido */}
        <section className="space-y-3">
          <h3 className={h3}>Tipos de contenido</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <div><label className={label}>Películas</label><select className={input} value={theme.movieType} onChange={(e) => set({ movieType: e.target.value })}>{typeOptions}</select></div>
            <div><label className={label}>Series</label><select className={input} value={theme.seriesType} onChange={(e) => set({ seriesType: e.target.value })}>{typeOptions}</select></div>
            <div>
              <label className={label}>Episodios</label>
              <select className={input} value={theme.episodeType} onChange={(e) => set({ episodeType: e.target.value })}>
                <option value="">— No crear episodios —</option>
                {typeOptions}
              </select>
            </div>
          </div>
        </section>

        {/* Temporadas y episodios */}
        {theme.episodeType && (
          <section className="space-y-3">
            <h3 className={h3}>Temporadas y episodios</h3>
            <div>
              <label className={label}>Título de cada episodio</label>
              <input className={`${input} font-mono text-xs`} value={theme.episodeTitleTemplate} onChange={(e) => set({ episodeTitleTemplate: e.target.value })} />
              <p className="mt-1 text-xs text-zinc-600">Variables: {TEMPLATE_HELP} (las terminadas en 2 llevan cero delante: 01, 02…)</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={label}>Temporada</label>
                <select className={input} value={theme.seasonMode} onChange={(e) => set({ seasonMode: e.target.value })}>
                  <option value="post">Entrada propia por temporada (MovieEngine)</option>
                  <option value="meta">Número en un campo personalizado</option>
                  <option value="taxonomy">Término de una taxonomía</option>
                </select>
              </div>
              {theme.seasonMode === 'post' && (
                <div>
                  <label className={label}>Tipo de las temporadas</label>
                  <select className={input} value={theme.seasonType} onChange={(e) => set({ seasonType: e.target.value })}>
                    <option value="">— Elegir —</option>
                    {typeOptions}
                  </select>
                </div>
              )}
              {theme.seasonMode === 'taxonomy' && (
                <div>
                  <label className={label}>Taxonomía de temporadas</label>
                  <select className={input} value={theme.seasonTaxonomy} onChange={(e) => set({ seasonTaxonomy: e.target.value })}>
                    <option value="">— Elegir —</option>
                    {episodeTaxonomies.map((t) => <option key={t.restBase} value={t.restBase}>{t.name} ({t.slug})</option>)}
                  </select>
                </div>
              )}
            </div>
            {theme.seasonMode === 'post' && (
              <div>
                <label className={label}>Título de cada temporada</label>
                <input className={`${input} font-mono text-xs`} value={theme.seasonTitleTemplate} onChange={(e) => set({ seasonTitleTemplate: e.target.value })} />
              </div>
            )}
            {theme.seasonMode === 'taxonomy' && (
              <div>
                <label className={label}>Nombre del término de cada temporada</label>
                <input className={`${input} font-mono text-xs`} value={theme.seasonTermTemplate} onChange={(e) => set({ seasonTermTemplate: e.target.value })} />
              </div>
            )}
            <label className="flex items-center gap-2 text-xs text-zinc-400">
              <input type="checkbox" className="accent-rose-500" checked={theme.useParent} onChange={(e) => set({ useParent: e.target.checked })} />
              Enlazar con la “entrada padre” (temporada → serie, episodio → temporada) en los tipos jerárquicos
            </label>
          </section>
        )}

        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-rose-500" checked={theme.featuredFromPoster !== false} onChange={(e) => set({ featuredFromPoster: e.target.checked })} />
          <span>
            Subir el póster de TMDB como imagen destacada
            <span className="block text-xs text-zinc-500">Desactívalo si el theme ya muestra el póster desde su campo de URL (MovieEngine lo hace) o si las imágenes subidas por la API no se ven en tu hosting.</span>
          </span>
        </label>

        {/* Taxonomías */}
        <section className="space-y-3">
          <h3 className={h3}>Taxonomías</h3>
          {theme.taxonomyList.length === 0 ? (
            <p className="text-xs text-zinc-500">Carga la estructura del sitio para elegir las taxonomías del theme.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {TAXONOMY_DEFS.map(([key, text]) => (
                <div key={key}>
                  <label className={label}>{text}</label>
                  <select className={input} value={theme.taxonomies[key] || ''} onChange={(e) => set({ taxonomies: { ...theme.taxonomies, [key]: e.target.value } })}>
                    <option value="">— No asignar —</option>
                    {mainTaxonomies.map((t) => <option key={t.restBase} value={t.restBase}>{t.name} ({t.slug})</option>)}
                  </select>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Categorías automáticas */}
        <section className="space-y-3">
          <h3 className={h3}>Categorías automáticas</h3>
          <p className="text-xs text-zinc-500">
            Cada ficha se clasifica sola (Anime = animación japonesa, Documentales = género documental, Infantil = animación familiar o series infantiles).
            Elige en qué taxonomía y con qué término se marca cada categoría.
          </p>
          <div className="grid gap-x-3 gap-y-1.5 sm:grid-cols-[120px_minmax(0,1fr)_minmax(0,1fr)]">
            {CATEGORY_DEFS.map(([key, text]) => {
              const entry = { ...DEFAULT_CATEGORY_MAP[key], ...(theme.categoryMap || {})[key] };
              const setEntry = (patch) => set({ categoryMap: { ...DEFAULT_CATEGORY_MAP, ...theme.categoryMap, [key]: { ...entry, ...patch } } });
              return (
                <div key={key} className="contents">
                  <span className="self-center text-xs text-zinc-400">{text}</span>
                  <select className={input} value={entry.taxonomy} onChange={(e) => setEntry({ taxonomy: e.target.value })}>
                    <option value="">— No añadir término —</option>
                    {mainTaxonomies.map((t) => <option key={t.restBase} value={t.restBase}>{t.name} ({t.slug})</option>)}
                  </select>
                  <input className={input} value={entry.term} disabled={!entry.taxonomy} onChange={(e) => setEntry({ term: e.target.value })} placeholder="Nombre del término" />
                </div>
              );
            })}
          </div>
        </section>

        {/* Campos personalizados */}
        <section className="space-y-3">
          <h3 className={h3}>Campos de películas y series</h3>
          <FieldTable defs={FIELD_DEFS} mapping={theme.fields} onChange={(fields) => set({ fields })} />
        </section>
        {theme.episodeType && theme.seasonMode === 'post' && theme.seasonType && (
          <section className="space-y-3">
            <h3 className={h3}>Campos de temporadas</h3>
            <FieldTable defs={SEASON_FIELD_DEFS} mapping={theme.seasonFields} onChange={(seasonFields) => set({ seasonFields })} />
          </section>
        )}
        {theme.episodeType && (
          <section className="space-y-3">
            <h3 className={h3}>Campos de episodios</h3>
            <FieldTable defs={EPISODE_FIELD_DEFS} mapping={theme.episodeFields} onChange={(episodeFields) => set({ episodeFields })} />
          </section>
        )}
        <p className="text-xs text-zinc-500">
          Los campos de vídeo solo aceptan YouTube, Vimeo, Dailymotion o vídeos de tu propio WordPress; el resto se rechaza al publicar.
        </p>

        {/* Descubrir claves */}
        <section className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
          <h3 className={h3}>¿No sabes qué claves usa el theme?</h3>
          <p className="text-xs text-zinc-500">Crea una película a mano con el theme y escribe aquí su ID (se ve en la URL al editarla: <code>post=123</code>).</p>
          <div className="flex gap-2">
            <select className={`${input} w-44`} value={probe.type} onChange={(e) => setProbe({ ...probe, type: e.target.value })}>{typeOptions}</select>
            <input className={input} placeholder="ID de la entrada" value={probe.id} onChange={(e) => setProbe({ ...probe, id: e.target.value })} />
            <button onClick={inspect} disabled={loading || !probe.id.trim()} className="flex shrink-0 items-center gap-1.5 rounded-xl border border-zinc-700 px-3 text-xs hover:bg-zinc-800 disabled:opacity-40">
              <Search size={14} /> Ver campos
            </button>
          </div>
          {probeResult && (
            <div className="space-y-2 text-xs">
              <p className="text-zinc-300">{probeResult.title}{probeResult.parent ? ` · padre #${probeResult.parent}` : ''}</p>
              {probeResult.meta.length ? (
                <ul className="scroll-thin max-h-40 overflow-auto rounded-lg bg-zinc-900 p-2 font-mono">
                  {probeResult.meta.map(([k, v]) => <li key={k} className="truncate"><span className="text-rose-300">{k}</span> = <span className="text-zinc-400">{JSON.stringify(v)}</span></li>)}
                </ul>
              ) : (
                <p className="text-amber-300">La API no muestra ningún campo: el theme no los registra para REST. Busca las claves en el editor (panel “Campos personalizados”) o en los archivos del theme, y después instala el plugin auxiliar.</p>
              )}
              {probeResult.taxonomies.length > 0 && <ul className="text-zinc-500">{probeResult.taxonomies.map((t) => <li key={t}>{t}</li>)}</ul>}
            </div>
          )}
        </section>

        {/* Plugin auxiliar */}
        <section className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
          <h3 className={h3}>Plugin auxiliar</h3>
          <p className="text-xs text-zinc-500">
            WordPress solo guarda por la API los campos registrados para REST. Este plugin registra las claves que has puesto arriba. Súbelo a <code className="text-zinc-400">wp-content/mu-plugins/</code> (crea la carpeta si no existe).
          </p>
          <button
            onClick={() => download(companionPlugin(theme), 'publicador-rest.php', 'text/x-php')}
            className="flex items-center gap-2 rounded-xl border border-zinc-700 px-4 py-2 text-sm hover:bg-zinc-800"
          >
            <Download size={15} /> Descargar publicador-rest.php
          </button>
        </section>
      </div>
    </div>
  );
}
