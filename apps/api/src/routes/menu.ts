import { Hono } from 'hono';
import { asc, eq, max } from 'drizzle-orm';
import { createCategorySchema, createItemSchema, idParam, updateCategorySchema, updateItemSchema } from '@hestia/types';
import type { DB } from '../db/client';
import { categories, itemVariants, menuItems } from '../db/schema';
import { fail, validate } from '../lib/http';

export function getMenu(db: DB, all: boolean) {
  return db.query.categories.findMany({
    where: all ? undefined : eq(categories.active, true),
    orderBy: [asc(categories.position), asc(categories.id)],
    with: {
      items: {
        where: all ? undefined : eq(menuItems.active, true),
        orderBy: [asc(menuItems.position), asc(menuItems.id)],
        with: {
          variants: {
            where: all ? undefined : eq(itemVariants.active, true),
            orderBy: [asc(itemVariants.position), asc(itemVariants.id)],
          },
        },
      },
    },
  }).sync();
}

export function menuRoutes(db: DB) {
  return new Hono()
    .get('/menu', (c) => c.json(getMenu(db, c.req.query('all') === '1')))
    .post('/categories', validate('json', createCategorySchema), (c) => {
      const body = c.req.valid('json');
      const position =
        body.position ?? (db.select({ m: max(categories.position) }).from(categories).get()?.m ?? -1) + 1;
      return c.json(db.insert(categories).values({ name: body.name, position }).returning().get(), 201);
    })
    .patch('/categories/:id', validate('param', idParam), validate('json', updateCategorySchema), (c) => {
      const { id } = c.req.valid('param');
      const body = c.req.valid('json');
      const row = Object.keys(body).length
        ? db.update(categories).set(body).where(eq(categories.id, id)).returning().get()
        : db.select().from(categories).where(eq(categories.id, id)).get();
      return row ? c.json(row) : fail(404, 'Categoria não encontrada.');
    })
    .post('/items', validate('json', createItemSchema), (c) => {
      const body = c.req.valid('json');
      if (!db.select().from(categories).where(eq(categories.id, body.categoryId)).get())
        fail(400, 'Categoria não encontrada.');
      const item = db.transaction((tx) => {
        const position =
          (tx.select({ m: max(menuItems.position) }).from(menuItems).where(eq(menuItems.categoryId, body.categoryId)).get()
            ?.m ?? -1) + 1;
        const item = tx
          .insert(menuItems)
          .values({ categoryId: body.categoryId, name: body.name, description: body.description, position })
          .returning()
          .get();
        body.variants.forEach((v, i) =>
          tx.insert(itemVariants).values({ itemId: item.id, name: v.name, priceCents: v.priceCents, position: i }).run(),
        );
        return item;
      });
      return c.json(item, 201);
    })
    .patch('/items/:id', validate('param', idParam), validate('json', updateItemSchema), (c) => {
      const { id } = c.req.valid('param');
      const { variants, ...fields } = c.req.valid('json');
      if (!db.select().from(menuItems).where(eq(menuItems.id, id)).get()) fail(404, 'Item não encontrado.');
      if (fields.categoryId && !db.select().from(categories).where(eq(categories.id, fields.categoryId)).get())
        fail(400, 'Categoria não encontrada.');
      db.transaction((tx) => {
        if (Object.keys(fields).length) tx.update(menuItems).set(fields).where(eq(menuItems.id, id)).run();
        if (!variants) return;
        const existing = tx.select().from(itemVariants).where(eq(itemVariants.itemId, id)).all();
        const keep = new Set<number>();
        variants.forEach((v, position) => {
          if (v.id) {
            if (!existing.some((e) => e.id === v.id)) fail(400, 'Variação não pertence a este item.');
            keep.add(v.id);
            tx.update(itemVariants)
              .set({ name: v.name, priceCents: v.priceCents, position, active: true })
              .where(eq(itemVariants.id, v.id))
              .run();
          } else {
            tx.insert(itemVariants).values({ itemId: id, name: v.name, priceCents: v.priceCents, position }).run();
          }
        });
        for (const e of existing)
          if (!keep.has(e.id) && e.active)
            tx.update(itemVariants).set({ active: false }).where(eq(itemVariants.id, e.id)).run();
      });
      return c.json(
        db.query.menuItems.findFirst({
          where: eq(menuItems.id, id),
          with: { variants: { orderBy: [asc(itemVariants.position)] } },
        }).sync(),
      );
    });
}
