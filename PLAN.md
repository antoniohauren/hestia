# Hestia — v1 Implementation Plan

Order-taking app for the counter of a Japanese/Brazilian restaurant ("Ksa do Sushi").
One cashier writes down customer orders, keeps tabs open, and closes bills with split payments.
This document is the full spec. A fresh session should be able to implement v1 from it alone.

---

## 1. Decisions (already agreed with the user — do not re-litigate)

| Topic | Decision |
|---|---|
| Users | One cashier at the counter. No kitchen screen, no printing. |
| Platform | Web app on a small **local server**; other devices on the restaurant Wi-Fi use it via browser. |
| Layout | **Desktop-first**, must also work on a normal phone. |
| Language | UI in **pt-BR**, currency **R$** (format with `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`). |
| Monorepo | **Bun workspaces**. |
| API | **Hono** on Bun. |
| DB | **SQLite** via `bun:sqlite` + **Drizzle ORM** (with drizzle-kit migrations). |
| Web | **React + Vite SPA** (no SSR, no TanStack Start). |
| Shared types | `packages/types` (zod schemas + inferred TS types) **and** Hono RPC (`hc<AppType>`) for the typed client. RPC is new to the user — keep it simple and working. |
| Auth | Single shared **PIN**, from env var `HESTIA_PIN`. No user accounts. |
| Order identity | Customer **name** only. No uniqueness check (cashier differentiates names). |
| Order flow | Either an **open tab** (items added over time) or **paid immediately** — same screens. |
| Order items | Menu item + variant, **quantity**, optional free-text **note** ("sem cebola"). |
| Edits | Removing an item or cancelling an order **requires a reason**; both are kept (soft delete). |
| Payment methods | `dinheiro`, `credito`, `debito`, `pix`. |
| Split bill | **Equal parts**, **custom amounts**, **by items**. Each part has its own method. Dinheiro parts compute change (troco). |
| History | Full history of orders, searchable by date. |
| Menu | Categories + items editable in-app. Item has optional description and one or more **variants** (named options with own price). |
| Half portion | "Meio" = smaller portion of the same item, **50% of full price**, modelled as a variant. Never half-and-half flavors. |
| Combos | A combo is one item with a fixed price. Customer may swap pieces for any piece from the combo list at the same price — cashier writes swaps in the item note. No sub-item picker. |
| Search | Primary way to add items. Matches item name and category name, **accent- and case-insensitive** ("porcoes" finds "Porções", "kani" lists the Kani category items plus any item with "kani" in its name). |
| Out of v1 | Discounts, service fee, reports, user accounts, kitchen view, printing. |

---

## 2. Repo layout

```
hestia/
  package.json            # { "private": true, "workspaces": ["apps/*", "packages/*"] }
  tsconfig.base.json
  .env.example            # HESTIA_PIN=, HESTIA_SECRET=, DATABASE_PATH=./data/hestia.db, PORT=3000, TZ=America/Sao_Paulo
  seed/menu.json          # menu extracted from the printed cardápio (already exists, see §7)
  apps/
    api/                  # @hestia/api — Hono + Drizzle
      src/
        index.ts          # Bun.serve entry; in production also serves apps/web/dist
        app.ts            # builds the Hono app, exports `type AppType`
        env.ts            # reads + validates env (fail fast if HESTIA_PIN/HESTIA_SECRET missing)
        db/
          schema.ts
          client.ts
          seed.ts         # reads ../../seed/menu.json, inserts if categories table is empty
        routes/
          auth.ts
          menu.ts
          orders.ts
        lib/
          money.ts        # totals, equal split, change
      drizzle/            # generated migrations
      drizzle.config.ts
    web/                  # @hestia/web — React + Vite
      src/
        main.tsx
        api.ts            # hc<AppType>('/') client
        lib/search.ts     # normalize + filter
        lib/format.ts     # BRL formatting
        pages/...
      vite.config.ts      # dev proxy: /api -> http://localhost:3000
  packages/
    types/                # @hestia/types — zod schemas + TS types shared by api and web
      src/index.ts
```

`apps/web` depends on `@hestia/api` **type-only** (`import type { AppType } from '@hestia/api'`) for RPC, and on `@hestia/types` for schemas/enums.

**Runtime:** in dev, run api and web separately (`bun run dev` at root runs both). In production, `bun run build` builds the web app; the api serves `apps/web/dist` with Hono `serveStatic` plus SPA fallback to `index.html` — so the restaurant runs **one process**.

---

## 3. Data model (Drizzle, SQLite)

All money is **integer cents**. All timestamps are integer **unix ms** (UTC).

```
categories
  id            integer pk
  name          text not null
  position      integer not null         -- user-controlled order (best sellers first)
  active        integer(bool) not null default 1

menu_items
  id            integer pk
  category_id   integer not null -> categories.id
  name          text not null
  description   text null
  position      integer not null default 0
  active        integer(bool) not null default 1   -- never hard-delete; past orders reference it

item_variants
  id            integer pk
  item_id       integer not null -> menu_items.id
  name          text null                -- null = single-price item; else "4 un", "Inteiro", "Meio", "Copo"...
  price_cents   integer not null
  position      integer not null default 0
  active        integer(bool) not null default 1

orders
  id            integer pk
  customer_name text not null
  status        text not null            -- 'open' | 'paid' | 'cancelled'
  cancel_reason text null
  created_at    integer not null
  closed_at     integer null             -- set when paid or cancelled

order_items
  id                integer pk
  order_id          integer not null -> orders.id
  variant_id        integer not null -> item_variants.id
  item_name         text not null        -- SNAPSHOT at time of adding
  variant_name      text null            -- SNAPSHOT
  unit_price_cents  integer not null     -- SNAPSHOT (menu price changes never alter old orders)
  quantity          integer not null check (quantity > 0)
  note              text null
  status            text not null default 'active'   -- 'active' | 'removed'
  removed_reason    text null
  removed_at        integer null
  payment_id        integer null -> payments.id      -- set when paid "by items"
  created_at        integer not null

payments
  id              integer pk
  order_id        integer not null -> orders.id
  method          text not null          -- 'dinheiro' | 'credito' | 'debito' | 'pix'
  amount_cents    integer not null check (amount_cents > 0)
  received_cents  integer null           -- dinheiro only: cash handed over
  change_cents    integer null           -- dinheiro only: received - amount
  created_at      integer not null
```

Derived values (computed, not stored):
- `order total` = Σ `unit_price_cents * quantity` over `order_items` with `status = 'active'`.
- `paid` = Σ `payments.amount_cents`.
- `remaining` = total − paid.

---

## 4. Business rules

1. Items can be added to / removed from an order only while `status = 'open'`.
2. Removing an item: soft delete (`status='removed'`, `removed_reason` required, non-empty). An item already linked to a payment (`payment_id` not null) cannot be removed.
3. Cancelling an order: `cancel_reason` required. Only allowed when the order has **no payments** (otherwise the cashier must sort it out manually — return error message in pt-BR).
4. Adding a payment:
   - `amount_cents` must be `> 0` and `<= remaining`.
   - `dinheiro`: `received_cents` required and `>= amount_cents`; server computes `change_cents`.
   - Other methods: `received_cents`/`change_cents` stay null.
   - Optional `orderItemIds` (by-items split): every id must belong to the order, be active, and be unpaid; `amount_cents` must equal their sum; set their `payment_id`.
   - When `remaining` reaches 0 → `status='paid'`, `closed_at=now`. Do it in one DB transaction.
5. An order with zero active items cannot be paid.
5a. **Payments are freely editable** (user: "payment is not that important in v1, just allow the user to edit"). Any payment can be edited (method, amount, received) or deleted, on open **and** paid orders, no reason required.
   - Same validation as when adding (amount > 0, total paid ≤ order total, dinheiro needs `received_cents >= amount_cents`; recompute `change_cents`).
   - Editing the amount of a by-items payment, or deleting any payment, clears `payment_id` on its linked items.
   - After the edit, recompute: remaining = 0 → `paid` (set `closed_at` if not set); remaining > 0 on a `paid` order → back to `open`, `closed_at = null`.
   - Not allowed on `cancelled` orders.
6. Equal split (in `lib/money.ts`, used by web; tested): `splitEqual(totalCents, n)` returns n integer parts summing exactly to the total; the remainder cents go to the first parts. E.g. 10000 / 3 → [3334, 3333, 3333].
7. Menu edits: categories/items/variants are deactivated, never deleted. Inactive ones are hidden from search but still shown on old orders (via snapshots).

---

## 5. API (all under `/api`, JSON, zod-validated with `@hono/zod-validator`)

Build routes with **chained** calls (`new Hono().get(...).post(...)`) and `app.route('/api/...', sub)` so `AppType` carries full types for `hc`.

**Auth**
- `POST /api/auth/login` `{ pin }` → compares to `HESTIA_PIN` (constant-time), sets signed HttpOnly cookie (`setSignedCookie`, secret `HESTIA_SECRET`, `SameSite=Lax`, ~30 days).
  Throttle: after 5 wrong PINs, reject login for 1 minute (in-memory counter is fine — `shortcut:` comment).
- `POST /api/auth/logout` → clears cookie.
- `GET /api/auth/me` → 200 if logged in, 401 otherwise.
- Middleware: every `/api/*` route except `login` requires the cookie → 401.

**Menu**
- `GET /api/menu?all=1` → categories (ordered by position) with items and variants. Without `all`, only active rows.
- `POST /api/categories` `{ name, position? }`, `PATCH /api/categories/:id` `{ name?, position?, active? }`
- `POST /api/items` `{ categoryId, name, description?, variants: [{ name|null, priceCents }] }`
- `PATCH /api/items/:id` `{ categoryId?, name?, description?, active?, variants? }` — variants: update existing by id, insert new, deactivate missing.

**Orders**
- `GET /api/orders?status=open` → open orders with totals (main screen).
- `GET /api/orders?date=YYYY-MM-DD` → orders created that local day (`TZ=America/Sao_Paulo`), any status, with totals (history).
- `POST /api/orders` `{ customerName }` → new open order.
- `GET /api/orders/:id` → order + items (incl. removed, with reasons) + payments + total/paid/remaining.
- `POST /api/orders/:id/items` `{ variantId, quantity, note? }` → snapshots name/variant/price.
- `POST /api/orders/:id/items/:itemId/remove` `{ reason }`
- `POST /api/orders/:id/cancel` `{ reason }`
- `POST /api/orders/:id/payments` `{ method, amountCents, receivedCents?, orderItemIds? }`
- `PATCH /api/orders/:id/payments/:paymentId` `{ method?, amountCents?, receivedCents? }`
- `DELETE /api/orders/:id/payments/:paymentId`

Errors: `{ error: "<mensagem em pt-BR>" }` with 400/401/404/409.

`packages/types` exports: `paymentMethods = ['dinheiro','credito','debito','pix'] as const`, `PaymentMethod`, the zod request schemas above, and labels (`{ dinheiro: 'Dinheiro', credito: 'Crédito', debito: 'Débito', pix: 'Pix' }`).

---

## 6. Web screens (pt-BR)

Use plain CSS (or CSS modules) — no UI library needed. Big click targets; works at 360px width.
Server state: `@tanstack/react-query` wrapping the `hc` client is recommended (refetch after mutations). Routing: `react-router` (few routes).

1. **Login** `/login` — PIN input (numeric keypad on phone: `inputMode="numeric"`), "Entrar".
2. **Pedidos** `/` — list of open orders: customer name, item count, total, time opened. Big "Novo pedido" button → ask customer name → go to the order.
3. **Pedido** `/pedidos/:id` — the main working screen:
   - **Search box, autofocused.** Results update on every keystroke (whole menu is ~80 items: load once via `GET /api/menu`, filter client-side).
   - With an empty search, show category chips (ordered by position) to browse.
   - Pick result → if more than one variant, choose variant (e.g. `4 un R$ 13,00` / `8 un R$ 26,00`, `Inteiro` / `Meio`) → quantity (default 1) + optional note → add.
   - Keyboard: ↑/↓ moves through results, Enter selects, Esc clears search.
   - Item list: qty × name (variant), note, line total; "Remover" asks for a reason.
   - Footer: total, buttons **Fechar conta** and **Cancelar pedido** (asks reason).
4. **Fechar conta** (route `/pedidos/:id/pagar` or a panel) — shows total, paid, remaining, payments made so far.
   - Modes (tabs): **Tudo** (one payment for remaining), **Dividir igual** (choose N people → N parts via `splitEqual`), **Valor** (type amount), **Por itens** (tick unpaid items → amount = sum).
   - Each payment: method buttons (Dinheiro / Crédito / Débito / Pix). If Dinheiro: "Valor recebido" input → shows **Troco**.
   - Payments are registered one at a time; when remaining hits 0 → "Pago" and return to Pedidos.
   - Each payment in the list has **Editar** (method / amount / valor recebido) and **Excluir**. Also reachable from a paid order in Histórico.
5. **Histórico** `/historico` — date picker (default today), list of orders with status/total; open one (shows removed items + reasons, cancel reason, payments with methods and troco). Items are read-only there; payments of non-cancelled orders can be edited/deleted.
6. **Cardápio** `/cardapio` — manage categories (name, order up/down, active toggle) and items (name, description, category, active, variants list with name + price). Price input in reais, converted to cents.

Search normalization (`lib/search.ts`, tested):
```ts
const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
// item matches if every query word appears in norm(item.name + ' ' + category.name)
```

---

## 7. Seed data

`seed/menu.json` was extracted from photos of the printed cardápio and reviewed with the user.
14 categories, 76 items. Prices there are in **reais** (e.g. `19.5`) — convert to integer cents with `Math.round(price * 100)` when seeding.

Format:
```json
{ "categories": [ { "name": "Porções", "position": 0,
    "items": [ { "name": "...", "description": "..." | null,
                 "variants": [ { "name": "4 un" | null, "price": 13 } ] } ] } ] }
```

Notes already settled with the user:
- Entradas, Petiscos, Batatas fritas, Macaxeiras → merged into **Porções**.
- **Temaki Hot** is its own category (user relies on search; keep categories tidy).
- **Sushi Dog** items have `Inteiro` / `Meio` variants (Meio = 50%).
- Kani atum 8 un = R$ 25 (not 26) is intentional — keep.
- Vinhos left out (no fixed price).
- Sashimi has one item (Salmão, R$ 6 / unidade) — correct.

`apps/api/src/db/seed.ts`: runs on startup (or `bun run seed`) and inserts only if `categories` is empty.

---

## 8. Build order (each step ends runnable)

1. Root workspace, `tsconfig.base.json`, `.env.example`, `.gitignore` (`node_modules`, `data/`, `.env`, `dist`). `git init`.
2. `packages/types`: enums, zod schemas, labels.
3. `apps/api`: env, Drizzle schema, migration, seed, `GET /api/menu`. Check with `curl`.
4. Auth (login/logout/me + middleware + throttle).
5. Orders: create, list, get, add item, remove item, cancel.
6. Payments + `lib/money.ts` (+ tests).
7. `apps/web`: Vite + React, `hc` client, login, Pedidos, Pedido with search.
8. Fechar conta with all split modes and troco.
9. Histórico.
10. Cardápio editor.
11. Production serve (api serves web dist), root scripts: `dev`, `build`, `start`, `seed`, `test`. Short README: how to install Bun, set `.env`, run on the restaurant PC, and open from a phone (`http://<pc-ip>:3000`).

---

## 9. Tests (`bun test`)

Keep it small, cover the logic that touches money:
- `lib/money.ts`: `splitEqual` sums exactly; change calculation.
- `lib/search.ts`: accents/case ("porcoes" → Porções), multi-word, category-name match.
- API via `app.request()` against an in-memory SQLite (`:memory:`): add items → total; remove item excluded from total; overpayment rejected; dinheiro without `received_cents` rejected; by-items payment marks items; order becomes `paid` when remaining = 0; cancel blocked when payments exist; editing/deleting a payment on a paid order reopens it when remaining > 0; 401 without cookie.

---

## 10. Resolved with the user (2026-11-13)

- **Mistaken payments:** payments are freely editable/deletable (see §4 rule 5a). Payments are low priority in v1 — keep this simple.
- **Reducing quantity** of a line: remove (with reason) + re-add. No quantity editing in v1.
- **Combo rule:** confirmed — customer can swap pieces within the combo list at no price change; cashier writes swaps in the note.
- **Backups** of `data/hestia.db`: out of v1; revisit later (e.g. daily file copy).
