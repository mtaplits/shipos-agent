#!/usr/bin/env node
/**
 * SHIP-OS MCP server (stdio transport).
 *
 * Environment:
 *   SHIPOS_API_BASE_URL   default https://app.shipos.us
 *   SHIPOS_SESSION_COOKIE session cookie from the desktop-link flow
 *                         (run `pnpm login` to obtain one)
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ShiposApiClient } from './api.js';
import { registerShiposTools } from './tools/orders.js';

export function createShiposMcpServer(client: ShiposApiClient): McpServer {
  const server = new McpServer({
    name: 'shipos',
    version: '0.1.0',
  });
  registerShiposTools(server, client);
  return server;
}

async function main(): Promise<void> {
  if (!process.env.SHIPOS_SESSION_COOKIE) {
    console.error('[shipos-mcp] SHIPOS_SESSION_COOKIE is not set. Run `pnpm --dir mcp/shipos login` to sign in.');
  }
  const client = new ShiposApiClient();
  const server = createShiposMcpServer(client);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (process.argv[1]?.endsWith('index.js') || process.argv[1]?.endsWith('index.ts')) {
  void main();
}

export { ShiposApiClient } from './api.js';
export { desktopLinkSignIn } from './auth/desktop-link.js';
