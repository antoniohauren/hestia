import { hc, type InferResponseType } from 'hono/client';
import type { AppType } from '@hestia/api';

export const client = hc<AppType>('/');
export const api = client.api;

type Json<R> = R extends { json(): Promise<infer J> } ? J : never;

/** Awaits an hc call; throws Error(<pt-BR message>) on non-2xx. 401 sends the user to /login. */
export async function call<R extends { ok: boolean; status: number; json(): Promise<any> }>(p: Promise<R>): Promise<Exclude<Json<R>, { error: string }>> {
  const res = await p;
  if (res.ok) return res.json();
  if (res.status === 401 && location.pathname !== '/login') location.assign('/login');
  const body = await res.json().catch(() => null);
  throw new Error(body?.error ?? `Erro ${res.status}`);
}

export type Menu = Exclude<InferResponseType<typeof api.menu.$get>, { error: string }>;
export type Category = Menu[number];
export type MenuItem = Category['items'][number];
export type Variant = MenuItem['variants'][number];
export type OrderDetail = Exclude<InferResponseType<(typeof api.orders)[':id']['$get']>, { error: string }>;
export type OrderItem = OrderDetail['items'][number];
export type Payment = OrderDetail['payments'][number];
export type OrderSummary = Exclude<InferResponseType<typeof api.orders.$get>, { error: string }>[number];
