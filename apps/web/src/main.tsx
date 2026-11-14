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
    </>
  );
}

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
