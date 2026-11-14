import { z } from 'zod';

export const paymentMethods = ['dinheiro', 'credito', 'debito', 'pix'] as const;
export type PaymentMethod = (typeof paymentMethods)[number];
export const paymentMethodLabels: Record<PaymentMethod, string> = {
  dinheiro: 'Dinheiro',
  credito: 'Crédito',
  debito: 'Débito',
  pix: 'Pix',
};

export const orderStatuses = ['open', 'paid', 'cancelled'] as const;
export type OrderStatus = (typeof orderStatuses)[number];
export const orderStatusLabels: Record<OrderStatus, string> = {
  open: 'Aberto',
  paid: 'Pago',
  cancelled: 'Cancelado',
};

const id = z.coerce.number().int().positive();
const cents = z.number().int();
const text = (max = 200) => z.string().trim().min(1, 'Campo obrigatório').max(max);
const optionalText = (max = 500) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    // undefined stays undefined (PATCH: leave unchanged); '' / null become null (clear).
    .transform((s) => (s === undefined ? undefined : s || null));

export const loginSchema = z.object({ pin: z.string().min(1).max(64) });

export const createCategorySchema = z.object({
  name: text(),
  position: z.number().int().optional(),
});
export const updateCategorySchema = z.object({
  name: text().optional(),
  position: z.number().int().optional(),
  active: z.boolean().optional(),
});

export const variantInputSchema = z.object({
  id: id.optional(),
  name: optionalText(100),
  priceCents: cents.nonnegative(),
});
export const createItemSchema = z.object({
  categoryId: id,
  name: text(),
  description: optionalText(),
  variants: z.array(variantInputSchema).min(1, 'Informe ao menos um preço'),
});
export const updateItemSchema = z.object({
  categoryId: id.optional(),
  name: text().optional(),
  description: optionalText(),
  active: z.boolean().optional(),
  variants: z.array(variantInputSchema).min(1, 'Informe ao menos um preço').optional(),
});

export const listOrdersQuerySchema = z.object({
  status: z.enum(orderStatuses).optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});
export const createOrderSchema = z.object({ customerName: text(100) });
export const addOrderItemSchema = z.object({
  variantId: id,
  quantity: z.number().int().positive().max(999),
  note: optionalText(),
});
export const updateOrderItemSchema = z.object({
  quantity: z.number().int().positive().max(999).optional(),
  note: optionalText(),
});
export const reasonSchema = z.object({ reason: text(500) });
export const removeItemSchema = z.object({ reason: optionalText() });

export const createPaymentSchema = z.object({
  method: z.enum(paymentMethods),
  amountCents: cents.positive(),
  receivedCents: cents.positive().nullish(),
  orderItemIds: z.array(id).min(1).optional(),
});
export const updatePaymentSchema = z.object({
  method: z.enum(paymentMethods).optional(),
  amountCents: cents.positive().optional(),
  receivedCents: cents.positive().nullish(),
});

export const idParam = z.object({ id });
export const orderItemParam = z.object({ id, itemId: id });
export const paymentParam = z.object({ id, paymentId: id });
export * from './money';
