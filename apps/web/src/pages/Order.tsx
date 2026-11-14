import { orderStatusLabels } from '@hestia/types';
import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { api, call, type MenuItem, type OrderDetail, type OrderItem } from '../api';
import { ErrorText, Modal, ReasonDialog, hasKeyboard } from '../components';
import { brl, dateTime, priceLabel } from '../lib/format';
import { matchVariant, searchItems } from '../lib/search';
import { useMenu, useOrder, useOrderMutation } from '../queries';

type Pickable = MenuItem & { categoryName: string };

export function OrderPage() {
  const id = Number(useParams().id);
  const order = useOrder(id);
  if (order.error) return <ErrorText error={order.error} />;
  if (!order.data) return <p className="muted">Carregando…</p>;
  return <OrderView order={order.data} />;
}

function OrderView({ order }: { order: OrderDetail }) {
  const navigate = useNavigate();
  const open = order.status === 'open';
  const [removing, setRemoving] = useState<OrderItem | null>(null);
  const [editing, setEditing] = useState<OrderItem | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [adding, setAdding] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const modalSearchRef = useRef<HTMLInputElement>(null);

  const remove = useOrderMutation(order.id, (v: { itemId: number; reason: string }) =>
    call(
      api.orders[':id'].items[':itemId'].remove.$post({
        param: { id: String(order.id), itemId: String(v.itemId) },
        json: { reason: v.reason },
      }),
    ),
  );
  const cancel = useOrderMutation(order.id, (reason: string) =>
    call(api.orders[':id'].cancel.$post({ param: { id: String(order.id) }, json: { reason } })),
  );

  const active = order.items.filter((i) => i.status === 'active');
  // Removed without a reason = a plain mistake fix; only reasoned removals are worth showing.
  const removed = order.items.filter((i) => i.status === 'removed' && i.removedReason);

  return (
    <div className={open ? 'order-layout' : 'page'}>
      {open && <ItemPicker orderId={order.id} searchRef={searchRef} />}

      <section className="order-panel">
        <div className="row between wrap">
          <h1>{order.customerName}</h1>
          <span className={`badge ${order.status}`}>{orderStatusLabels[order.status]}</span>
        </div>
        <p className="muted small">
          Aberto {dateTime(order.createdAt)}
          {order.closedAt && ` · fechado ${dateTime(order.closedAt)}`}
        </p>
        {order.cancelReason && <p className="notice">Motivo do cancelamento: {order.cancelReason}</p>}

        {active.length === 0 && <p className="muted">Nenhum item ainda.</p>}
        <ul className="items">
          {active.map((it) => (
            <li key={it.id} className="item-line">
              <span className="qty">{it.quantity}×</span>
              {open && !it.paymentId ? (
                <button className="link grow left item-btn editable" onClick={() => setEditing(it)} aria-label={`Editar ${it.itemName}`}>
                  <ItemLabel it={it} />
                </button>
              ) : (
                <span className="grow">
                  <ItemLabel it={it} />
                </span>
              )}
              <span className="amount">{brl(it.unitPriceCents * it.quantity)}</span>
              {open &&
                (it.paymentId ? (
                  <span className="badge paid">pago</span>
                ) : (
                  <button className="small-btn" onClick={() => setRemoving(it)} aria-label={`Remover ${it.itemName}`}>
                    Remover
                  </button>
                ))}
            </li>
          ))}
        </ul>

        {removed.length > 0 && (
          <details className="removed">
            <summary>{removed.length} removido(s)</summary>
            <ul className="items">
              {removed.map((it) => (
                <li key={it.id} className="item-line">
                  <span className="qty">{it.quantity}×</span>
                  <span className="grow">
                    <s>
                      {it.itemName}
                      {it.variantName && ` (${it.variantName})`}
                    </s>
                    {it.removedReason && <span className="note">Motivo: {it.removedReason}</span>}
                  </span>
                  <s className="amount muted">{brl(it.unitPriceCents * it.quantity)}</s>
                </li>
              ))}
            </ul>
          </details>
        )}

        <div className="order-footer">
          <div className="totals">
            <span>Total</span>
            <strong>{brl(order.totalCents)}</strong>
            {order.paidCents > 0 && (
              <>
                <span className="muted">Pago</span>
                <span>{brl(order.paidCents)}</span>
                <span className="muted">Restante</span>
                <span>{brl(order.remainingCents)}</span>
              </>
            )}
          </div>
          <div className="row wrap">
            {open && (
              <button className="add-items" onClick={() => setAdding(true)}>
                + Adicionar itens
              </button>
            )}
            {open && (
              <button className="primary big" disabled={order.totalCents === 0} onClick={() => navigate(`/pedidos/${order.id}/pagar`)}>
                Fechar conta
              </button>
            )}
            {open && order.paidCents === 0 && (
              <button className="danger-outline" onClick={() => setCancelling(true)}>
                Cancelar pedido
              </button>
            )}
            {order.status === 'paid' && (
              <Link className="button" to={`/pedidos/${order.id}/pagar`}>
                Pagamentos
              </Link>
            )}
            {order.status === 'cancelled' && order.payments.length > 0 && (
              <Link className="button" to={`/pedidos/${order.id}/pagar`}>
                Pagamentos
              </Link>
            )}
          </div>
          {open && order.paidCents > 0 && (
            <p className="muted small">
              Para cancelar, exclua os pagamentos em <Link to={`/pedidos/${order.id}/pagar`}>Fechar conta</Link>.
            </p>
          )}
        </div>
      </section>

      {removing && (
        <ReasonDialog
          title={`Remover ${removing.quantity}× ${removing.itemName}?`}
          confirmLabel="Remover"
          optional
          pending={remove.isPending}
          error={remove.error}
          onClose={() => {
            setRemoving(null);
            remove.reset();
          }}
          onConfirm={(reason) =>
            remove.mutate({ itemId: removing.id, reason }, { onSuccess: () => (setRemoving(null), hasKeyboard && searchRef.current?.focus()) })
          }
        />
      )}
      {adding && (
        <Modal title="Adicionar itens" onClose={() => setAdding(false)}>
          <ItemPicker orderId={order.id} searchRef={modalSearchRef} onClose={() => setAdding(false)} />
        </Modal>
      )}
      {editing && <EditItemDialog orderId={order.id} item={editing} onClose={() => setEditing(null)} />}
      {cancelling && (
        <ReasonDialog
          title="Cancelar pedido?"
          confirmLabel="Cancelar pedido"
          pending={cancel.isPending}
          error={cancel.error}
          onClose={() => setCancelling(false)}
          onConfirm={(reason) => cancel.mutate(reason, { onSuccess: () => navigate('/') })}
        />
      )}
    </div>
  );
}

function ItemLabel({ it }: { it: OrderItem }) {
  return (
    <span>
      {it.itemName}
      {it.variantName && <span className="muted"> ({it.variantName})</span>}
      {it.note && <span className="note">{it.note}</span>}
    </span>
  );
}

function Stepper({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="field">
      Quantidade
      <div className="stepper">
        <button type="button" onClick={() => onChange(Math.max(1, value - 1))} aria-label="Menos">
          −
        </button>
        <input
          inputMode="numeric"
          value={value}
          aria-label="Quantidade"
          onChange={(e) => onChange(Math.max(1, Math.min(999, Number(e.target.value.replace(/\D/g, '')) || 1)))}
        />
        <button type="button" onClick={() => onChange(Math.min(999, value + 1))} aria-label="Mais">
          +
        </button>
      </div>
    </div>
  );
}

function EditItemDialog({ orderId, item, onClose }: { orderId: number; item: OrderItem; onClose: () => void }) {
  const [qty, setQty] = useState(item.quantity);
  const [note, setNote] = useState(item.note ?? '');
  const save = useOrderMutation(orderId, () =>
    call(
      api.orders[':id'].items[':itemId'].$patch({
        param: { id: String(orderId), itemId: String(item.id) },
        json: { quantity: qty, note: note.trim() || null },
      }),
    ),
  );
  return (
    <Modal title={item.variantName ? `${item.itemName} (${item.variantName})` : item.itemName} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate(undefined, { onSuccess: onClose });
        }}
      >
        <Stepper value={qty} onChange={setQty} />
        <label className="field">
          Observação
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="ex.: sem cebola" maxLength={500} />
        </label>
        <ErrorText error={save.error} />
        <div className="row end">
          <button type="button" onClick={onClose}>
            Voltar
          </button>
          <button className="primary" disabled={save.isPending}>
            Salvar {brl(item.unitPriceCents * qty)}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// With onClose the picker lives inside a modal: picking an item swaps to the add step in place instead of stacking a second modal.
function ItemPicker({
  orderId,
  searchRef,
  onClose,
}: {
  orderId: number;
  searchRef: React.RefObject<HTMLInputElement | null>;
  onClose?: () => void;
}) {
  const menu = useMenu();
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState<number | 'all'>('all');
  const [showCats, setShowCats] = useState(false);
  const [index, setIndex] = useState(0);
  const [picking, setPicking] = useState<Pickable | null>(null);

  const all = useMemo<Pickable[]>(
    () =>
      (menu.data ?? []).flatMap((c) => c.items.filter((i) => i.variants.length).map((i) => ({ ...i, categoryName: c.name }))),
    [menu.data],
  );
  const results = query.trim()
    ? searchItems(all, query)
    : categoryId === 'all'
      ? all
      : all.filter((i) => i.categoryId === categoryId);
  const sel = Math.min(index, Math.max(results.length - 1, 0));

  function reset() {
    setQuery('');
    setCategoryId('all');
    setIndex(0);
    if (hasKeyboard) searchRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIndex(Math.min(sel + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndex(Math.max(sel - 1, 0));
    } else if (e.key === 'Enter' && results[sel]) {
      e.preventDefault();
      setPicking(results[sel]);
    } else if (e.key === 'Escape') {
      reset();
    }
  }

  const addStep = picking && (
    <AddItemDialog
      orderId={orderId}
      item={picking}
      initialVariant={matchVariant(picking, query)}
      inline={!!onClose}
      onClose={() => {
        setPicking(null);
        if (hasKeyboard) searchRef.current?.focus();
      }}
      onAdded={() => {
        setPicking(null);
        reset();
      }}
    />
  );
  if (onClose && addStep) return addStep;

  return (
    <section className="picker">
      <div className="row">
        <input
          ref={searchRef}
          className="search"
          type="search"
          autoFocus={hasKeyboard}
          autoComplete="off"
          placeholder="Buscar…"
          aria-label="Buscar item"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIndex(0);
          }}
          onKeyDown={onKeyDown}
        />
        <button className="cat-toggle" aria-expanded={showCats} onClick={() => setShowCats(!showCats)}>
          Categorias
        </button>
      </div>
      <ErrorText error={menu.error} />
      {!query.trim() && (
        <div className={showCats ? 'chips expanded' : 'chips'}>
          {[{ id: 'all' as const, name: 'Todos' }, ...(menu.data ?? [])].map((c) => (
            <button
              key={c.id}
              className={categoryId === c.id ? 'chip active' : 'chip'}
              onClick={() => {
                setCategoryId(categoryId === c.id ? 'all' : c.id);
                setShowCats(false);
                setIndex(0);
                if (hasKeyboard) searchRef.current?.focus();
              }}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
      {query.trim() && results.length === 0 && <p className="muted">Nada encontrado.</p>}
      <ul className="results" role="listbox" aria-label="Resultados">
        {results.map((it, i) => (
          <li key={it.id} role="option" aria-selected={i === sel}>
            <button className={i === sel ? 'result active' : 'result'} onClick={() => setPicking(it)} onMouseEnter={() => setIndex(i)}>
              <span className="grow">
                <strong>{it.name}</strong>
                <span className="muted small"> · {it.categoryName}</span>
                {it.description && <span className="desc">{it.description}</span>}
              </span>
              <span className="amount">
                {priceLabel(it.variants)}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {onClose ? (
        <div className="row end">
          <button onClick={onClose}>Fechar</button>
        </div>
      ) : (
        addStep
      )}
    </section>
  );
}

function AddItemDialog({
  orderId,
  item,
  initialVariant,
  inline,
  onClose,
  onAdded,
}: {
  orderId: number;
  item: Pickable;
  initialVariant: number;
  inline?: boolean;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [variantIdx, setVariantIdx] = useState(initialVariant);
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState('');
  const add = useOrderMutation(orderId, () =>
    call(
      api.orders[':id'].items.$post({
        param: { id: String(orderId) },
        json: { variantId: item.variants[variantIdx].id, quantity: qty, note: note.trim() || null },
      }),
    ),
  );
  const variant = item.variants[variantIdx];
  const multi = item.variants.length > 1;

  const form = (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        add.mutate(undefined, { onSuccess: onAdded });
      }}
      onKeyDown={(e) => {
        // Arrows switch variant unless the cashier is editing text in an input.
        if (!multi || (e.target instanceof HTMLInputElement && e.target.value)) return;
        if (e.key === 'ArrowRight') setVariantIdx((variantIdx + 1) % item.variants.length);
        if (e.key === 'ArrowLeft') setVariantIdx((variantIdx - 1 + item.variants.length) % item.variants.length);
      }}
    >
      {item.description && <p className="desc">{item.description}</p>}
      {multi && (
        <div className="variants" role="radiogroup" aria-label="Opção">
          {item.variants.map((v, i) => (
            <button
              key={v.id}
              type="button"
              role="radio"
              aria-checked={i === variantIdx}
              className={i === variantIdx ? 'chip active' : 'chip'}
              onClick={() => setVariantIdx(i)}
            >
              {v.name ?? 'Único'} <span className="small">{brl(v.priceCents)}</span>
            </button>
          ))}
        </div>
      )}
      <Stepper value={qty} onChange={setQty} />
      <label className="field">
        Observação
        <input
          autoFocus={hasKeyboard}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="ex.: sem cebola"
          maxLength={500}
        />
      </label>
      <ErrorText error={add.error} />
      <div className="row end">
        <button type="button" onClick={onClose}>
          Voltar
        </button>
        <button className="primary" disabled={add.isPending}>
          Adicionar {brl(variant.priceCents * qty)}
        </button>
      </div>
      {multi && <p className="muted small hint">← → troca a opção · Enter adiciona</p>}
    </form>
  );
  return inline ? (
    <>
      <h3>{item.name}</h3>
      {form}
    </>
  ) : (
    <Modal title={item.name} onClose={onClose}>
      {form}
    </Modal>
  );
}
