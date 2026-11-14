import { relations, sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { OrderStatus, PaymentMethod } from '@hestia/types';

export const categories = sqliteTable('categories', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  position: integer('position').notNull(),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
});

export const menuItems = sqliteTable('menu_items', {
  id: integer('id').primaryKey(),
  categoryId: integer('category_id')
    .notNull()
    .references(() => categories.id),
  name: text('name').notNull(),
  description: text('description'),
  position: integer('position').notNull().default(0),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
});

export const itemVariants = sqliteTable('item_variants', {
  id: integer('id').primaryKey(),
  itemId: integer('item_id')
    .notNull()
    .references(() => menuItems.id),
  name: text('name'),
  priceCents: integer('price_cents').notNull(),
  position: integer('position').notNull().default(0),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
});

export const orders = sqliteTable(
  'orders',
  {
    id: integer('id').primaryKey(),
    customerName: text('customer_name').notNull(),
    status: text('status').$type<OrderStatus>().notNull(),
    cancelReason: text('cancel_reason'),
    createdAt: integer('created_at').notNull(),
    closedAt: integer('closed_at'),
  },
  (t) => [index('orders_status_idx').on(t.status), index('orders_created_idx').on(t.createdAt)],
);

export const payments = sqliteTable(
  'payments',
  {
    id: integer('id').primaryKey(),
    orderId: integer('order_id')
      .notNull()
      .references(() => orders.id),
    method: text('method').$type<PaymentMethod>().notNull(),
    amountCents: integer('amount_cents').notNull(),
    receivedCents: integer('received_cents'),
    changeCents: integer('change_cents'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [index('payments_order_idx').on(t.orderId), check('payments_amount_positive', sql`${t.amountCents} > 0`)],
);

export const orderItems = sqliteTable(
  'order_items',
  {
    id: integer('id').primaryKey(),
    orderId: integer('order_id')
      .notNull()
      .references(() => orders.id),
    variantId: integer('variant_id')
      .notNull()
      .references(() => itemVariants.id),
    itemName: text('item_name').notNull(),
    variantName: text('variant_name'),
    unitPriceCents: integer('unit_price_cents').notNull(),
    quantity: integer('quantity').notNull(),
    note: text('note'),
    status: text('status').$type<'active' | 'removed'>().notNull().default('active'),
    removedReason: text('removed_reason'),
    removedAt: integer('removed_at'),
    paymentId: integer('payment_id').references(() => payments.id),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [index('order_items_order_idx').on(t.orderId), check('order_items_quantity_positive', sql`${t.quantity} > 0`)],
);

export const categoriesRelations = relations(categories, ({ many }) => ({ items: many(menuItems) }));
export const menuItemsRelations = relations(menuItems, ({ one, many }) => ({
  category: one(categories, { fields: [menuItems.categoryId], references: [categories.id] }),
  variants: many(itemVariants),
}));
export const itemVariantsRelations = relations(itemVariants, ({ one }) => ({
  item: one(menuItems, { fields: [itemVariants.itemId], references: [menuItems.id] }),
}));

/** Cash drawer per local day (YYYY-MM-DD): opening float and the amount counted at closing. */
export const cashDays = sqliteTable('cash_days', {
  date: text('date').primaryKey(),
  openingCents: integer('opening_cents').notNull().default(0),
  countedCents: integer('counted_cents'),
  updatedAt: integer('updated_at').notNull(),
});
