import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api, call } from '../api';
import { ErrorText, Modal } from '../components';
import { brl, time } from '../lib/format';

export function OrdersPage() {
  const orders = useQuery({
    queryKey: ['orders', 'open'],
    queryFn: () => call(api.orders.$get({ query: { status: 'open' } })),
    refetchInterval: 15_000, // other devices may add orders
  });
  const [creating, setCreating] = useState(false);

  return (
    <div className="page">
      <div className="row between">
        <h1>Pedidos abertos</h1>
        <button className="primary big" onClick={() => setCreating(true)}>
          + Novo pedido
        </button>
      </div>
      <ErrorText error={orders.error} />
      {orders.data?.length === 0 && <p className="muted">Nenhum pedido aberto.</p>}
      <ul className="cards">
        {orders.data?.map((o) => (
          <li key={o.id}>
            <Link to={`/pedidos/${o.id}`} className="card order-card">
              <strong className="name">{o.customerName}</strong>
              <span className="muted">
                {o.itemCount} {o.itemCount === 1 ? 'item' : 'itens'} · aberto às {time(o.createdAt)}
              </span>
              <span className="total">{brl(o.totalCents)}</span>
              {o.paidCents > 0 && <span className="muted small">pago {brl(o.paidCents)}</span>}
            </Link>
          </li>
        ))}
      </ul>
      {creating && <NewOrderDialog onClose={() => setCreating(false)} />}
    </div>
  );
}

function NewOrderDialog({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const navigate = useNavigate();
  const create = useMutation({
    mutationFn: () => call(api.orders.$post({ json: { customerName: name.trim() } })),
    onSuccess: (o) => navigate(`/pedidos/${o.id}`),
  });
  return (
    <Modal title="Novo pedido" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) create.mutate();
        }}
      >
        <label className="field">
          Nome do cliente
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
        </label>
        <ErrorText error={create.error} />
        <div className="row end">
          <button type="button" onClick={onClose}>
            Voltar
          </button>
          <button className="primary" disabled={!name.trim() || create.isPending}>
            Criar
          </button>
        </div>
      </form>
    </Modal>
  );
}
