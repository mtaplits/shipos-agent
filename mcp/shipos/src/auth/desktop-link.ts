/**
 * Desktop-link authentication (prototype of the app's sign-in flow).
 *
 * Mirrors the shipped Electron shell's desktop-link flow with no SHIP-OS
 * backend changes:
 *
 *   1. POST /login/request-link  (form: email) with the shell user agent
 *      (ShipOS-Electron-Shell). The response HTML embeds
 *      data-desktop-session-id and the per-session client secret.
 *   2. The user clicks the emailed sign-in link (any browser). Server marks
 *      the session confirmed.
 *   3. GET /auth/desktop-session/{session_id}/poll with
 *      X-Desktop-Session-Secret until {"state":"ready"} — that response
 *      finalises the session cookie, which the caller persists and sends
 *      with every /api/v1/mobile/* call.
 */

const DESKTOP_UA_TOKEN = 'ShipOS-Electron-Shell';
const SECRET_HEADER = 'X-Desktop-Session-Secret';

export interface DesktopLinkConfig {
  baseUrl: string;
  email: string;
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
}

export interface DesktopLinkSession {
  sessionId: string;
  clientSecret: string;
}

export interface DesktopLinkResult {
  sessionCookie: string;
  sessionId: string;
  redirect: string;
}

export class DesktopLinkError extends Error {
  constructor(
    message: string,
    readonly state: 'bad_response' | 'expired' | 'timeout' | 'request_failed',
  ) {
    super(message);
    this.name = 'DesktopLinkError';
  }
}

/** POST the sign-in link request and extract the desktop session id + secret from the response HTML. */
export async function requestDesktopLink(config: DesktopLinkConfig): Promise<DesktopLinkSession> {
  const form = new URLSearchParams({ email: config.email, next: '/' });
  const response = await fetch(`${config.baseUrl}/login/request-link`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'user-agent': `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) ${DESKTOP_UA_TOKEN}`,
    },
    body: form.toString(),
    redirect: 'manual',
  });
  const html = await response.text();
  const sessionId = html.match(/data-desktop-session-id="([^"]+)"/)?.[1];
  const clientSecret = html.match(/var clientSecret = ("|')([^"']+)\1/)?.[2];
  if (!sessionId || !clientSecret) {
    throw new DesktopLinkError(
      'The sign-in link request did not return a desktop session (check the email is a SHIP-OS account).',
      'bad_response',
    );
  }
  return { sessionId, clientSecret };
}

/** Poll until the user clicks the emailed link; resolves with the finalised session cookie. */
export async function pollDesktopSession(
  config: DesktopLinkConfig,
  session: DesktopLinkSession,
  onPending?: (elapsedMs: number) => void,
): Promise<DesktopLinkResult> {
  const pollIntervalMs = config.pollIntervalMs ?? 2_000;
  const pollTimeoutMs = config.pollTimeoutMs ?? 5 * 60_000;
  const startedAt = Date.now();

  while (Date.now() - startedAt < pollTimeoutMs) {
    const url = `${config.baseUrl}/auth/desktop-session/${encodeURIComponent(session.sessionId)}/poll`;
    const response = await fetch(url, {
      headers: {
        accept: 'application/json',
        [SECRET_HEADER]: session.clientSecret,
        'user-agent': DESKTOP_UA_TOKEN,
      },
    });
    if (!response.ok) {
      throw new DesktopLinkError(`Desktop session poll failed (HTTP ${response.status}).`, 'request_failed');
    }
    const payload = (await response.json()) as { state?: string; redirect?: string };
    if (payload.state === 'ready') {
      const cookie = response.headers.get('set-cookie');
      if (!cookie) {
        throw new DesktopLinkError('Desktop session was confirmed but no session cookie was returned.', 'bad_response');
      }
      return { sessionCookie: cookie, sessionId: session.sessionId, redirect: payload.redirect ?? '/' };
    }
    if (payload.state === 'expired') {
      throw new DesktopLinkError('The sign-in link was already used or expired. Request a new one.', 'expired');
    }
    onPending?.(Date.now() - startedAt);
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  throw new DesktopLinkError(`Timed out waiting for the sign-in link after ${pollTimeoutMs}ms.`, 'timeout');
}

/** Full flow: request link, print instructions, poll, return the session cookie. */
export async function desktopLinkSignIn(config: DesktopLinkConfig): Promise<DesktopLinkResult> {
  const session = await requestDesktopLink(config);
  return pollDesktopSession(config, session, (elapsedMs) => {
    const seconds = Math.round(elapsedMs / 1000);
    if (seconds > 0 && seconds % 15 === 0) {
      console.error(`[desktop-link] waiting for the sign-in link to be clicked (${seconds}s elapsed)...`);
    }
  });
}
