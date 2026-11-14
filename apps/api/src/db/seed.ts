import { join } from 'node:path';
import { categories, itemVariants, menuItems } from './schema';
import type { DB } from './client';

type SeedMenu = {
  categories: {
    name: string;
    position: number;
    items: { name: string; description: string | null; variants: { name: string | null; price: number }[] }[];
  }[];
};

/** Inserts the printed cardápio only if there are no categories yet. Returns true if it seeded. */
export async function seedIfEmpty(db: DB): Promise<boolean> {
  if (db.select({ id: categories.id }).from(categories).limit(1).all().length > 0) return false;
  const menu: SeedMenu = await Bun.file(join(import.meta.dir, '../../../../seed/menu.json')).json();
  db.transaction((tx) => {
    for (const cat of menu.categories) {
      const { id: categoryId } = tx
        .insert(categories)
        .values({ name: cat.name, position: cat.position })
        .returning({ id: categories.id })
        .get();
      cat.items.forEach((item, i) => {
        const { id: itemId } = tx
          .insert(menuItems)
          .values({ categoryId, name: item.name, description: item.description, position: i })
          .returning({ id: menuItems.id })
          .get();
        item.variants.forEach((v, j) => {
          tx.insert(itemVariants)
            .values({ itemId, name: v.name, priceCents: Math.round(v.price * 100), position: j })
            .run();
        });
      });
    }
  });
  return true;
}

if (import.meta.main) {
  const { createDb } = await import('./client');
  const { env } = await import('../env');
  const seeded = await seedIfEmpty(createDb(env.databasePath));
  console.log(seeded ? 'Cardápio inserido.' : 'Banco já tem categorias; nada a fazer.');
}
