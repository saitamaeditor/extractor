import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { X, ExternalLink, ShieldCheck, ShieldOff } from 'lucide-react';
import { isHls } from '../lib/extractor.js';

export default function PreviewModal({ item, onClose }) {
  const videoRef = useRef(null);
  const [error, setError] = useState('');
  const [sandboxed, setSandboxed] = useState(true);
  const isVideo = item.kind === 'direct';

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (!isVideo || !videoRef.current) return;
    const video = videoRef.current;
    setError('');
    if (isHls(item.url) && Hls.isSupported()) {
      const hls = new Hls();
      hls.loadSource(item.url);
      hls.attachMedia(video);
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) setError(`Error HLS: ${data.details}. Puede que el servidor bloquee peticiones desde otro origen (CORS) o exija un Referer.`);
      });
      return () => hls.destroy();
    }
    video.src = item.url;
    const onErr = () => setError('No se pudo reproducir. El enlace puede haber caducado, requerir un Referer o no ser compatible con el navegador.');
    video.addEventListener('error', onErr);
    return () => video.removeEventListener('error', onErr);
  }, [item, isVideo]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-5xl overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-zinc-800 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{item.server || (isVideo ? 'Vídeo directo' : 'Iframe')}</p>
            <p className="truncate font-mono text-xs text-zinc-400">{item.url}</p>
          </div>
          {!isVideo && (
            <button
              onClick={() => setSandboxed((s) => !s)}
              title="El modo protegido bloquea ventanas emergentes y redirecciones. Desactívalo si el reproductor no carga."
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium ${sandboxed ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'}`}
            >
              {sandboxed ? <ShieldCheck size={14} /> : <ShieldOff size={14} />}
              {sandboxed ? 'Antipopups activo' : 'Sin protección'}
            </button>
          )}
          <a href={item.url} target="_blank" rel="noopener noreferrer" className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white" title="Abrir en pestaña nueva">
            <ExternalLink size={18} />
          </a>
          <button onClick={onClose} className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white" title="Cerrar (Esc)">
            <X size={18} />
          </button>
        </div>

        <div className="relative aspect-video bg-black">
          {isVideo ? (
            <video ref={videoRef} controls autoPlay className="h-full w-full" />
          ) : (
            <iframe
              key={String(sandboxed)}
              src={item.url}
              className="h-full w-full"
              allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
              allowFullScreen
              referrerPolicy="no-referrer"
              {...(sandboxed ? { sandbox: 'allow-scripts allow-same-origin allow-presentation allow-forms' } : {})}
            />
          )}
        </div>

        {error && <p className="border-t border-zinc-800 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p>}
        {!isVideo && (
          <p className="border-t border-zinc-800 px-4 py-2.5 text-xs text-zinc-500">
            Algunos servidores detectan el modo protegido o comprueban desde qué web se carga el reproductor. Si se queda en negro, prueba “Sin protección” o ábrelo en una pestaña nueva.
          </p>
        )}
      </div>
    </div>
  );
}
