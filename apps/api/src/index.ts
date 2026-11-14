import { serveStatic } from 'hono/bun';
import { existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createApp } from './app';
import { createDb } from './db/client';
import { seedIfEmpty } from './db/seed';
import { env } from './env';

const db = createDb(env.databasePath);
if (await seedIfEmpty(db)) console.log('Cardápio inicial inserido.');

const app = createApp({ db, pin: env.pin, secret: env.secret, timeZone: env.timeZone });

if (env.production) {
  const dist = join(import.meta.dir, '../../web/dist');
  if (!existsSync(dist)) {
    console.error('apps/web/dist não existe. Rode `bun run build` antes de `bun run start`.');
    process.exit(1);
  }
  const root = relative(process.cwd(), dist);
  app.use('*', serveStatic({ root }));
  const indexHtml = await Bun.file(join(dist, 'index.html')).text();
  // SPA fallback: client-side routes get index.html; unknown /api paths stay 404.
  app.get('*', (c) => (c.req.path.startsWith('/api/') ? c.json({ error: 'Não encontrado.' }, 404) : c.html(indexHtml)));
}

console.log(`Hestia rodando em http://localhost:${env.port}`);
export default { port: env.port, hostname: '0.0.0.0', fetch: app.fetch };
