/**
 * SHIP-OS JSON API client.
 *
 * Authenticates with the session cookie established by the desktop-link flow
 * (see auth/desktop-link.ts) and calls the existing SHIP-OS JSON API
 * (/api/v1/mobile/*). No SHIP-OS backend changes are required: the mobile
 * endpoints accept any non-native user agent and the session cookie carries
 * the identity.
 */

export interface ShiposApiConfig {
  /** Base URL, e.g. https://app.shipos.us (default) or http://localhost:8000 */
  baseUrl?: string;
  /** Session cookie value as returned by the desktop-link flow, e.g. "session=..." */
  sessionCookie?: string;
  /** User agent sent with API calls. */
  userAgent?: string;
  /** Timeout per request in ms (default 15_000). */
  timeoutMs?: number;
}

export interface SearchOrdersParams {
  q: string;
  page?: number | undefined;
  limit?: number | undefined;
  accountId?: number | undefined;
  status?: string | undefined;
  orderType?: string | undefined;
  orderState?: string | undefined;
  destination?: string | undefined;
}

export interface OrderRow {
  order_id: number;
  shipment_id: number | null;
  order_number: string;
  reference: string | null;
  account_name: string | null;
  account_id: number | null;
  destination_label: string | null;
  destination_display: string | null;
  city_state_display: string | null;
  status_summary_label: string | null;
  status_summary_tone: string | null;
  item_summary: string | null;
  item_count: number | null;
  unit_count: number | null;
  ordered_at: string | null;
  shipped_at: string | null;
  age_label: string | null;
  tracking_number: string | null;
  is_billed: boolean | null;
  is_international: boolean | null;
  order_type: string | null;
  order_state: string | null;
  hold_state: string | null;
  delivery_state: string | null;
  section: string | null;
  [key: string]: unknown;
}

export interface SearchOrdersResult {
  count: number;
  page: number;
  limit: number;
  page_count: number;
  rows: OrderRow[];
  source: string;
}

export class ShiposApiError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'ShiposApiError';
  }
}

const DEFAULT_BASE_URL = 'https://app.shipos.us';
const DEFAULT_USER_AGENT = 'SHIP-OS-Agent/0.1.0 (Macintosh; Mac OS X) shipos-agent';

function buildQuery(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value));
    }
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

export class ShiposApiClient {
  private readonly baseUrl: string;
  private readonly sessionCookie: string | undefined;
  private readonly userAgent: string;
  private readonly timeoutMs: number;

  constructor(config: ShiposApiConfig = {}) {
    this.baseUrl = (config.baseUrl ?? process.env.SHIPOS_API_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.sessionCookie = config.sessionCookie ?? process.env.SHIPOS_SESSION_COOKIE;
    this.userAgent = config.userAgent ?? DEFAULT_USER_AGENT;
    this.timeoutMs = config.timeoutMs ?? 15_000;
  }

  private async request<T>(path: string, query?: Record<string, string | number | undefined | null>): Promise<T> {
    const url = `${this.baseUrl}${path}${query ? buildQuery(query) : ''}`;
    const headers: Record<string, string> = {
      accept: 'application/json',
      'user-agent': this.userAgent,
    };
    if (this.sessionCookie) {
      headers.cookie = this.sessionCookie;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(url, { headers, signal: controller.signal, redirect: 'follow' });
      if (response.status === 401) {
        throw new ShiposApiError('SHIP-OS session is missing, expired, or revoked. Sign in again.', 401, false);
      }
      if (response.status === 429 || response.status >= 500) {
        throw new ShiposApiError(
          `SHIP-OS API unavailable (HTTP ${response.status}). Try again shortly.`,
          response.status,
          true,
        );
      }
      if (!response.ok) {
        throw new ShiposApiError(`SHIP-OS API error (HTTP ${response.status})`, response.status, false);
      }
      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof ShiposApiError) {
        throw error;
      }
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ShiposApiError(`SHIP-OS API request timed out after ${this.timeoutMs}ms.`, null, true);
      }
      throw new ShiposApiError(`SHIP-OS API request failed: ${String(error)}`, null, true);
    } finally {
      clearTimeout(timer);
    }
  }

  /** Search the orders feed (q matches order numbers/refs via the search projection). */
  async searchOrders(params: SearchOrdersParams): Promise<SearchOrdersResult> {
    const payload = await this.request<{
      count?: number;
      page?: number;
      limit?: number;
      page_count?: number;
      rows?: OrderRow[];
    }>('/api/v1/mobile/orders', {
      q: params.q,
      page: params.page ?? 1,
      limit: params.limit ?? 25,
      account_id: params.accountId,
      status: params.status,
      order_type: params.orderType,
      order_state: params.orderState,
      destination: params.destination,
    });
    const rows = (payload.rows ?? []).map((row) => this.sanitizeRow(row));
    return {
      count: payload.count ?? rows.length,
      page: payload.page ?? params.page ?? 1,
      limit: payload.limit ?? params.limit ?? 25,
      page_count: payload.page_count ?? 1,
      rows,
      source: `${this.baseUrl}/api/v1/mobile/orders?q=${encodeURIComponent(params.q)}`,
    };
  }

  /** Shipment snapshot (line-level detail) for one order's primary shipment. */
  async shipmentSnapshot(orderId: number, shipmentId: number): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>(`/api/v1/mobile/orders/${orderId}/shipments/${shipmentId}`);
  }

  private sanitizeRow(row: OrderRow): OrderRow {
    const { search_tokens: _drop, ...rest } = row as OrderRow & { search_tokens?: unknown };
    return rest;
  }
}
