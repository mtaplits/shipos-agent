#!/usr/bin/env node
/**
 * Desktop-link sign-in helper for the SHIP-OS MCP server.
 *
 * Usage:
 *   SHIPOS_EMAIL=you@example.com pnpm --dir mcp/shipos login
 *
 * Prints the session cookie once the emailed link is clicked. The cookie
 * is then passed to the MCP server via SHIPOS_SESSION_COOKIE.
 */

import { desktopLinkSignIn } from '../src/auth/desktop-link.js';

const email = process.env.SHIPOS_EMAIL;
if (!email) {
  console.error('Set SHIPOS_EMAIL to your SHIP-OS account email, e.g. SHIPOS_EMAIL=you@example.com pnpm --dir mcp/shipos login');
  process.exit(1);
}

const baseUrl = process.env.SHIPOS_API_BASE_URL ?? 'https://app.shipos.us';

console.error(`[desktop-link] requesting a sign-in link for ${email} at ${baseUrl}...`);
const result = await desktopLinkSignIn({ baseUrl, email });
console.error(`[desktop-link] session confirmed; redirect: ${result.redirect}`);
console.log(`SHIPOS_SESSION_COOKIE=${result.sessionCookie}`);
