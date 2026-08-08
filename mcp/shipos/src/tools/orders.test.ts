import { describe, it, expect, vi } from 'vitest';
import { registerShiposTools } from './orders.js';
import type { ShiposApiClient, SearchOrdersResult, OrderRow } from '../api.js';

interface RegisteredTool {
  name: string;
  handler: (input: unknown) => Promise<unknown>;
}

function fakeServer(): { server: { registerTool: (name: string, _schema: unknown, handler: (i: unknown) => Promise<unknown>) => void }; tools: RegisteredTool[] } {
  const tools: RegisteredTool[] = [];
  const server = {
    registerTool: (name: string, _schema: unknown, handler: (i: unknown) => Promise<unknown>) => {
      tools.push({ name, handler });
    },
  };
  return { server, tools };
}

const row: OrderRow = {
  order_id: 1041,
  shipment_id: 55,
  order_number: '1041',
  reference: 'REF-1',
  account_name: 'Acme',
  account_id: 7,
  destination_label: 'Jane Doe',
  destination_display: '123 Main St',
  city_state_display: 'Austin, TX',
  status_summary_label: 'Ready to pick',
  status_summary_tone: 'yellow',
  item_summary: '2 items · 4 units',
  item_count: 2,
  unit_count: 4,
  ordered_at: '2026-08-01T10:00:00Z',
  shipped_at: null,
  age_label: '7 days',
  tracking_number: null,
  is_billed: false,
  is_international: false,
  order_type: 'STANDARD',
  order_state: 'NEW',
  hold_state: 'NONE',
  delivery_state: 'NOT_DELIVERED',
  section: 'unbatched',
};

const searchResult: SearchOrdersResult = {
  count: 1,
  page: 1,
  limit: 25,
  page_count: 1,
  rows: [row],
  source: 'https://app.shipos.us/api/v1/mobile/orders?q=1041',
};

function fakeClient(overrides: Partial<ShiposApiClient> = {}): ShiposApiClient {
  return {
    searchOrders: vi.fn(async () => searchResult),
    shipmentSnapshot: vi.fn(async () => ({ shipment_id: 55, lines: [{ sku: 'RS-FBS', quantity: 2 }] })),
    ...overrides,
  } as unknown as ShiposApiClient;
}

function textOf(result: unknown): string {
  const content = (result as { content?: { text?: string }[] }).content ?? [];
  return content.map((c) => c.text ?? '').join('');
}

describe('registerShiposTools', () => {
  it('registers both M1 tools', () => {
    const { server, tools } = fakeServer();
    registerShiposTools(server, fakeClient());
    expect(tools.map((t) => t.name)).toEqual(['shipos_search_orders', 'shipos_get_order']);
  });

  it('search_orders returns a summary with matches', async () => {
    const { server, tools } = fakeServer();
    registerShiposTools(server, fakeClient());
    const tool = tools.find((t) => t.name === 'shipos_search_orders')!;
    const out = await tool.handler({ q: '1041' });
    expect(textOf(out)).toContain('Found 1 order(s)');
    expect(textOf(out)).toContain('1041 — Ready to pick — Jane Doe');
  });

  it('search_orders reports no match without crashing', async () => {
    const { server, tools } = fakeServer();
    registerShiposTools(server, fakeClient({ searchOrders: vi.fn(async () => ({ ...searchResult, rows: [], count: 0 })) }));
    const tool = tools.find((t) => t.name === 'shipos_search_orders')!;
    const out = await tool.handler({ q: 'zzz' });
    expect(textOf(out)).toContain('No order found');
  });

  it('get_order returns the detail card for an exact order_number', async () => {
    const { server, tools } = fakeServer();
    registerShiposTools(server, fakeClient());
    const tool = tools.find((t) => t.name === 'shipos_get_order')!;
    const out = await tool.handler({ order_number: '1041' });
    const text = textOf(out);
    expect(text).toContain('"order_number": "1041"');
    expect(text).toContain('"status": "Ready to pick"');
    expect(text).toContain('"ship_to": "Jane Doe"');
    expect(text).toContain('"item_summary": "2 items · 4 units"');
  });

  it('get_order with detail=lines includes the shipment snapshot', async () => {
    const client = fakeClient();
    const { server, tools } = fakeServer();
    registerShiposTools(server, client);
    const tool = tools.find((t) => t.name === 'shipos_get_order')!;
    const out = await tool.handler({ order_number: '1041', detail: 'lines' });
    expect(textOf(out)).toContain('Shipment lines:');
    expect(client.shipmentSnapshot).toHaveBeenCalledWith(1041, 55);
  });

  it('get_order reports not found for a non-matching id', async () => {
    const client = fakeClient({
      searchOrders: vi.fn(async () => ({ ...searchResult, rows: [{ ...row, order_id: 2000, order_number: '2000' }], count: 1 })),
    });
    const { server, tools } = fakeServer();
    registerShiposTools(server, client);
    const tool = tools.find((t) => t.name === 'shipos_get_order')!;
    const out = await tool.handler({ order_id: 1041 });
    expect(textOf(out)).toContain('No order found');
  });

  it('requires order_number or order_id', async () => {
    const { server, tools } = fakeServer();
    registerShiposTools(server, fakeClient());
    const tool = tools.find((t) => t.name === 'shipos_get_order')!;
    const out = await tool.handler({});
    expect(textOf(out)).toContain('Provide either order_number or order_id.');
  });
});
