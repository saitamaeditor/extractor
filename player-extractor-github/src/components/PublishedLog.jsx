import { useEffect, useState } from 'react';
import { History, ExternalLink, Pencil, Film, Tv, ChevronDown } from 'lucide-react';
import { clearPublished, loadPublished } from '../lib/storage.js';

const STATUS = { publish: 'Publicado', draft: 'Borrador', pending: 'Pendiente', private: 'Privado' };

// Últimas fichas publicadas desde la app en este navegador, con acceso directo a verlas o editarlas.
export default function PublishedLog({ site }) {
  const [items, setItems] = useState(loadPublished);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const refresh = () => setItems(loadPublished());
    window.addEventListener('pe:published', refresh);
    return () => window.removeEventListener('pe:published', refresh);
  }, []);

  const mine = items.filter((p) => !site || p.site === site);
  if (!mine.length) return null;

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm">
        <History size={15} className="text-zinc-500" />
        <span className="flex-1 font-medium">Últimas publicaciones <span className="text-zinc-500">{mine.length}</span></span>
        <ChevronDown size={15} className={`text-zinc-500 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="border-t border-zinc-800 px-2 pb-2">
          <ul className="scroll-thin max-h-80 overflow-auto">
            {mine.map((p) => (
              <li key={`${p.site}-${p.id}`} className="flex items-center gap-2 rounded-lg px-2 py-2 text-xs hover:bg-zinc-950/60">
                {p.kind === 'tv' ? <Tv size={13} className="shrink-0 text-zinc-500" /> : <Film size={13} className="shrink-0 text-zinc-500" />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-zinc-200">{p.title}</span>
                  <span className="block text-zinc-500">
                    {new Date(p.date).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' })} · {p.action === 'update' ? 'Actualizada' : STATUS[p.status] || p.status}
                  </span>
                </span>
                <a href={p.link} target="_blank" rel="noopener noreferrer" className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200" title="Ver"><ExternalLink size={13} /></a>
                <a href={p.edit} target="_blank" rel="noopener noreferrer" className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200" title="Editar en WordPress"><Pencil size={13} /></a>
              </li>
            ))}
          </ul>
          <button onClick={() => setItems(clearPublished())} className="mt-1 px-2 text-[11px] text-zinc-600 underline underline-offset-2 hover:text-zinc-400">Vaciar lista</button>
        </div>
      )}
    </div>
  );
}
