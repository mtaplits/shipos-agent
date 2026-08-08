/**
 * SHIP-OS authentication for the desktop app (main process).
 *
 * Uses the shipped shell's desktop-link flow with no SHIP-OS backend
 * changes: request-link (ShipOS-Electron-Shell UA) -> parse session id +
 * client secret -> poll /auth/desktop-session/{id}/poll with the secret ->
 * the ready response finalises the session cookie.
 *
 * On success the cookie is persisted via safeStorage (macOS Keychain) and
 * the SHIP-OS MCP server is registered in the goose config
 * (~/.config/goose/config.yaml, mcpServers.shipos) so the agent can call
 * shipos_search_orders / shipos_get_order.
 */

import { app, safeStorage } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) ShipOS-Electron-Shell';
const SECRET_HEADER = 'X-Desktop-Session-Secret';
const POLL_INTERVAL_MS = 2_000;
const POLL_TIMEOUT_MS = 5 * 60_000;

export interface ShiposSessionState {
  signedIn: boolean;
  email?: string;
  baseUrl?: string;
}

interface PersistedSession {
  email: string;
  baseUrl: string;
  /** base64 of safeStorage.encryptString(sessionCookie) */
  encryptedCookie: string;
}

interface DesktopLinkSession {
  sessionId: string;
  clientSecret: string;
}

export function parseDesktopLinkHtml(html: string): DesktopLinkSession | null {
  const sessionId = html.match(/data-desktop-session-id="([^"]+)"/)?.[1];
  const clientSecret = html.match(/var clientSecret = ("|')([^"']+)\1/)?.[2];
  if (!sessionId || !clientSecret) {
    return null;
  }
  return { sessionId, clientSecret };
}

export interface McpServerEntry {
  command: string;
  args: string[];
  env: Record<string, string>;
}

export class ShiposAuthError extends Error {
  constructor(
    message: string,
    readonly code: 'bad_response' | 'expired' | 'timeout' | 'request_failed' | 'storage',
  ) {
    super(message);
    this.name = 'ShiposAuthError';
  }
}

export function defaultShiposBaseUrl(): string {
  return process.env.SHIPOS_API_BASE_URL ?? 'https://app.shipos.us';
}

export function gooseConfigPath(): string {
  return path.join(os.homedir(), '.config', 'goose', 'config.yaml');
}

export function sessionFilePath(): string {
  return path.join(app.getPath('userData'), 'shipos-session.json');
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

export function loadPersistedSession(): PersistedSession | null {
  try {
    const raw = fs.readFileSync(sessionFilePath(), 'utf8');
    const parsed = JSON.parse(raw) as PersistedSession;
    if (!parsed.email || !parsed.encryptedCookie) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function decryptSessionCookie(persisted: PersistedSession): string {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new ShiposAuthError('System keychain encryption is unavailable; cannot persist the session.', 'storage');
  }
  try {
    return safeStorage.decryptString(Buffer.from(persisted.encryptedCookie, 'base64'));
  } catch {
    throw new ShiposAuthError('Could not decrypt the stored session cookie.', 'storage');
  }
}

export function currentSessionState(): ShiposSessionState {
  const persisted = loadPersistedSession();
  if (!persisted) {
    return { signedIn: false };
  }
  return { signedIn: true, email: persisted.email, baseUrl: persisted.baseUrl };
}

// ---------------------------------------------------------------------------
// Desktop-link flow
// ---------------------------------------------------------------------------

async function requestDesktopLink(baseUrl: string, email: string): Promise<DesktopLinkSession> {
  const form = new URLSearchParams({ email, next: '/' });
  const response = await fetch(`${baseUrl}/login/request-link`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'user-agent': DESKTOP_UA,
    },
    body: form.toString(),
    redirect: 'manual',
  });
  const html = await response.text();
  const parsed = parseDesktopLinkHtml(html);
  if (!parsed) {
    throw new ShiposAuthError(
      'The sign-in link request did not return a desktop session. Check that the email is a SHIP-OS account.',
      'bad_response',
    );
  }
  return parsed;
}

async function pollDesktopSession(baseUrl: string, session: DesktopLinkSession): Promise<string> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < POLL_TIMEOUT_MS) {
    const response = await fetch(`${baseUrl}/auth/desktop-session/${encodeURIComponent(session.sessionId)}/poll`, {
      headers: {
        accept: 'application/json',
        [SECRET_HEADER]: session.clientSecret,
        'user-agent': DESKTOP_UA,
      },
    });
    if (!response.ok) {
      throw new ShiposAuthError(`Desktop session poll failed (HTTP ${response.status}).`, 'request_failed');
    }
    const payload = (await response.json()) as { state?: string; redirect?: string };
    if (payload.state === 'ready') {
      const setCookie = response.headers.get('set-cookie');
      if (!setCookie) {
        throw new ShiposAuthError('Session was confirmed but no session cookie was returned.', 'bad_response');
      }
      // Keep only the session=... pair (drop path/expires attributes).
      return setCookie.split(';')[0] ?? setCookie;
    }
    if (payload.state === 'expired') {
      throw new ShiposAuthError('The sign-in link was already used or expired. Request a new one.', 'expired');
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new ShiposAuthError(`Timed out waiting for the sign-in link after ${POLL_TIMEOUT_MS}ms.`, 'timeout');
}

// ---------------------------------------------------------------------------
// Goose config (MCP server registration)
// ---------------------------------------------------------------------------

function yamlQuote(value: string): string {
  return JSON.stringify(value);
}

export function renderMcpServerYaml(name: string, entry: McpServerEntry): string {
  const lines = [`  ${name}:`, `    command: ${yamlQuote(entry.command)}`];
  if (entry.args.length > 0) {
    lines.push('    args:');
    for (const arg of entry.args) {
      lines.push(`      - ${yamlQuote(arg)}`);
    }
  }
  lines.push('    env:');
  for (const [key, value] of Object.entries(entry.env)) {
    lines.push(`      ${key}: ${yamlQuote(value)}`);
  }
  return lines.join('\n');
}

/**
 * Merge a top-level `mcpServers.<name>` entry into a goose config.yaml,
 * preserving the rest of the file. Line-based merge that understands the
 * two-space indented mcpServers block.
 */
export function mergeMcpServerIntoConfig(configYaml: string, name: string, entry: McpServerEntry): string {
  const block = renderMcpServerYaml(name, entry);
  const lines = configYaml.split('\n');
  const mcpIndex = lines.findIndex((line) => /^mcpServers:\s*$/.test(line));
  if (mcpIndex === -1) {
    const trimmed = configYaml.trimEnd();
    return `${trimmed}${trimmed ? '\n' : ''}mcpServers:\n${block}\n`;
  }
  // Find the end of the mcpServers block: next top-level key or EOF.
  let endIndex = lines.length;
  for (let i = mcpIndex + 1; i < lines.length; i += 1) {
    if (/^\S/.test(lines[i] ?? '') && lines[i]?.trim()) {
      endIndex = i;
      break;
    }
  }
  // Remove an existing entry for this name (line `  <name>:` through its block).
  const before = lines.slice(0, endIndex);
  const after = lines.slice(endIndex);
  const filtered: string[] = [];
  let skipping = false;
  for (const line of before) {
    if (!skipping && new RegExp(`^  ${name}:\\s*$`).test(line)) {
      skipping = true;
      continue;
    }
    if (skipping) {
      // End of the entry block: a sibling (2-space) or top-level (0-space) key.
      if (/^\S|^ {2}\S/.test(line)) {
        skipping = false;
      } else {
        continue;
      }
    }
    filtered.push(line);
  }
  const insertionPoint = filtered.length;
  filtered.splice(insertionPoint, 0, block);
  return [...filtered, ...after].join('\n');
}

export function buildShiposMcpEntry(sessionCookie: string, baseUrl: string): McpServerEntry {
  // Dev layout: <repo>/mcp/shipos/dist/index.js. Packaged layout (resource)
  // is deferred to a later milestone.
  return {
    command: 'node',
    args: [path.join(app.getAppPath(), '..', '..', 'mcp', 'shipos', 'dist', 'index.js')],
    env: {
      SHIPOS_API_BASE_URL: baseUrl,
      SHIPOS_SESSION_COOKIE: sessionCookie,
    },
  };
}

export function registerShiposMcpServer(sessionCookie: string, baseUrl: string): void {
  const configPath = gooseConfigPath();
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  const existing = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : '';
  const updated = mergeMcpServerIntoConfig(existing, 'shipos', buildShiposMcpEntry(sessionCookie, baseUrl));
  fs.writeFileSync(configPath, updated, 'utf8');
}

export function unregisterShiposMcpServer(): void {
  const configPath = gooseConfigPath();
  if (!fs.existsSync(configPath)) {
    return;
  }
  const lines = fs.readFileSync(configPath, 'utf8').split('\n');
  const mcpIndex = lines.findIndex((line) => /^mcpServers:\s*$/.test(line));
  if (mcpIndex === -1) {
    return;
  }
  let endIndex = lines.length;
  for (let i = mcpIndex + 1; i < lines.length; i += 1) {
    if (/^\S/.test(lines[i] ?? '') && lines[i]?.trim()) {
      endIndex = i;
      break;
    }
  }
  const filtered: string[] = [];
  let skipping = false;
  for (const line of lines.slice(mcpIndex, endIndex)) {
    if (!skipping && /^ {2}shipos:\s*$/.test(line)) {
      skipping = true;
      continue;
    }
    if (skipping) {
      // End of the entry block: a sibling (2-space) or top-level (0-space) key.
      if (/^\S|^ {2}\S/.test(line)) {
        skipping = false;
      } else {
        continue;
      }
    }
    filtered.push(line);
  }
  const updated = [...lines.slice(0, mcpIndex), ...filtered, ...lines.slice(endIndex)].join('\n');
  fs.writeFileSync(configPath, updated, 'utf8');
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

let activeSession: DesktopLinkSession | null = null;

export async function shiposRequestLink(email: string, baseUrl?: string): Promise<void> {
  const resolvedBase = baseUrl ?? defaultShiposBaseUrl();
  pendingEmail = email.trim();
  activeSession = await requestDesktopLink(resolvedBase, email.trim());
}

export async function shiposPoll(): Promise<ShiposSessionState> {
  if (!activeSession) {
    throw new ShiposAuthError('No sign-in link in progress. Request one first.', 'bad_response');
  }
  const baseUrl = defaultShiposBaseUrl();
  const sessionCookie = await pollDesktopSession(baseUrl, activeSession);
  activeSession = null;
  const email = loadPendingEmail();
  if (!email) {
    throw new ShiposAuthError('Session email was lost before the link was confirmed.', 'storage');
  }
  if (!safeStorage.isEncryptionAvailable()) {
    throw new ShiposAuthError('System keychain encryption is unavailable; cannot persist the session.', 'storage');
  }
  const persisted: PersistedSession = {
    email,
    baseUrl,
    encryptedCookie: safeStorage.encryptString(sessionCookie).toString('base64'),
  };
  fs.mkdirSync(path.dirname(sessionFilePath()), { recursive: true });
  fs.writeFileSync(sessionFilePath(), JSON.stringify(persisted, null, 2), 'utf8');
  registerShiposMcpServer(sessionCookie, baseUrl);
  return { signedIn: true, email, baseUrl };
}

let pendingEmail: string | null = null;
function loadPendingEmail(): string | null {
  const email = pendingEmail;
  pendingEmail = null;
  return email;
}

export function shiposSignOut(): ShiposSessionState {
  activeSession = null;
  pendingEmail = null;
  try {
    if (fs.existsSync(sessionFilePath())) {
      fs.rmSync(sessionFilePath());
    }
    unregisterShiposMcpServer();
  } catch {
    // Best-effort cleanup; the state is signed out regardless.
  }
  return { signedIn: false };
}
