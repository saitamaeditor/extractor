import { useState } from 'react';
import { ImageOff } from 'lucide-react';
import { imageCandidates } from '../lib/tmdb.js';

// <img> que, si una URL de TMDB no carga, prueba la misma imagen en el dominio alternativo
// y, si tampoco, muestra un hueco con aviso en lugar de la imagen rota.
export default function TmdbImg({ src, alt = '', className = '', fallbackClassName = '', ...props }) {
  const candidates = imageCandidates(src);
  // El intento en curso va ligado a su URL: al cambiar de imagen se empieza siempre por el primer dominio.
  const [attempt, setAttempt] = useState({ src, index: 0 });
  const index = attempt.src === src ? attempt.index : 0;
  const setIndex = (next) => setAttempt({ src, index: next(index) });

  if (!src || index >= candidates.length) {
    return (
      <div
        className={`grid place-items-center bg-zinc-800 text-center text-[11px] text-zinc-500 ${fallbackClassName || className}`}
        title={src ? 'Tu red o una extensión del navegador está bloqueando las imágenes de TMDB' : ''}
      >
        <span className="flex flex-col items-center gap-1.5 p-2">
          <ImageOff size={18} />
          {src ? 'Imagen bloqueada' : 'Sin imagen'}
        </span>
      </div>
    );
  }

  return <img key={candidates[index]} src={candidates[index]} alt={alt} className={className} onError={() => setIndex((i) => i + 1)} {...props} />;
}
