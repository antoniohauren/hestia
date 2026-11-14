# Hestia

App de pedidos para o balcão do Ksa do Sushi. Um servidor roda no PC do restaurante; qualquer celular ou computador no Wi-Fi abre pelo navegador.

Spec completa: [PLAN.md](PLAN.md).

## Instalar (uma vez)

1. Instale o Bun: <https://bun.sh> (Linux/macOS: `curl -fsSL https://bun.sh/install | bash`; Windows: `powershell -c "irm bun.sh/install.ps1 | iex"`).
2. Na pasta do projeto:
   ```sh
   bun install
   cp .env.example .env
   ```
3. Edite `.env`:
   - `HESTIA_PIN` — o PIN para entrar no app.
   - `HESTIA_SECRET` — texto aleatório e longo (assina o cookie de login). Ex.: `openssl rand -hex 32`.
   - `DATABASE_PATH` — onde fica o banco (padrão `./data/hestia.db`).
   - `PORT` — padrão `3000`.

O cardápio inicial (`seed/menu.json`) é inserido automaticamente na primeira execução.

## Rodar no restaurante

```sh
bun run build   # gera o site (refaça após atualizar o código)
bun run start   # um único processo serve o app e a API
```

No PC: abra <http://localhost:3000>.
No celular (mesmo Wi-Fi): descubra o IP do PC (`ip addr` no Linux, `ipconfig` no Windows) e abra `http://<ip-do-pc>:3000`.
Se não abrir, libere a porta 3000 no firewall do PC.

O banco é um único arquivo (`data/hestia.db`). Faça cópias dele de vez em quando — backup automático ainda não existe.

## Desenvolvimento

```sh
bun run dev        # API em :3000 (watch) + Vite em :5173 (proxy /api)
bun test           # testes
bun run typecheck
bun run seed       # insere o cardápio se o banco estiver vazio
```

Mudou `apps/api/src/db/schema.ts`? Gere a migração com `cd apps/api && bun run db:generate`. As migrações rodam sozinhas ao iniciar.

Estrutura: `apps/api` (Hono + Drizzle + SQLite), `apps/web` (React + Vite, cliente tipado via Hono RPC), `packages/types` (schemas zod, rótulos, cálculos de dinheiro).
