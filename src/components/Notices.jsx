import { CheckCircle2, XCircle, AlertTriangle, Info, X, ExternalLink } from 'lucide-react';

const STYLE = {
  success: { Icon: CheckCircle2, cls: 'border-emerald-500/30 bg-emerald-950/90 text-emerald-100', icon: 'text-emerald-400' },
  error: { Icon: XCircle, cls: 'border-red-500/30 bg-red-950/90 text-red-100', icon: 'text-red-400' },
  warning: { Icon: AlertTriangle, cls: 'border-amber-500/30 bg-amber-950/90 text-amber-100', icon: 'text-amber-400' },
  info: { Icon: Info, cls: 'border-zinc-700 bg-zinc-900/95 text-zinc-100', icon: 'text-sky-400' },
};

// Avisos flotantes: { id, type, title, message, links: [{ href, label }] }.
export default function Notices({ items, onDismiss }) {
  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-4 z-[60] flex flex-col items-end gap-2 sm:inset-x-auto sm:right-4 sm:w-96" aria-live="polite">
      {items.map((n) => {
        const { Icon, cls, icon } = STYLE[n.type] || STYLE.info;
        return (
          <div key={n.id} role={n.type === 'error' ? 'alert' : 'status'} className={`pointer-events-auto w-full rounded-xl border p-4 shadow-2xl backdrop-blur ${cls}`}>
            <div className="flex gap-3">
              <Icon size={20} className={`mt-0.5 shrink-0 ${icon}`} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{n.title}</p>
                {n.message && <p className="mt-1 break-words text-xs opacity-80">{n.message}</p>}
                {n.links?.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-3">
                    {n.links.map((l) => (
                      <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold underline underline-offset-2">
                        {l.label} <ExternalLink size={12} />
                      </a>
                    ))}
                  </div>
                )}
              </div>
              <button onClick={() => onDismiss(n.id)} className="h-fit rounded p-1 opacity-60 hover:opacity-100" title="Cerrar">
                <X size={14} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
