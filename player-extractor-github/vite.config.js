import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Ajustes compartidos: se guardan en config/ajustes.json, así cualquier navegador que abra
// la app (y el script de la terminal) usa la misma conexión y la misma configuración del theme.
const SETTINGS_FILE = fileURLToPath(new URL('./config/ajustes.json', import.meta.url));

function settingsApi() {
  const handler = (req, res) => {
    if (req.method === 'GET') {
      if (!fs.existsSync(SETTINGS_FILE)) {
        res.statusCode = 404;
        return res.end();
      }
      res.setHeader('Content-Type', 'application/json');
      return res.end(fs.readFileSync(SETTINGS_FILE));
    }
    if (req.method === 'PUT') {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          if (data === null) {
            fs.rmSync(SETTINGS_FILE, { force: true });
          } else {
            fs.mkdirSync(fileURLToPath(new URL('./config/', import.meta.url)), { recursive: true });
            fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2));
          }
          res.statusCode = 204;
        } catch {
          res.statusCode = 400;
        }
        res.end();
      });
      return undefined;
    }
    res.statusCode = 405;
    return res.end();
  };
  return {
    name: 'ajustes-compartidos',
    configureServer(server) { server.middlewares.use('/api/settings', handler); },
    configurePreviewServer(server) { server.middlewares.use('/api/settings', handler); },
  };
}

// En GitHub Pages la web vive en https://usuario.github.io/<repositorio>/: el workflow de
// despliegue pasa ese nombre en GITHUB_REPOSITORY y aquí se usa como ruta base.
const repo = process.env.GITHUB_REPOSITORY?.split('/')[1];
const base = process.env.GITHUB_PAGES && repo ? `/${repo}/` : '/';

export default defineConfig({
  base,
  plugins: [react(), settingsApi()],
  server: {
    port: 5180,
    open: true,
    // wordpress/ guarda el plugin auxiliar y config/ los ajustes: no forman parte del código de la app.
    watch: { ignored: ['**/wordpress/**', '**/config/**'] },
  },
});
