import { orderStatusLabels, paymentMethodLabels, paymentMethods } from '@hestia/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { api, call } from '../api';
import { ErrorText } from '../components';
import { brl, centsToInput, parseReais, time, today } from '../lib/format';

export function HistoryPage() {
  const [params, setParams] = useSearchParams();
  const date = params.get('data') ?? today();
  const orders = useQuery({
    queryKey: ['orders', 'date', date],
    queryFn: () => call(api.orders.$get({ query: { date } })),
  });
  const paidTotal = orders.data?.filter((o) => o.status === 'paid').reduce((s, o) => s + o.totalCents, 0) ?? 0;

  return (
    <div className="page">
      <div className="row between wrap">
        <h1>Histórico</h1>
        <input
          type="date"
          aria-label="Data"
          value={date}
          max={today()}
          onChange={(e) => e.target.value && setParams({ data: e.target.value }, { replace: true })}
        />
      </div>
      <ErrorText error={orders.error} />
      <CashPanel key={date} date={date} />
      {orders.data?.length === 0 && <p className="muted">Nenhum pedido nesta data.</p>}
      {!!orders.data?.length && (
        <p className="muted">
          {orders.data.length} pedidos · pagos: {brl(paidTotal)}
        </p>
      )}
      <ul className="list">
        {orders.data?.map((o) => (
          <li key={o.id}>
            <Link to={`/pedidos/${o.id}`} className="list-row">
              <span className="muted">{time(o.createdAt)}</span>
              <strong className="grow">{o.customerName}</strong>
              <span className={`badge ${o.status}`}>{orderStatusLabels[o.status]}</span>
              <span className="amount">{brl(o.totalCents)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Caixa do dia: troco inicial + dinheiro recebido = esperado; contado - esperado = diferença. */
function CashPanel({ date }: { date: string }) {
  const qc = useQueryClient();
  const cash = useQuery({
    queryKey: ['cash', date],
    queryFn: () => call(api.cash[':date'].$get({ param: { date } })),
  });
  const [opening, setOpening] = useState<string | null>(null);
  const [counted, setCounted] = useState<string | null>(null);
  const d = cash.data;
  const openingInput = opening ?? (d ? centsToInput(d.openingCents) : '');
  const countedInput = counted ?? (d?.countedCents != null ? centsToInput(d.countedCents) : '');
  const openingCents = parseReais(openingInput);
  const countedCents = countedInput.trim() ? parseReais(countedInput) : null;
  const valid = openingCents !== null && (countedCents !== null || !countedInput.trim());
  const dirty = opening !== null || counted !== null;
  const save = useMutation({
    mutationFn: () => call(api.cash[':date'].$put({ param: { date }, json: { openingCents: openingCents!, countedCents } })),
    onSuccess: (data) => {
      qc.setQueryData(['cash', date], data);
      setOpening(null);
      setCounted(null);
    },
  });
  if (!d) return <ErrorText error={cash.error} />;

  // live preview from what is typed; the server recomputes the same on save
  const expected = (openingCents ?? 0) + d.cashInCents;
  const diff = countedCents === null ? null : countedCents - expected;
  const closed = d.countedCents !== null;

  return (
    <form
      className="card cash"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) save.mutate();
      }}
    >
      <div className="row between">
        <h2>Caixa do dia</h2>
        <span className={`badge ${closed ? 'paid' : ''}`}>{closed ? 'Fechado' : 'Em aberto'}</span>
      </div>

      <div className="cash-cols">
        <section>
          <h3>Recebimentos</h3>
          <div className="cash-methods">
            {paymentMethods.map((m) => (
              <div key={m} className={d.byMethod[m] ? '' : 'zero'}>
                <span className="muted">{paymentMethodLabels[m]}</span>
                <strong>{brl(d.byMethod[m])}</strong>
              </div>
            ))}
          </div>
          <div className="cash-total">
            <span>Total recebido</span>
            <strong>{brl(d.receivedCents)}</strong>
          </div>
        </section>

        <section>
          <h3>Conferência do dinheiro</h3>
          <div className="cash-ledger">
            <label htmlFor="cash-opening">Troco inicial</label>
            <CashInput id="cash-opening" value={openingInput} onChange={setOpening} />
            <span>+ Dinheiro recebido</span>
            <span>{brl(d.cashInCents)}</span>
            <span className="sum">= Esperado na gaveta</span>
            <span className="sum">{brl(expected)}</span>
            <label htmlFor="cash-counted">Contado no fechamento</label>
            <CashInput id="cash-counted" value={countedInput} onChange={setCounted} />
          </div>
          <CashResult diff={diff} />
        </section>
      </div>

      <ErrorText error={save.error} />
      <div className="row between wrap">
        <span className="muted small">{dirty ? 'Alterações não salvas' : ''}</span>
        <button className="primary" disabled={!valid || save.isPending || !dirty}>
          {closed ? 'Salvar caixa' : countedCents !== null ? 'Fechar caixa' : 'Salvar troco'}
        </button>
      </div>
    </form>
  );
}

function CashInput({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  return (
    <span className="cash-input">
      <span>R$</span>
      <input
        id={id}
        inputMode="decimal"
        placeholder="0,00"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={(e) => e.target.select()}
      />
    </span>
  );
}

function CashResult({ diff }: { diff: number | null }) {
  if (diff === null) return <p className="cash-result pending">Informe o valor contado para ver a diferença.</p>;
  if (diff === 0) return <p className="cash-result ok">✓ Caixa confere</p>;
  return (
    <p className={`cash-result ${diff < 0 ? 'short' : 'over'}`}>
      <span>{diff < 0 ? 'Falta no caixa' : 'Sobra no caixa'}</span>
      <strong>{brl(Math.abs(diff))}</strong>
    </p>
  );
}
