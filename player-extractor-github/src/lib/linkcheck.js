// Comprobación de enlaces desde el navegador.
// Si el servidor permite CORS se obtiene el código HTTP real; si no, solo se puede
// saber si el dominio responde (una respuesta "opaca" no dice si el vídeo sigue existiendo).

const TIMEOUT_MS = 8000;

export async function checkLink(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const opts = { signal: ctrl.signal, referrerPolicy: 'no-referrer', cache: 'no-store', credentials: 'omit' };
  try {
    try {
      const res = await fetch(url, { ...opts, method: 'HEAD' });
      if (res.ok) return { state: 'ok', detail: `HTTP ${res.status}` };
      return { state: res.status >= 400 && res.status < 500 ? 'down' : 'warn', detail: `HTTP ${res.status}` };
    } catch {
      if (ctrl.signal.aborted) throw new Error('timeout');
    }
    await fetch(url, { ...opts, mode: 'no-cors' });
    return { state: 'reachable', detail: 'El servidor responde, pero no permite ver si el vídeo sigue disponible' };
  } catch {
    return { state: 'down', detail: ctrl.signal.aborted ? `Sin respuesta en ${TIMEOUT_MS / 1000} s` : 'No responde (dominio caído o bloqueado)' };
  } finally {
    clearTimeout(timer);
    ctrl.abort(); // corta la descarga del cuerpo (p. ej. un .mp4 entero)
  }
}

// Ejecuta las comprobaciones de pocas en pocas para no saturar la conexión.
export async function checkMany(urls, onResult, concurrency = 4) {
  const queue = [...urls];
  const worker = async () => {
    while (queue.length) {
      const url = queue.shift();
      onResult(url, { state: 'checking' });
      onResult(url, await checkLink(url));
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
}
