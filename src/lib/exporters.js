// Exportación de los resultados del extractor a JSON y CSV.
import { KINDS } from './extractor.js';

const rows = (items) =>
  items.map((r) => ({
    url: r.url,
    tipo: KINDS[r.kind]?.label || r.kind,
    servidor: r.server || '',
    etiqueta: r.label || '',
    origen: (r.origins || []).join(', '),
  }));

export const toJSON = (items) => JSON.stringify(rows(items), null, 2);

// Separador ";" y BOM para que Excel en español lo abra bien a la primera.
export function toCSV(items) {
  const data = rows(items);
  const cols = ['url', 'tipo', 'servidor', 'etiqueta', 'origen'];
  const cell = (v) => `"${String(v).replace(/"/g, '""')}"`;
  return '﻿' + [cols.join(';'), ...data.map((d) => cols.map((c) => cell(d[c])).join(';'))].join('\r\n');
}

export function download(content, filename, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const stamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
