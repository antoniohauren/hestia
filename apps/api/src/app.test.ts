import { beforeEach, describe, expect, test } from 'bun:test';
import { createApp } from './app';
import { createDb } from './db/client';
import { seedIfEmpty } from './db/seed';

let app: ReturnType<typeof createApp>;
let cookie = '';

async function req(method: string, path: string, body?: unknown, withCookie = true) {
  const res = await app.request(path, {
    method,
    headers: { 'content-type': 'application/json', ...(withCookie && cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as any, res };
}

// Two variants from the seed: pick the first single-price and a 2-variant item.
let v1: { id: number; priceCents: number };
let v2: { id: number; priceCents: number };

beforeEach(async () => {
  const db = createDb(':memory:');
  await seedIfEmpty(db);
  app = createApp({ db, pin: '1234', secret: 'test-secret', timeZone: 'America/Sao_Paulo' });
  const login = await req('POST', '/api/auth/login', { pin: '1234' }, false);
  expect(login.status).toBe(200);
  cookie = login.res.headers.get('set-cookie')!.split(';')[0];
  const menu = (await req('GET', '/api/menu')).body as any[];
  const variants = menu.flatMap((c) => c.items.flatMap((i: any) => i.variants));
  v1 = variants[0];
  v2 = variants[1];
});

async function newOrder() {
  return (await req('POST', '/api/orders', { customerName: 'João' })).body.id as number;
}
const addItem = (id: number, variantId: number, quantity = 1) =>
  req('POST', `/api/orders/${id}/items`, { variantId, quantity, note: 'sem cebola' });

describe('auth', () => {
  test('401 without cookie', async () => {
    expect((await req('GET', '/api/menu', undefined, false)).status).toBe(401);
    expect((await req('GET', '/api/auth/me', undefined, false)).status).toBe(401);
    expect((await req('GET', '/api/auth/me')).status).toBe(200);
  });
  test('wrong pin rejected, locks after 5', async () => {
    for (let i = 0; i < 5; i++) expect((await req('POST', '/api/auth/login', { pin: '0000' }, false)).status).toBe(401);
    expect((await req('POST', '/api/auth/login', { pin: '1234' }, false)).status).toBe(429);
  });
});

describe('menu', () => {
  test('seeded 14 categories / 77 items, prices in cents', async () => {
    const menu = (await req('GET', '/api/menu')).body as any[];
    expect(menu).toHaveLength(14);
    expect(menu.reduce((s, c) => s + c.items.length, 0)).toBe(77);
    expect(menu[0].items[0].variants[0].priceCents).toBe(2500);
  });
  test('patch item variants: update, insert, deactivate missing', async () => {
    const cat = (await req('POST', '/api/categories', { name: 'Teste' })).body;
    const item = (
      await req('POST', '/api/items', {
        categoryId: cat.id,
        name: 'Sushi Dog X',
        variants: [
          { name: 'Inteiro', priceCents: 3000 },
          { name: 'Meio', priceCents: 1500 },
        ],
      })
    ).body;
    const full = (await req('GET', '/api/menu')).body.find((c: any) => c.id === cat.id).items[0];
    const [inteiro] = full.variants;
    const patched = (
      await req('PATCH', `/api/items/${item.id}`, {
        variants: [
          { id: inteiro.id, name: 'Inteiro', priceCents: 3200 },
          { name: 'Grande', priceCents: 5000 },
        ],
      })
    ).body;
    const byName = (a: any, b: any) => a[0].localeCompare(b[0]);
    expect(patched.variants.map((v: any) => [v.name, v.priceCents, v.active]).sort(byName)).toEqual(
      [
        ['Grande', 5000, true],
        ['Inteiro', 3200, true],
        ['Meio', 1500, false],
      ],
    );
    const active = (await req('GET', '/api/menu')).body.find((c: any) => c.id === cat.id).items[0].variants;
    expect(active.map((v: any) => v.name)).toEqual(['Inteiro', 'Grande']);
  });
});

test('patch without description keeps it', async () => {
  const item = (await req('GET', '/api/menu')).body[0].items[0];
  const r = await req('PATCH', `/api/items/${item.id}`, { active: false });
  expect(r.body).toMatchObject({ active: false, description: item.description });
  expect((await req('PATCH', `/api/items/${item.id}`, { description: '' })).body.description).toBeNull();
});

describe('orders', () => {
  test('add items -> total; removed item excluded', async () => {
    const id = await newOrder();
    await addItem(id, v1.id, 2);
    const r = await addItem(id, v2.id, 1);
    expect(r.body.totalCents).toBe(v1.priceCents * 2 + v2.priceCents);
    const itemId = r.body.items[1].id;
    const rem = await req('POST', `/api/orders/${id}/items/${itemId}/remove`, { reason: 'desistiu' });
    expect(rem.body.totalCents).toBe(v1.priceCents * 2);
    expect(rem.body.items[1]).toMatchObject({ status: 'removed', removedReason: 'desistiu' });
    const plain = await req('POST', `/api/orders/${id}/items/${r.body.items[0].id}/remove`, { reason: '' });
    expect(plain.body.items[0]).toMatchObject({ status: 'removed', removedReason: null });
    const list = (await req('GET', '/api/orders?status=open')).body;
    expect(list[0]).toMatchObject({ id, itemCount: 0, totalCents: 0 });
  });

  test('two halves become one whole; edit quantity and note', async () => {
    const menu = (await req('GET', '/api/menu')).body as any[];
    const item = menu.flatMap((c) => c.items).find((i: any) => i.variants.some((v: any) => v.name === 'Meio'));
    const meio = item.variants.find((v: any) => v.name === 'Meio');
    const id = await newOrder();
    let r = await addItem(id, meio.id, 2);
    expect(r.body.items[0]).toMatchObject({ variantName: 'Inteiro', quantity: 1, unitPriceCents: meio.priceCents * 2 });
    r = await addItem(id, meio.id, 1);
    const half = r.body.items[1];
    expect(half).toMatchObject({ variantName: 'Meio', quantity: 1 });
    r = await req('PATCH', `/api/orders/${id}/items/${half.id}`, { quantity: 4, note: '' });
    expect(r.body.items[1]).toMatchObject({ variantName: 'Inteiro', quantity: 2, note: null });
    expect(r.body.totalCents).toBe(meio.priceCents * 6);
    r = await req('PATCH', `/api/orders/${id}/items/${half.id}`, { quantity: 3 });
    expect(r.body.items[1]).toMatchObject({ variantName: 'Inteiro', quantity: 3, note: null });
  });

  test('menu price change does not alter snapshot', async () => {
    const id = await newOrder();
    await addItem(id, v1.id);
    const menu = (await req('GET', '/api/menu')).body;
    const item = menu[0].items[0];
    await req('PATCH', `/api/items/${item.id}`, { variants: [{ id: v1.id, name: null, priceCents: 99900 }] });
    expect((await req('GET', `/api/orders/${id}`)).body.totalCents).toBe(v1.priceCents);
  });

  test('payments: overpay rejected, dinheiro needs received, paid at zero', async () => {
    const id = await newOrder();
    await addItem(id, v1.id, 2);
    const total = v1.priceCents * 2;
    expect((await req('POST', `/api/orders/${id}/payments`, { method: 'pix', amountCents: total + 1 })).status).toBe(400);
    expect((await req('POST', `/api/orders/${id}/payments`, { method: 'dinheiro', amountCents: 1000 })).status).toBe(400);
    const cash = await req('POST', `/api/orders/${id}/payments`, {
      method: 'dinheiro',
      amountCents: 1000,
      receivedCents: 5000,
    });
    expect(cash.body.payments[0]).toMatchObject({ receivedCents: 5000, changeCents: 4000 });
    expect(cash.body.status).toBe('open');
    const done = await req('POST', `/api/orders/${id}/payments`, { method: 'credito', amountCents: total - 1000 });
    expect(done.body).toMatchObject({ status: 'paid', remainingCents: 0 });
    expect(done.body.closedAt).toBeNumber();
    expect((await req('POST', `/api/orders/${id}/items`, { variantId: v1.id, quantity: 1 })).status).toBe(409);
  });

  test('empty order cannot be paid', async () => {
    const id = await newOrder();
    expect((await req('POST', `/api/orders/${id}/payments`, { method: 'pix', amountCents: 100 })).status).toBe(409);
  });

  test('by-items payment marks items; paid items cannot be removed', async () => {
    const id = await newOrder();
    await addItem(id, v1.id);
    const o = (await addItem(id, v2.id)).body;
    const [a, b] = o.items;
    expect(
      (await req('POST', `/api/orders/${id}/payments`, { method: 'pix', amountCents: 1, orderItemIds: [a.id] })).status,
    ).toBe(400);
    const r = await req('POST', `/api/orders/${id}/payments`, {
      method: 'pix',
      amountCents: v1.priceCents,
      orderItemIds: [a.id],
    });
    expect(r.body.items[0].paymentId).toBe(r.body.payments[0].id);
    expect(r.body.items[1].paymentId).toBeNull();
    expect((await req('POST', `/api/orders/${id}/items/${a.id}/remove`, { reason: 'x' })).status).toBe(409);
    expect(
      (await req('POST', `/api/orders/${id}/payments`, { method: 'pix', amountCents: v1.priceCents, orderItemIds: [a.id] }))
        .status,
    ).toBe(409);
    const done = await req('POST', `/api/orders/${id}/payments`, {
      method: 'debito',
      amountCents: v2.priceCents,
      orderItemIds: [b.id],
    });
    expect(done.body.status).toBe('paid');
  });

  test('cancel requires reason and no payments', async () => {
    const id = await newOrder();
    await addItem(id, v1.id);
    await req('POST', `/api/orders/${id}/payments`, { method: 'pix', amountCents: 100 });
    expect((await req('POST', `/api/orders/${id}/cancel`, { reason: 'x' })).status).toBe(409);
    const id2 = await newOrder();
    expect((await req('POST', `/api/orders/${id2}/cancel`, { reason: ' ' })).status).toBe(400);
    const c = await req('POST', `/api/orders/${id2}/cancel`, { reason: 'cliente foi embora' });
    expect(c.body).toMatchObject({ status: 'cancelled', cancelReason: 'cliente foi embora' });
  });

  test('editing/deleting a payment on a paid order reopens it', async () => {
    const id = await newOrder();
    await addItem(id, v1.id);
    const o = (await addItem(id, v2.id)).body;
    const total = o.totalCents;
    const paid = await req('POST', `/api/orders/${id}/payments`, {
      method: 'pix',
      amountCents: v1.priceCents,
      orderItemIds: [o.items[0].id],
    });
    const p2 = await req('POST', `/api/orders/${id}/payments`, { method: 'credito', amountCents: total - v1.priceCents });
    expect(p2.body.status).toBe('paid');
    const [pa, pb] = p2.body.payments;

    const edited = await req('PATCH', `/api/orders/${id}/payments/${pa.id}`, { amountCents: pa.amountCents - 100 });
    expect(edited.body).toMatchObject({ status: 'open', closedAt: null, remainingCents: 100 });
    expect(edited.body.items[0].paymentId).toBeNull();

    expect((await req('PATCH', `/api/orders/${id}/payments/${pb.id}`, { amountCents: pb.amountCents + 101 })).status).toBe(
      400,
    );
    const fixed = await req('PATCH', `/api/orders/${id}/payments/${pb.id}`, {
      method: 'dinheiro',
      amountCents: pb.amountCents + 100,
      receivedCents: 100000,
    });
    expect(fixed.body.status).toBe('paid');
    expect(fixed.body.payments[1]).toMatchObject({ method: 'dinheiro', changeCents: 100000 - pb.amountCents - 100 });

    const del = await req('DELETE', `/api/orders/${id}/payments/${pb.id}`);
    expect(del.body).toMatchObject({ status: 'open', closedAt: null });
    expect(del.body.payments).toHaveLength(1);
    expect(paid.status).toBe(201);
  });

  test('history by local date', async () => {
    const id = await newOrder();
    const d = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
    const list = (await req('GET', `/api/orders?date=${d}`)).body;
    expect(list.map((o: any) => o.id)).toContain(id);
    expect((await req('GET', '/api/orders?date=2000-01-01')).body).toEqual([]);
  });
});
