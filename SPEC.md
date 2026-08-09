# Spec: SHIP-OS v2 Desktop Client — Milestone 1 (Goose-Shaped Chat Shell)

Status: Draft (from planning interviews 2026-08-08)
Reference design: goose Mac desktop UI — https://github.com/aaif-goose/goose (`ui/desktop`)

## Context

SHIP-OS v2 is a **completely independent desktop application** in its own git repository
(eventually open-sourced). It is a chat-style agent client whose shell, theme, and agent
architecture replicate the goose Mac desktop app (`ui/desktop`) pixel-for-pixel and
structure-for-structure. SHIP-OS is reached not through the web UI but as **tools**: the app
drives the real goose agent over ACP, and a SHIP-OS MCP server (shipped inside the v2 repo)
exposes SHIP-OS as MCP tools that call the existing SHIP-OS JSON API
(`/api/v1/mobile/*`) with desktop-link/mobile auth.

Milestone 1 proves the whole chain end-to-end with **read-only** SHIP-OS access:
install → authenticate → chat shell → "find order 1041" → tool-call card → order detail card.
No SHIP-OS backend changes are required in M1.

## 1. User Stories

- **US-1**: As an operator, I want to install and launch the v2 desktop app and authenticate
  with my SHIP-OS account through the existing link-based flow, so I never type credentials
  into the agent client and my session survives relaunch.
- **US-2**: As an operator, I want the app shell (session sidebar, thread pane, composer,
  light and dark themes) to look and behave exactly like the goose Mac desktop app, so the
  client is a pixel-perfect goose experience rather than a web page in a frame.
- **US-3**: As an operator, I want agent sessions stored locally on this machine with
  start/resume/rename/delete, so my work is organized, private, and resumes where I left off.
- **US-4**: As an operator, I want to ask in plain English — "find order 1041" — and have the
  agent search SHIP-OS and return an order detail card, so I can look up orders
  conversationally instead of navigating the web UI.
- **US-5**: As an operator, I want every agent tool call shown as a card with
  running/succeeded/failed states and an approval prompt for mutation-class tools, so I can
  see and control what the agent does.
- **US-6**: As a developer, I want the repo structured exactly like goose `ui/desktop`
  (ACP client, token theme, shadcn components) with the SHIP-OS MCP server as a separate
  package, so the repo is open-source-clean and diffable against goose.

## 2. Acceptance Criteria

### US-1: Install & authenticate

- GIVEN a fresh macOS build WHEN the app launches unauthenticated THEN it shows a sign-in
  screen using the v2 design tokens and a "Sign in with SHIP-OS" action.
- GIVEN the user starts sign-in WHEN the app opens the browser at the SHIP-OS link URL THEN
  the app polls `/api/v1/mobile/auth/sessions/{id}/poll` until confirmed and completes via
  `/api/v1/mobile/auth/exchange`.
- GIVEN a confirmed exchange WHEN the session token is received THEN it is stored in the OS
  keychain, and the app's source and storage contain no plaintext token or secret.
- GIVEN a keychain session token WHEN the app relaunches THEN the user is signed in without
  repeating the flow.
- GIVEN an expired or revoked token WHEN any API call returns 401 THEN the app returns to
  sign-in without crashing and preserves local sessions.

### US-2: Goose-parity shell

- GIVEN reference screenshots of the goose desktop shell (sidebar, thread pane, composer)
  WHEN the v2 app renders the equivalent screens THEN the visual-diff suite reports below 1%
  differing pixels per screen against the reference set.
- GIVEN the goose `theme-tokens.ts` values WHEN the app applies theme tokens THEN the resolved
  CSS custom properties (`--color-*`, `--font-*`, `--border-radius-*`, `--shadow-*`) equal the
  reference token tables exactly for both light and dark.
- GIVEN system preference `dark` WHEN the app launches THEN dark theme is applied; GIVEN a
  manual theme toggle WHEN clicked THEN the theme switches immediately and the choice persists
  across relaunch (same localStorage keys as goose).
- GIVEN the shell WHEN navigated with keyboard only THEN every interactive element is
  reachable, focused elements show the goose focus ring, and Enter/Escape behave as in goose.
- GIVEN the composer WHEN empty THEN the send control is disabled; WHEN it has text THEN Enter
  sends and Shift+Enter inserts a newline.

### US-3: Local sessions

- GIVEN a new session WHEN the first message is sent THEN the session appears in the sidebar
  with an auto-generated title derived from that message.
- GIVEN sessions stored on disk WHEN the app restarts THEN all sessions are listed; GIVEN a
  resumed session THEN its message history and tool-call cards render identically to before
  restart.
- GIVEN the rename action WHEN the user renames a session THEN the new title persists across
  restart.
- GIVEN the delete action WHEN the user deletes a session THEN it is removed from the list and
  disk and no other session is modified.

### US-4: Conversational order lookup

- GIVEN a signed-in session WHEN the user sends "find order 1041" THEN the agent emits a tool
  call to `shipos.search_orders` and the thread shows a tool-call card in running state.
- GIVEN results from `shipos.search_orders` WHEN the agent calls `shipos.get_order` THEN the
  thread renders an order detail card showing order number, status, ship-to, and item summary
  (item count / unit count / item lines) taken from the API response. Monetary totals are
  deferred to M2: the existing JSON API exposes no order totals, and M1 keeps zero SHIP-OS
  backend changes; totals arrive with the first financial gap endpoint in M2.
- GIVEN a query with no match WHEN the agent finishes THEN the reply states no order was found
  (no error crash, no empty card).
- GIVEN the MCP server WHEN `shipos.search_orders` or `shipos.get_order` is invoked THEN it
  calls the existing `/api/v1/mobile/orders*` endpoints with the desktop-link token and returns
  results; M1 introduces no SHIP-OS repository changes.

### US-5: Tool-call visibility & approval

- GIVEN any tool execution THEN the thread shows a card with tool name, arguments, and status
  transitions running → succeeded, or running → failed with the error text.
- GIVEN a mutation-class tool (M1 ships a local-only stub, e.g. `approve.demo`) THEN the
  approval prompt renders with allow/deny; GIVEN deny THEN the tool does not execute and the
  agent acknowledges; GIVEN allow THEN it executes and the card completes.
- GIVEN a failed tool call THEN the card shows the failure and the agent continues the
  conversation with an explanation.
- GIVEN the stub mutation tool WHEN exercised THEN no SHIP-OS API call occurs (stub is
  local-only).

### US-6: Open-source structure

- GIVEN the v2 repository WHEN scanned THEN no SHIP-OS credentials, session tokens, API keys,
  or production URLs appear in source, fixtures, or tests (automated secret scan passes).
- GIVEN the repository layout WHEN compared with goose `ui/desktop` THEN it mirrors the
  structure: `src/acp` (ACP client), `src/theme/theme-tokens.ts`, `src/styles/main.css`,
  `src/components/**` (shadcn new-york), Electron main/preload/renderer, and a test suite
  (vitest + playwright), so the repo is diffable file-by-file against goose.
- GIVEN the MCP server WHEN built THEN it is a standalone package inside the repo whose only
  dependency on SHIP-OS is the public JSON API contract.

## 3. Out of Scope

This feature does NOT:

- [ ] **Perform SHIP-OS mutations** (buy label, mark shipped, exception resolution) — deferred
  to M2 because mutations require idempotency/receipt semantics (defined by the existing mobile
  contracts) and confirmation UX beyond the M1 stub.
- [ ] **Change the SHIP-OS backend or web UI** — M1 consumes existing `/api/v1/mobile/*`
  endpoints; any backend additions (only if endpoint discovery finds gaps) are separate,
  gated work on the SHIP-OS side.
- [ ] **Support Windows or Linux builds** — M1 is macOS only, matching the goose Mac reference;
  other platforms come later via the same electron-builder config.
- [ ] **Sync sessions across devices** — sessions are local-first by design (goose-faithful,
  open-source-safe); multi-device sync is a future milestone.
- [ ] **Integrate with the human-chat surface** (`/api/v1/chat`, chat-island, support chat) —
  that surface stays human-human and is not reused for agent threads.
- [ ] **Add notifications, telemetry, or auto-update** — deferred; M1 has no push, no
  analytics, and manual update checks only if the shell needs them.

## 4. Risks & Assumptions

| Risk / Assumption | Impact | Mitigation |
|---|---|---|
| Assumption: the goose agent can run as a local dependency over ACP on macOS in v2's Electron app. | ACP protocol changes or binary incompatibility could block M1. | Pin the goose version; use the goose CLI subprocess as a fallback transport behind the same ACP client interface. |
| ~~Assumption: `/api/v1/mobile/orders*` supports the search semantics "find order 1041".~~ **Resolved 2026-08-08:** `GET /api/v1/mobile/orders?q=…` matches order numbers via the `OrderSearchDocument` search projection (ILIKE); feed rows include order identity, status summary, destination, item summary, and `shipment_id` (which unlocks the existing shipment snapshot for line-level detail). | — | No backend work needed for search or detail. The only gap is monetary totals (not exposed by any JSON endpoint) — deferred to M2. |
| Assumption: the mobile auth flow (request-link → poll → exchange) works for a non-WebView native client. | The flow may assume browser/WebView user-agent behavior. | Verify in discovery against the native mobile clients that already use it; adjust v2 client to the same JSON-native contract. |
| Risk: Cash Sans is Square's font; pixel parity depends on loading it from the Square CDN. | Font availability/CDN changes could shift rendering. | Use the same `@font-face` CDN rules as goose (`cash-f.squarecdn.com`); document a fallback font stack in the theme. |
| Assumption: users bring their own LLM API keys (BYOK) in M1. | Key-management support burden on operators. | Settings UI + docs; provider-agnostic via the goose agent; keys live in the OS keychain, never in the repo. |
| Risk: visual-diff acceptance (<1% pixel difference) is hard to hit exactly for every component. | Parity gate could become a slog. | Capture reference screenshots from the real goose desktop app; diff per screen; triage remaining diffs as token/component fixes before layout changes. |
| External dependency: goose repo (Apache-2.0) API churn. | v2's ACP layer could break on upgrades. | Pin versions in the repo manifest; upgrade deliberately with the v2 test suite as the gate. |

## 5. Estimation

| Dimension | Assessment | Justification |
|---|---|---|
| T-shirt size | **L** | A full new repo scaffolded from goose's structure (Electron + Vite + React + TS + Tailwind v4 + shadcn + ACP client + MCP server) plus auth, local sessions, and one end-to-end agent flow. |
| Files changed | ~90–120 new files (v2 repo); **0** files in the SHIP-OS repo | All work lands in the new repo; M1 maps to existing SHIP-OS endpoints. |
| Testing complexity | **High** | Visual-diff parity vs goose reference screenshots, ACP integration tests, MCP tool unit tests, auth-flow E2E, keychain/secret-scan checks. |

## Validation Gate

- [ ] ≤ 7 user stories (6 present)
- [ ] Out of scope has ≥ 3 items (6 present)
- [ ] All acceptance criteria verifiable (no subjective language)
- [ ] No SHIP-OS repository changes required by M1 acceptance criteria

## 6. Implementation Ledger (2026-08-08)

| Capability | Implementation | Verification | Status |
|---|---|---|---|
| Goose-derived desktop scaffold | `ui/desktop`, vendored `ui/sdk` | TypeScript clean; Electron Forge package succeeds | Complete |
| Real Goose runtime over ACP | Existing Goose `goose serve` integration; official 1.45.0 binary used for launch proof | React-ready runtime log and compositor capture | Complete |
| SHIP-OS order tools | `mcp/shipos`: `shipos_search_orders`, `shipos_get_order` | 14/14 MCP tests; stdio `tools/list` smoke | Complete |
| Desktop-link authentication | `ui/desktop/src/shiposAuth.ts`, `ShiposView.tsx` | HTML/YAML tests; Keychain path via Electron `safeStorage`; 611/611 desktop tests | Complete, live user sign-in deferred |
| Local sessions and Goose shell | Goose session/ACP implementation retained | Upstream desktop suite | Complete |
| Light/dark Goose tokens | Verbatim `theme-tokens.ts` + `main.css` | Theme tests and pixel baseline | Complete |
| Tool approval experience | Goose permission/tool confirmation components retained | Existing component tests | Complete; M1 mutation remains stub/read-only |
| BYOK provider configuration | Goose Settings → Providers retained | User-driven live setup deferred | Complete in UI |
| Pixel-parity baseline | `artifacts/pixel-parity/` + `scripts/pixel-diff.py` | 1.787267% changed pixels (intentional identity/nav delta included) | Baseline recorded |
| Continuous integration | `.github/workflows/ci.yml` | Desktop and MCP gates defined | Complete; remote run occurs on push |

### Remaining user-driven M1 evidence

1. Sign in through the SHIP-OS screen by clicking the emailed desktop link.
2. Enter a personal provider key in Settings → Providers (BYOK).
3. Ask for a real order and confirm the agent invokes both SHIP-OS MCP tools.

These require user credentials and production data and are intentionally not automated or stored in the repository.

### Profile Isolation Correction (2026-08-08)

SHIP-OS Agent is a completely separate program from Goose. The embedded Goose runtime is always launched with `GOOSE_PATH_ROOT` set to `<Electron userData>/runtime`, which isolates `config/`, `data/sessions/`, `state/`, `.agents/plugins/`, and `.agents/agents/`. `GOOSE_DISABLE_KEYRING=1` keeps BYOK provider secrets in the isolated profile rather than Goose's shared keyring service. External config merging is disabled. The SHIP-OS MCP entry is written only to the isolated runtime config.

A first-run gate blocks Goose onboarding, provider setup, session history, and chat until a SHIP-OS desktop-link session has been established. Fresh-profile runtime verification confirmed the first screen is SHIP-OS login and the isolated session directory contains zero imported Goose conversations.

### Focused SHIP-OS Product Surface (2026-08-08)

The visible desktop product is intentionally narrower than Goose. It exposes New Chat, Session History, SHIP-OS account status, and Settings. Provider onboarding is BYOK-only and does not offer local inference. Settings retain Providers, Chat, Keyboard, and App controls. Generic Goose routes and navigation for Recipes, Skills, Apps/MCP Apps, Scheduler, Extensions, Permission editor, Launcher, standalone apps, external backend configuration, prompt/config editors, local inference, project `.goosehints`, Nostr session sharing/import, announcements, and telemetry prompts are not exposed. Goose remains the private ACP runtime engine beneath the SHIP-OS-specific interface.
