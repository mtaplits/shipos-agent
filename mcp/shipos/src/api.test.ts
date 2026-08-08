import { describe, it, expect, vi, afterEach } from 'vitest';
import { ShiposApiClient, ShiposApiError } from '../src/api.js';

function mockFetch(handler: (url: string, init?: RequestInit) => Promise<Response>): void {
  vi.stubGlobal('fetch', vi.fn(handler) as unknown as typeof fetch);
}

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

const feedPayload = {
  count: 1,
  page: 1,
  limit: 25,
  page_count: 1,
  rows: [
    {
      order_id: 1041,
      shipment_id: 55,
      order_number: '1041',
      reference: 'REF-1',
      status_summary_label: 'Ready to pick',
      status_summary_tone: 'yellow',
      destination_label: 'Jane Doe',
      destination_display: '123 Main St',
      city_state_display: 'Austin, TX',
      item_summary: '2 items · 4 units',
      item_count: 2,
      unit_count: 4,
      ordered_at: '2026-08-01T10:00:00Z',
      shipped_at: null,
      tracking_number: null,
      is_billed: false,
      is_international: false,
      order_state: 'NEW',
      hold_state: 'NONE',
      delivery_state: 'NOT_DELIVERED',
      section: 'unbatched',
      search_tokens: ['1041', 'jane'],
    },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ShiposApiClient', () => {
  it('searches orders with the query string and session cookie', async () => {
    mockFetch((url, init) => {
      expect(url).toContain('/api/v1/mobile/orders?q=1041&page=1&limit=25');
      expect((init?.headers as Record<string, string>).cookie).toBe('session=abc');
      return Promise.resolve(jsonResponse(feedPayload));
    });
    const client = new ShiposApiClient({ baseUrl: 'https://app.shipos.us', sessionCookie: 'session=abc' });
    const result = await client.searchOrders({ q: '1041' });
    expect(result.count).toBe(1);
    expect(result.rows[0]?.order_number).toBe('1041');
    expect(result.rows[0]?.status_summary_label).toBe('Ready to pick');
  });

  it('drops internal search_tokens from rows', async () => {
    mockFetch(() => Promise.resolve(jsonResponse(feedPayload)));
    const client = new ShiposApiClient({ baseUrl: 'https://app.shipos.us', sessionCookie: 'session=abc' });
    const result = await client.searchOrders({ q: '1041' });
    expect(result.rows[0]).not.toHaveProperty('search_tokens');
  });

  it('maps account and filter params into the query', async () => {
    mockFetch((url) => {
      expect(url).toContain('account_id=7');
      expect(url).toContain('status=NEW');
      return Promise.resolve(jsonResponse({ rows: [] }));
    });
    const client = new ShiposApiClient({ baseUrl: 'https://app.shipos.us', sessionCookie: 'c' });
    await client.searchOrders({ q: 'x', accountId: 7, status: 'NEW' });
  });

  it('surfaces 401 as a non-retryable sign-in error', async () => {
    mockFetch(() => Promise.resolve(jsonResponse({ detail: 'Authentication required' }, 401)));
    const client = new ShiposApiClient({ baseUrl: 'https://app.shipos.us' });
    await expect(client.searchOrders({ q: 'x' })).rejects.toMatchObject({
      name: 'ShiposApiError',
      status: 401,
      retryable: false,
    });
  });

  it('marks 503 as retryable', async () => {
    mockFetch(() => Promise.resolve(jsonResponse({}, 503)));
    const client = new ShiposApiClient({ baseUrl: 'https://app.shipos.us' });
    await expect(client.searchOrders({ q: 'x' })).rejects.toMatchObject({ status: 503, retryable: true });
  });

  it('uses the configured base URL for shipment snapshots', async () => {
    mockFetch((url) => {
      expect(url).toBe('http://localhost:8000/api/v1/mobile/orders/1041/shipments/55');
      return Promise.resolve(jsonResponse({ shipment_id: 55, lines: [] }));
    });
    const client = new ShiposApiClient({ baseUrl: 'http://localhost:8000' });
    const snapshot = await client.shipmentSnapshot(1041, 55);
    expect(snapshot.shipment_id).toBe(55);
  });

  it('throws a typed error on timeout', async () => {
    mockFetch((_url, init) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      });
    });
    const client = new ShiposApiClient({ baseUrl: 'https://app.shipos.us', timeoutMs: 50 });
    await expect(client.searchOrders({ q: 'x' })).rejects.toMatchObject({
      name: 'ShiposApiError',
      retryable: true,
    });
  });
});
