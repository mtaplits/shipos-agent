# shipos-agent

SHIP-OS v2 — a goose-shaped desktop agent client for SHIP-OS.

The Milestone 1 plan and requirements live in [`SPEC.md`](SPEC.md).

## Layout

```
SPEC.md            Milestone 1 spec (stories, acceptance criteria, risks)
ui/desktop/        Electron + Vite + React + TS + Tailwind v4 desktop app,
                   adapted from goose's ui/desktop to preserve its structure
                   and design pixel-for-pixel (theme tokens, shadcn components,
                   ACP client). The real goose agent runs via `goose serve`;
                   the renderer connects over ACP.
mcp/shipos/        SHIP-OS MCP server (M1 placeholder): exposes SHIP-OS as
                   MCP tools by wrapping the existing SHIP-OS JSON API
                   (/api/v1/mobile/*) with desktop-link token auth.
```

## Design

- Shell, theme, and session UX mirror the goose Mac desktop app
  (`github.com/aaif-goose/goose`, Apache-2.0).
- The agent is the real goose agent over ACP; SHIP-OS is reached as MCP tools,
  not through the web UI.
- Sessions are local-first (on-disk), light + dark themes via the goose token
  tables, users bring their own LLM keys.
- M1 is read-only (order search + detail) with **no SHIP-OS backend changes**;
  mutations (buy label) arrive in M2.

## Development

Requires Node 24+ and pnpm 10.30+ (same as goose).

```sh
cd ui/desktop
pnpm install
pnpm start-gui        # or: pnpm run i18n:compile && electron-forge start
```

Configure an LLM provider in `ui/desktop/.env` (see `.env.example`), e.g.
`GOOSE_PROVIDER__TYPE=openai` / `GOOSE_PROVIDER__HOST` / `GOOSE_PROVIDER__MODEL`.

## Attribution

Derived from [Goose](https://github.com/aaif-goose/goose) (Apache-2.0,
Copyright AAIF (Agentic AI Foundation) and contributors). See [`NOTICE`](NOTICE)
and [`LICENSE`](LICENSE).
