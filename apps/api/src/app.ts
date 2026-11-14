import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { DB } from './db/client';
import { authRoutes, requireAuth } from './routes/auth';
import { cashRoutes } from './routes/cash';
import { menuRoutes } from './routes/menu';
import { orderRoutes } from './routes/orders';

export type AppDeps = { db: DB; pin: string; secret: string; timeZone: string; secureCookie?: boolean };

export function createApp({ db, pin, secret, timeZone, secureCookie }: AppDeps) {
  const api = new Hono()
    .use('*', requireAuth(secret))
    .route('/auth', authRoutes({ pin, secret, secure: secureCookie }))
    .route('/', menuRoutes(db))
    .route('/orders', orderRoutes(db, timeZone))
    .route('/cash', cashRoutes(db, timeZone));

  return new Hono()
    .onError((err, c) => {
      if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
      console.error(err);
      return c.json({ error: 'Erro interno do servidor.' }, 500);
    })
    .route('/api', api);
}

export type AppType = ReturnType<typeof createApp>;
