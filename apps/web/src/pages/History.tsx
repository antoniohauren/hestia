import { orderStatusLabels } from '@hestia/types';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { api, call } from '../api';
import { ErrorText } from '../components';
import { brl, time, today } from '../lib/format';

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
