import { Hono } from 'hono';
import { deleteCookie, getSignedCookie, setSignedCookie } from 'hono/cookie';
import { createMiddleware } from 'hono/factory';
import { createHash, timingSafeEqual } from 'node:crypto';
import { loginSchema } from '@hestia/types';
import { fail, validate } from '../lib/http';

export const COOKIE = 'hestia_session';
const MAX_FAILS = 5;
const LOCK_MS = 60_000;

const sha = (s: string) => createHash('sha256').update(s).digest();

export function authRoutes(opts: { pin: string; secret: string; secure?: boolean }) {
  // shortcut: in-memory, global (not per-IP) throttle; resets on restart. Fine for one counter PC on a LAN.
  let fails = 0;
  let lockedUntil = 0;

  return new Hono()
    .post('/login', validate('json', loginSchema), async (c) => {
      if (Date.now() < lockedUntil) fail(429, 'Muitas tentativas. Aguarde 1 minuto.');
      const { pin } = c.req.valid('json');
      if (!timingSafeEqual(sha(pin), sha(opts.pin))) {
        if (++fails >= MAX_FAILS) {
          fails = 0;
          lockedUntil = Date.now() + LOCK_MS;
        }
        return fail(401, 'PIN incorreto.');
      }
      fails = 0;
      await setSignedCookie(c, COOKIE, String(Date.now()), opts.secret, {
        httpOnly: true,
        sameSite: 'Lax',
        secure: opts.secure ?? false,
        path: '/',
        maxAge: 60 * 60 * 24 * 30,
      });
      return c.json({ ok: true });
    })
    .post('/logout', (c) => {
      deleteCookie(c, COOKIE, { path: '/' });
      return c.json({ ok: true });
    })
    .get('/me', (c) => c.json({ ok: true }));
}

export const requireAuth = (secret: string) =>
  createMiddleware(async (c, next) => {
    if (c.req.path === '/api/auth/login') return next();
    const v = await getSignedCookie(c, secret, COOKIE);
    if (!v) return c.json({ error: 'Não autenticado.' }, 401);
    return next();
  });
