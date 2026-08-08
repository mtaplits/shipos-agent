# SHIP-OS MCP server

Exposes SHIP-OS as MCP tools by wrapping the existing SHIP-OS JSON API
(`/api/v1/mobile/*`) with session-cookie auth from the desktop-link flow.

Milestone 1 scope: **read-only** — `shipos_search_orders` and
`shipos_get_order`. Mutations (buy label, mark shipped) arrive in M2 behind
the goose agent's approval flow.

## Tools

| Tool | Purpose | Notes |
|---|---|---|
| `shipos_search_orders` | Free-text order search (`q` matches order numbers/references via the search projection) | Optional filters: account_id, status, order_type, order_state, destination, page, limit |
| `shipos_get_order` | Order detail card (order number, status, ship-to, item summary) | `order_number` or `order_id`; `detail: "lines"` also returns the shipment snapshot (line-level SKUs) |

Both map to existing endpoints — **no SHIP-OS backend changes required**.

## Auth

The server authenticates with the session cookie from the desktop-link flow
(the same flow the shipped Electron shell uses):

```sh
SHIPOS_EMAIL=you@example.com pnpm login
# prints: SHIPOS_SESSION_COOKIE=session=...
```

Click the emailed sign-in link, then export the cookie:

```sh
export SHIPOS_SESSION_COOKIE='session=...'
pnpm start   # stdio MCP server
```

## Config

| Env | Default | Purpose |
|---|---|---|
| `SHIPOS_API_BASE_URL` | `https://app.shipos.us` | Backend base URL (`http://localhost:8000` for dev) |
| `SHIPOS_SESSION_COOKIE` | — | Session cookie from `pnpm login` |

## Development

```sh
pnpm install
pnpm typecheck
pnpm test      # vitest, mocked HTTP + fake tool server
pnpm build     # tsc → dist/
```

## Contract notes (from the SHIP-OS codebase)

- `GET /api/v1/mobile/orders?q=…` — free-text search via the
  `OrderSearchDocument` search projection (ILIKE over order number/ref/etc).
  Rows carry order identity, status summary, destination, item summary, and
  `shipment_id` (which unlocks the shipment snapshot).
- `GET /api/v1/mobile/orders/{order_id}/shipments/{shipment_id}` — line-level
  shipment snapshot (SKUs, quantities, states).
- Auth: `POST /login/request-link` (desktop UA `ShipOS-Electron-Shell`) →
  parse `data-desktop-session-id` + client secret from the response →
  `GET /auth/desktop-session/{id}/poll` with `X-Desktop-Session-Secret` →
  `{"state":"ready"}` finalises the session cookie on that response.
- No order-level monetary totals are exposed by the JSON API; totals are
  deferred to M2 with the first financial gap endpoint.
