import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, NavLink, Outlet, Route, Routes, useNavigate } from 'react-router';
import { api } from './api';
import { CheckoutPage } from './pages/Checkout';
import { HistoryPage } from './pages/History';
import { LoginPage } from './pages/Login';
import { MenuEditorPage } from './pages/MenuEditor';
import { OrderPage } from './pages/Order';
import { OrdersPage } from './pages/Orders';
import './styles.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: true } },
});

function Layout() {
  const me = useQuery({ queryKey: ['me'], queryFn: async () => (await api.auth.me.$get()).ok });
  const qc = useQueryClient();
  const navigate = useNavigate();
  if (me.isPending) return <div className="center muted">Carregando…</div>;
  if (!me.data) return <Navigate to="/login" replace />;
  async function logout() {
    await api.auth.logout.$post();
    qc.clear();
    navigate('/login');
  }
  return (
    <>
      <nav className="nav">
        <span className="brand">Hestia</span>
        <NavLink to="/" end>
          Pedidos
        </NavLink>
        <NavLink to="/historico">Histórico</NavLink>
        <NavLink to="/cardapio">Cardápio</NavLink>
        <button className="link" onClick={logout}>
          Sair
        </button>
      </nav>
      <main className="main">
        <Outlet />
      </main>
      <nav className="tabbar" aria-label="Menu">
        <NavLink to="/" end>
          <Icon d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2M9 12h6M9 16h6" />
          Pedidos
        </NavLink>
        <NavLink to="/historico">
          <Icon d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 3" />
          Histórico
        </NavLink>
        {/* menu editing is desktop-only */}
        <span className="disabled" aria-disabled="true">
          <Icon d="M4 6h16M4 12h16M4 18h10" />
          Cardápio
        </span>
        <button onClick={logout}>
          <Icon d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
          Sair
        </button>
      </nav>
    </>
  );
}

const Icon = ({ d }: { d: string }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<Layout />}>
            <Route path="/" element={<OrdersPage />} />
            <Route path="/pedidos/:id" element={<OrderPage />} />
            <Route path="/pedidos/:id/pagar" element={<CheckoutPage />} />
            <Route path="/historico" element={<HistoryPage />} />
            <Route path="/cardapio" element={<MenuEditorPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
