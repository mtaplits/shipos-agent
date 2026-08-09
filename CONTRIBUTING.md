# Contributing

Thank you for helping build SHIP-OS Agent.

## Setup

Install Node 24.19+ and pnpm 10.30.0, then:

```sh
cd ui
pnpm install
pnpm --filter @aaif/goose-sdk run build:ts
pnpm --filter shipos-agent start-gui
```

For SHIP-OS tools:

```sh
cd mcp/shipos
pnpm install
pnpm test
pnpm build
```

## Pull requests

- Keep changes scoped and explain user-visible behavior.
- Add tests for behavior and contracts.
- Run the gates in `AGENTS.md`.
- Localize all visible copy and run `i18n:check`.
- Never commit credentials, SHIP-OS sessions, LLM keys, customer data, or `.env` files.
- Preserve attribution for Goose-derived files under Apache-2.0.

## Architecture

The desktop renderer talks to the Goose agent over ACP. SHIP-OS functionality is supplied as MCP tools that call documented JSON APIs. Do not embed backend business logic in the renderer or MCP server. M1 is read-only; mutations require explicit confirmation, idempotency, and receipt contracts.

## Reporting security issues

Do not open a public issue containing credentials, session cookies, customer data, or exploitable details. Contact the repository owner privately.
