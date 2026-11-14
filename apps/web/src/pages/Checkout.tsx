import { computeChange, paymentMethodLabels, splitEqual, type PaymentMethod } from '@hestia/types';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { api, call, type OrderDetail, type Payment } from '../api';
import { ErrorText, MethodPicker, MoneyInput } from '../components';
import { brl, centsToInput, parseReais, time } from '../lib/format';
import { useOrder, useOrderMutation } from '../queries';

type Mode = 'tudo' | 'igual' | 'valor' | 'itens';
const modes: [Mode, string][] = [
  ['tudo', 'Tudo'],
  ['igual', 'Dividir igual'],
  ['valor', 'Valor'],
  ['itens', 'Por itens'],
];

export function CheckoutPage() {
  const id = Number(useParams().id);
  const order = useOrder(id);
  if (order.error) return <ErrorText error={order.error} />;
  if (!order.data) return <p className="muted">Carregando…</p>;
  return <Checkout order={order.data} />;
}

function Checkout({ order }: { order: OrderDetail }) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('tudo');
  const [justPaid, setJustPaid] = useState(false);
  const canPay = order.status === 'open' && order.remainingCents > 0;

  useEffect(() => {
    if (!justPaid) return;
    const t = setTimeout(() => navigate('/'), 1500);
    return () => clearTimeout(t);
  }, [justPaid, navigate]);

  if (justPaid)
    return (
      <div className="page center">
        <h1 className="paid-msg">Pago ✓</h1>
        <p>{order.customerName}</p>
        <Link className="button primary big" to="/">
          Voltar aos pedidos
        </Link>
      </div>
    );

  return (
    <div className="page narrow">
      <p>
        <Link to={`/pedidos/${order.id}`}>← {order.customerName}</Link>
      </p>
      <h1>{order.status === 'open' ? 'Fechar conta' : 'Pagamentos'}</h1>
      <div className="summary">
        <div>
          <span className="muted">Total</span>
          <strong>{brl(order.totalCents)}</strong>
        </div>
        <div>
          <span className="muted">Pago</span>
          <strong>{brl(order.paidCents)}</strong>
        </div>
        <div>
          <span className="muted">Restante</span>
          <strong className={order.remainingCents > 0 ? 'accent' : ''}>{brl(order.remainingCents)}</strong>
        </div>
      </div>

      {order.payments.length > 0 && (
        <ul className="list">
          {order.payments.map((p) => (
            <PaymentRow key={p.id} order={order} payment={p} />
          ))}
        </ul>
      )}

      {canPay && (
        <>
          <div className="tabs" role="tablist">
            {modes.map(([m, label]) => (
              <button key={m} role="tab" aria-selected={mode === m} className={mode === m ? 'tab active' : 'tab'} onClick={() => setMode(m)}>
                {label}
              </button>
            ))}
          </div>
          <NewPayment key={mode} order={order} mode={mode} onPaid={() => setJustPaid(true)} />
        </>
      )}
    </div>
  );
}

function NewPayment({ order, mode, onPaid }: { order: OrderDetail; mode: Mode; onPaid: () => void }) {
  const remaining = order.remainingCents;
  const [people, setPeople] = useState(2);
  const [valor, setValor] = useState('');
  const unpaid = order.items.filter((i) => i.status === 'active' && !i.paymentId);
  const [picked, setPicked] = useState<number[]>([]);

  let amount: number | null = null;
  let parts: number[] = [];
  if (mode === 'tudo') amount = remaining;
  if (mode === 'igual') {
    parts = splitEqual(remaining, people);
    amount = parts[0];
  }
  if (mode === 'valor') amount = parseReais(valor);
  if (mode === 'itens')
    amount = unpaid.filter((i) => picked.includes(i.id)).reduce((s, i) => s + i.unitPriceCents * i.quantity, 0) || null;

  return (
    <div className="card stack">
      {mode === 'igual' && (
        <>
          <div className="field">
            Pessoas
            <div className="stepper">
              <button type="button" onClick={() => setPeople(Math.max(1, people - 1))} aria-label="Menos">
                −
              </button>
              <input value={people} readOnly aria-label="Pessoas" />
              <button type="button" onClick={() => setPeople(Math.min(50, people + 1))} aria-label="Mais">
                +
              </button>
            </div>
          </div>
          <p className="muted">
            {parts.map((p) => brl(p)).join(' + ')} — registrando a parte de {brl(parts[0])}
          </p>
        </>
      )}
      {mode === 'valor' && <MoneyInput label="Valor deste pagamento" value={valor} onChange={setValor} autoFocus />}
      {mode === 'valor' && amount !== null && amount > remaining && <p className="error">Maior que o restante.</p>}
      {mode === 'itens' && (
        <ul className="checklist">
          {unpaid.length === 0 && <li className="muted">Todos os itens já foram pagos por item.</li>}
          {unpaid.map((it) => (
            <li key={it.id}>
              <label>
                <input
                  type="checkbox"
                  checked={picked.includes(it.id)}
                  onChange={(e) => setPicked(e.target.checked ? [...picked, it.id] : picked.filter((x) => x !== it.id))}
                />
                <span className="grow">
                  {it.quantity}× {it.itemName}
                  {it.variantName && ` (${it.variantName})`}
                </span>
                <span className="amount">{brl(it.unitPriceCents * it.quantity)}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <PaymentForm
        key={remaining}
        order={order}
        amount={amount}
        orderItemIds={mode === 'itens' ? picked : undefined}
        onDone={(o) => {
          if (o.status === 'paid') return onPaid();
          setValor('');
          setPicked([]);
          if (mode === 'igual') setPeople(Math.max(1, people - 1));
        }}
      />
    </div>
  );
}

/** Method + (dinheiro) received/troco + submit, for a fixed amount. */
function PaymentForm({
  order,
  amount,
  orderItemIds,
  onDone,
}: {
  order: OrderDetail;
  amount: number | null;
  orderItemIds?: number[];
  onDone: (o: OrderDetail) => void;
}) {
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [received, setReceived] = useState('');
  const receivedCents = parseReais(received);
  const change = amount && receivedCents !== null ? computeChange(amount, receivedCents) : null;
  const pay = useOrderMutation(order.id, () =>
    call(
      api.orders[':id'].payments.$post({
        param: { id: String(order.id) },
        json: {
          method: method!,
          amountCents: amount!,
          receivedCents: method === 'dinheiro' ? receivedCents : null,
          orderItemIds: orderItemIds?.length ? orderItemIds : undefined,
        },
      }),
    ),
  );
  const valid =
    !!method && !!amount && amount > 0 && amount <= order.remainingCents && (method !== 'dinheiro' || change !== null);

  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) pay.mutate(undefined, { onSuccess: onDone });
      }}
    >
      <MethodPicker value={method} onChange={setMethod} />
      {method === 'dinheiro' && (
        <>
          <MoneyInput label="Valor recebido" value={received} onChange={setReceived} autoFocus />
          {amount && receivedCents !== null && (
            <p className={change === null ? 'error' : 'troco'}>
              {change === null ? 'Valor recebido menor que o pagamento.' : `Troco: ${brl(change)}`}
            </p>
          )}
        </>
      )}
      <ErrorText error={pay.error} />
      <button className="primary big" disabled={!valid || pay.isPending}>
        Registrar {amount ? brl(amount) : ''}
        {method ? ` em ${paymentMethodLabels[method]}` : ''}
      </button>
    </form>
  );
}

function PaymentRow({ order, payment: p }: { order: OrderDetail; payment: Payment }) {
  const [editing, setEditing] = useState(false);
  const editable = order.status !== 'cancelled';
  const del = useOrderMutation(order.id, () =>
    call(api.orders[':id'].payments[':paymentId'].$delete({ param: { id: String(order.id), paymentId: String(p.id) } })),
  );

  if (editing) return <EditPayment order={order} payment={p} onClose={() => setEditing(false)} />;
  return (
    <li className="list-row">
      <span className="muted">{time(p.createdAt)}</span>
      <span className="grow">
        <strong>{paymentMethodLabels[p.method]}</strong>
        {p.method === 'dinheiro' && p.receivedCents !== null && (
          <span className="muted small">
            {' '}
            · recebido {brl(p.receivedCents)} · troco {brl(p.changeCents ?? 0)}
          </span>
        )}
        {order.items.some((i) => i.paymentId === p.id) && <span className="muted small"> · por itens</span>}
      </span>
      <span className="amount">{brl(p.amountCents)}</span>
      {editable && (
        <span className="row">
          <button className="small-btn" onClick={() => setEditing(true)}>
            Editar
          </button>
          <button
            className="small-btn danger-outline"
            disabled={del.isPending}
            onClick={() => confirm(`Excluir pagamento de ${brl(p.amountCents)}?`) && del.mutate(undefined)}
          >
            Excluir
          </button>
        </span>
      )}
      <ErrorText error={del.error} />
    </li>
  );
}

function EditPayment({ order, payment: p, onClose }: { order: OrderDetail; payment: Payment; onClose: () => void }) {
  const [method, setMethod] = useState<PaymentMethod>(p.method);
  const [amount, setAmount] = useState(centsToInput(p.amountCents));
  const [received, setReceived] = useState(p.receivedCents !== null ? centsToInput(p.receivedCents) : '');
  const amountCents = parseReais(amount);
  const receivedCents = parseReais(received);
  const change = amountCents && receivedCents !== null ? computeChange(amountCents, receivedCents) : null;
  const save = useOrderMutation(order.id, () =>
    call(
      api.orders[':id'].payments[':paymentId'].$patch({
        param: { id: String(order.id), paymentId: String(p.id) },
        json: { method, amountCents: amountCents!, receivedCents: method === 'dinheiro' ? receivedCents : null },
      }),
    ),
  );
  const valid = !!amountCents && amountCents > 0 && (method !== 'dinheiro' || change !== null);
  const linked = order.items.some((i) => i.paymentId === p.id);

  return (
    <li className="card stack">
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) save.mutate(undefined, { onSuccess: onClose });
        }}
      >
        <MethodPicker value={method} onChange={setMethod} />
        <MoneyInput label="Valor" value={amount} onChange={setAmount} />
        {linked && amountCents !== p.amountCents && (
          <p className="muted small">Alterar o valor desvincula os itens deste pagamento.</p>
        )}
        {method === 'dinheiro' && (
          <>
            <MoneyInput label="Valor recebido" value={received} onChange={setReceived} />
            {change !== null && <p className="troco">Troco: {brl(change)}</p>}
          </>
        )}
        <ErrorText error={save.error} />
        <div className="row end">
          <button type="button" onClick={onClose}>
            Voltar
          </button>
          <button className="primary" disabled={!valid || save.isPending}>
            Salvar
          </button>
        </div>
      </form>
    </li>
  );
}
