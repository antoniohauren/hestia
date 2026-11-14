import { Hono } from 'hono';
import { and, eq, gte, lt, sql } from 'drizzle-orm';
import { cashDaySchema, dateParam, paymentMethods, type PaymentMethod } from '@hestia/types';
import type { DB } from '../db/client';
import { cashDays, payments } from '../db/schema';
import { localDayRange } from '../lib/dates';
import { validate } from '../lib/http';

/** Cash summary for a local day: expected = opening + cash payments taken that day; difference = counted - expected. */
function summary(db: DB, date: string, timeZone: string) {
  const [start, end] = localDayRange(date, timeZone);
  const day = db.select().from(cashDays).where(eq(cashDays.date, date)).get();
  const rows = db
    .select({ method: payments.method, total: sql<number>`sum(${payments.amountCents})` })
    .from(payments)
    .where(and(gte(payments.createdAt, start), lt(payments.createdAt, end)))
    .groupBy(payments.method)
    .all();
  const byMethod = Object.fromEntries(paymentMethods.map((m) => [m, 0])) as Record<PaymentMethod, number>;
  for (const r of rows) byMethod[r.method] = Number(r.total);
  const receivedCents = rows.reduce((s, r) => s + Number(r.total), 0);
  const openingCents = day?.openingCents ?? 0;
  const countedCents = day?.countedCents ?? null;
  const cashInCents = byMethod.dinheiro;
  const expectedCents = openingCents + cashInCents;
  return {
    date,
    openingCents,
    countedCents,
    cashInCents,
    byMethod,
    receivedCents,
    expectedCents,
    differenceCents: countedCents === null ? null : countedCents - expectedCents,
  };
}

export function cashRoutes(db: DB, timeZone: string) {
  return new Hono()
    .get('/:date', validate('param', dateParam), (c) => c.json(summary(db, c.req.valid('param').date, timeZone)))
    .put('/:date', validate('param', dateParam), validate('json', cashDaySchema), (c) => {
      const { date } = c.req.valid('param');
      const body = { ...c.req.valid('json'), updatedAt: Date.now() };
      db.insert(cashDays).values({ date, ...body }).onConflictDoUpdate({ target: cashDays.date, set: body }).run();
      return c.json(summary(db, date, timeZone));
    });
}
