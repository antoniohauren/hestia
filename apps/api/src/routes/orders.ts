import { Hono } from 'hono';
import { and, asc, desc, eq, gte, inArray, lt, sql, type SQL } from 'drizzle-orm';
import {
  addOrderItemSchema,
  computeChange,
  createOrderSchema,
  createPaymentSchema,
  idParam,
  listOrdersQuerySchema,
  orderItemParam,
  paymentParam,
  reasonSchema,
  removeItemSchema,
  updateOrderItemSchema,
  updatePaymentSchema,
} from '@hestia/types';
import type { DB } from '../db/client';
import { itemVariants, menuItems, orderItems, orders, payments } from '../db/schema';
import { localDayRange } from '../lib/dates';
import { fail, validate } from '../lib/http';

type Tx = Parameters<Parameters<DB['transaction']>[0]>[0] | DB;

const activeTotal = sql<number>`coalesce((select sum(oi.unit_price_cents * oi.quantity) from order_items oi where oi.order_id = "orders"."id" and oi.status = 'active'), 0)`;
const activeCount = sql<number>`coalesce((select sum(oi.quantity) from order_items oi where oi.order_id = "orders"."id" and oi.status = 'active'), 0)`;
const paidSum = sql<number>`coalesce((select sum(p.amount_cents) from payments p where p.order_id = "orders"."id"), 0)`;

function loadOrder(tx: Tx, id: number) {
  return tx.select().from(orders).where(eq(orders.id, id)).get() ?? fail(404, 'Pedido não encontrado.');
}

function sums(tx: Tx, orderId: number) {
  const r = tx
    .select({ total: activeTotal, paid: paidSum })
    .from(orders)
    .where(eq(orders.id, orderId))
    .get()!;
  return { total: Number(r.total), paid: Number(r.paid) };
}

/** Moves an order between open/paid according to what is left to pay. */
function settle(tx: Tx, orderId: number) {
  const order = loadOrder(tx, orderId);
  if (order.status === 'cancelled') return;
  const { total, paid } = sums(tx, orderId);
  if (total > 0 && paid >= total) {
    if (order.status !== 'paid')
      tx.update(orders).set({ status: 'paid', closedAt: order.closedAt ?? Date.now() }).where(eq(orders.id, orderId)).run();
  } else if (order.status === 'paid') {
    tx.update(orders).set({ status: 'open', closedAt: null }).where(eq(orders.id, orderId)).run();
  }
}

export function getOrderDetail(tx: Tx, id: number) {
  const order = loadOrder(tx, id);
  const items = tx.select().from(orderItems).where(eq(orderItems.orderId, id)).orderBy(asc(orderItems.id)).all();
  const pays = tx.select().from(payments).where(eq(payments.orderId, id)).orderBy(asc(payments.id)).all();
  const totalCents = items.filter((i) => i.status === 'active').reduce((s, i) => s + i.unitPriceCents * i.quantity, 0);
  const paidCents = pays.reduce((s, p) => s + p.amountCents, 0);
  return { ...order, items, payments: pays, totalCents, paidCents, remainingCents: totalCents - paidCents };
}

/** Two halves are one whole: an even quantity of a "Meio" variant becomes quantity/2 of the item's active "Inteiro". */
function toWhole(tx: Tx, variantId: number, quantity: number) {
  const same = { variantId, quantity, variantName: null as string | null };
  const v = tx.select({ itemId: itemVariants.itemId, name: itemVariants.name }).from(itemVariants).where(eq(itemVariants.id, variantId)).get();
  if (v?.name !== 'Meio' || quantity % 2) return same;
  const whole = tx
    .select({ id: itemVariants.id, name: itemVariants.name })
    .from(itemVariants)
    .where(and(eq(itemVariants.itemId, v.itemId), eq(itemVariants.name, 'Inteiro'), eq(itemVariants.active, true)))
    .get();
  return whole ? { variantId: whole.id, quantity: quantity / 2, variantName: whole.name } : same;
}

function checkCash(method: string, amount: number, received: number | null | undefined) {
  if (method !== 'dinheiro') return { receivedCents: null, changeCents: null };
  if (received == null) fail(400, 'Informe o valor recebido em dinheiro.');
  const change = computeChange(amount, received!);
  if (change === null) fail(400, 'Valor recebido menor que o valor do pagamento.');
  return { receivedCents: received!, changeCents: change! };
}

export function orderRoutes(db: DB, timeZone: string) {
  return new Hono()
    .get('/', validate('query', listOrdersQuerySchema), (c) => {
      const { status, date } = c.req.valid('query');
      const where: SQL[] = [];
      if (status) where.push(eq(orders.status, status));
      if (date) {
        const [start, end] = localDayRange(date, timeZone);
        where.push(gte(orders.createdAt, start), lt(orders.createdAt, end));
      }
      if (!where.length) where.push(eq(orders.status, 'open'));
      const rows = db
        .select({
          id: orders.id,
          customerName: orders.customerName,
          status: orders.status,
          createdAt: orders.createdAt,
          closedAt: orders.closedAt,
          itemCount: activeCount,
          totalCents: activeTotal,
          paidCents: paidSum,
        })
        .from(orders)
        .where(and(...where))
        .orderBy(date ? desc(orders.createdAt) : asc(orders.createdAt))
        .all();
      return c.json(
        rows.map((r) => ({
          ...r,
          itemCount: Number(r.itemCount),
          totalCents: Number(r.totalCents),
          paidCents: Number(r.paidCents),
        })),
      );
    })
    .post('/', validate('json', createOrderSchema), (c) => {
      const { customerName } = c.req.valid('json');
      const order = db.insert(orders).values({ customerName, status: 'open', createdAt: Date.now() }).returning().get();
      return c.json(getOrderDetail(db, order.id), 201);
    })
    .get('/:id', validate('param', idParam), (c) => c.json(getOrderDetail(db, c.req.valid('param').id)))
    .post('/:id/items', validate('param', idParam), validate('json', addOrderItemSchema), (c) => {
      const { id } = c.req.valid('param');
      const body = c.req.valid('json');
      const order = loadOrder(db, id);
      if (order.status !== 'open') fail(409, 'Só é possível adicionar itens a pedidos abertos.');
      const { variantId, quantity } = toWhole(db, body.variantId, body.quantity);
      const v = db
        .select({
          variantName: itemVariants.name,
          price: itemVariants.priceCents,
          itemName: menuItems.name,
          vActive: itemVariants.active,
          iActive: menuItems.active,
        })
        .from(itemVariants)
        .innerJoin(menuItems, eq(menuItems.id, itemVariants.itemId))
        .where(eq(itemVariants.id, variantId))
        .get();
      if (!v || !v.vActive || !v.iActive) fail(400, 'Item do cardápio não encontrado ou inativo.');
      db.insert(orderItems)
        .values({
          orderId: id,
          variantId,
          itemName: v!.itemName,
          variantName: v!.variantName,
          unitPriceCents: v!.price,
          quantity,
          note: body.note,
          createdAt: Date.now(),
        })
        .run();
      return c.json(getOrderDetail(db, id), 201);
    })
    .patch('/:id/items/:itemId', validate('param', orderItemParam), validate('json', updateOrderItemSchema), (c) => {
      const { id, itemId } = c.req.valid('param');
      const body = c.req.valid('json');
      db.transaction((tx) => {
        const order = loadOrder(tx, id);
        if (order.status !== 'open') fail(409, 'Só é possível alterar itens de pedidos abertos.');
        const item = tx
          .select()
          .from(orderItems)
          .where(and(eq(orderItems.id, itemId), eq(orderItems.orderId, id)))
          .get();
        if (!item) fail(404, 'Item não encontrado neste pedido.');
        if (item!.status !== 'active') fail(409, 'Este item foi removido.');
        if (item!.paymentId) fail(409, 'Este item já foi pago e não pode ser alterado. Exclua o pagamento antes.');
        const set: Partial<typeof orderItems.$inferInsert> = {};
        if (body.note !== undefined) set.note = body.note;
        if (body.quantity !== undefined) {
          const { total, paid } = sums(tx, id);
          if (total + item!.unitPriceCents * (body.quantity - item!.quantity) < paid)
            fail(409, 'A alteração deixaria o total menor que o valor já pago. Ajuste os pagamentos antes.');
          const whole = toWhole(tx, item!.variantId, body.quantity);
          set.quantity = whole.quantity;
          // keep the snapshot price: a whole costs two halves as they were priced on this order
          if (whole.variantId !== item!.variantId)
            Object.assign(set, { variantId: whole.variantId, variantName: whole.variantName, unitPriceCents: item!.unitPriceCents * 2 });
        }
        if (Object.keys(set).length) tx.update(orderItems).set(set).where(eq(orderItems.id, itemId)).run();
        settle(tx, id);
      });
      return c.json(getOrderDetail(db, id));
    })
    .post('/:id/items/:itemId/remove', validate('param', orderItemParam), validate('json', removeItemSchema), (c) => {
      const { id, itemId } = c.req.valid('param');
      const { reason } = c.req.valid('json');
      db.transaction((tx) => {
        const order = loadOrder(tx, id);
        if (order.status !== 'open') fail(409, 'Só é possível remover itens de pedidos abertos.');
        const item = tx
          .select()
          .from(orderItems)
          .where(and(eq(orderItems.id, itemId), eq(orderItems.orderId, id)))
          .get();
        if (!item) fail(404, 'Item não encontrado neste pedido.');
        if (item!.status !== 'active') fail(409, 'Este item já foi removido.');
        if (item!.paymentId) fail(409, 'Este item já foi pago e não pode ser removido. Exclua o pagamento antes.');
        const { total, paid } = sums(tx, id);
        if (total - item!.unitPriceCents * item!.quantity < paid)
          fail(409, 'Remover este item deixaria o total menor que o valor já pago. Ajuste os pagamentos antes.');
        tx.update(orderItems)
          .set({ status: 'removed', removedReason: reason ?? null, removedAt: Date.now() })
          .where(eq(orderItems.id, itemId))
          .run();
        settle(tx, id);
      });
      return c.json(getOrderDetail(db, id));
    })
    .post('/:id/cancel', validate('param', idParam), validate('json', reasonSchema), (c) => {
      const { id } = c.req.valid('param');
      const { reason } = c.req.valid('json');
      db.transaction((tx) => {
        const order = loadOrder(tx, id);
        if (order.status === 'cancelled') fail(409, 'Pedido já está cancelado.');
        if (sums(tx, id).paid > 0 || order.status === 'paid')
          fail(409, 'Pedido possui pagamentos. Exclua os pagamentos antes de cancelar.');
        tx.update(orders)
          .set({ status: 'cancelled', cancelReason: reason, closedAt: Date.now() })
          .where(eq(orders.id, id))
          .run();
      });
      return c.json(getOrderDetail(db, id));
    })
    .post('/:id/payments', validate('param', idParam), validate('json', createPaymentSchema), (c) => {
      const { id } = c.req.valid('param');
      const body = c.req.valid('json');
      db.transaction((tx) => {
        const order = loadOrder(tx, id);
        if (order.status !== 'open') fail(409, 'Este pedido não está aberto.');
        const { total, paid } = sums(tx, id);
        if (total <= 0) fail(409, 'Pedido sem itens não pode ser pago.');
        if (body.amountCents > total - paid) fail(400, 'Valor maior que o restante a pagar.');
        let itemIds: number[] = [];
        if (body.orderItemIds) {
          itemIds = [...new Set(body.orderItemIds)];
          const rows = tx
            .select()
            .from(orderItems)
            .where(and(eq(orderItems.orderId, id), inArray(orderItems.id, itemIds)))
            .all();
          if (rows.length !== itemIds.length) fail(400, 'Item não pertence a este pedido.');
          if (rows.some((r) => r.status !== 'active' || r.paymentId)) fail(409, 'Item removido ou já pago.');
          if (rows.reduce((s, r) => s + r.unitPriceCents * r.quantity, 0) !== body.amountCents)
            fail(400, 'Valor diferente da soma dos itens selecionados.');
        }
        const p = tx
          .insert(payments)
          .values({
            orderId: id,
            method: body.method,
            amountCents: body.amountCents,
            ...checkCash(body.method, body.amountCents, body.receivedCents),
            createdAt: Date.now(),
          })
          .returning({ id: payments.id })
          .get();
        if (itemIds.length) tx.update(orderItems).set({ paymentId: p.id }).where(inArray(orderItems.id, itemIds)).run();
        settle(tx, id);
      });
      return c.json(getOrderDetail(db, id), 201);
    })
    .patch('/:id/payments/:paymentId', validate('param', paymentParam), validate('json', updatePaymentSchema), (c) => {
      const { id, paymentId } = c.req.valid('param');
      const body = c.req.valid('json');
      db.transaction((tx) => {
        const order = loadOrder(tx, id);
        if (order.status === 'cancelled') fail(409, 'Pedido cancelado não pode ter pagamentos alterados.');
        const p = tx
          .select()
          .from(payments)
          .where(and(eq(payments.id, paymentId), eq(payments.orderId, id)))
          .get();
        if (!p) fail(404, 'Pagamento não encontrado.');
        const method = body.method ?? p!.method;
        const amount = body.amountCents ?? p!.amountCents;
        const received = body.receivedCents !== undefined ? body.receivedCents : p!.receivedCents;
        const { total, paid } = sums(tx, id);
        if (paid - p!.amountCents + amount > total) fail(400, 'Valor maior que o restante a pagar.');
        const cash = checkCash(method, amount, received);
        if (amount !== p!.amountCents)
          tx.update(orderItems).set({ paymentId: null }).where(eq(orderItems.paymentId, paymentId)).run();
        tx.update(payments).set({ method, amountCents: amount, ...cash }).where(eq(payments.id, paymentId)).run();
        settle(tx, id);
      });
      return c.json(getOrderDetail(db, id));
    })
    .delete('/:id/payments/:paymentId', validate('param', paymentParam), (c) => {
      const { id, paymentId } = c.req.valid('param');
      db.transaction((tx) => {
        const order = loadOrder(tx, id);
        if (order.status === 'cancelled') fail(409, 'Pedido cancelado não pode ter pagamentos alterados.');
        const p = tx
          .select()
          .from(payments)
          .where(and(eq(payments.id, paymentId), eq(payments.orderId, id)))
          .get();
        if (!p) fail(404, 'Pagamento não encontrado.');
        tx.update(orderItems).set({ paymentId: null }).where(eq(orderItems.paymentId, paymentId)).run();
        tx.delete(payments).where(eq(payments.id, paymentId)).run();
        settle(tx, id);
      });
      return c.json(getOrderDetail(db, id));
    });
}
