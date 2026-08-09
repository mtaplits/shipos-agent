# Agent guide

## Product boundary

`shipos-agent` is an independent Apache-2.0 Electron desktop client. It uses the real Goose agent over ACP and exposes SHIP-OS through the bundled MCP server. Do not copy server business rules into the client or add web scraping. Prefer existing SHIP-OS JSON endpoints; document backend gaps before proposing endpoint work.

## Layout

- `ui/desktop/` — Goose-derived Electron/React desktop UI.
- `ui/sdk/` — vendored Goose SDK. Build with `build:ts`; do not run `generate` because its Rust schema source is not vendored.
- `mcp/shipos/` — stdio MCP server and desktop-link authentication client.
- `SPEC.md` — canonical M1 scope and acceptance ledger.

## Required toolchain

Node 24.19+ and pnpm 10.30.0. Run desktop commands from `ui/`; MCP commands from `mcp/shipos/`.

## Gates

```sh
cd ui
pnpm install --frozen-lockfile
pnpm --filter @aaif/goose-sdk run build:ts
pnpm --filter shipos-agent run typecheck
pnpm --filter shipos-agent run i18n:check
pnpm --filter shipos-agent test:run

cd ../mcp/shipos
pnpm install --frozen-lockfile
pnpm typecheck && pnpm test && pnpm build
```

All visible copy must use `react-intl` and every locale catalog must contain the key. Preserve Goose theme token tables unless an intentional design divergence is documented. Never commit cookies, provider keys, `.env`, screenshots containing customer data, or generated app bundles.
