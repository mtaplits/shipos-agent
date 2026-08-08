/**
 * SHIP-OS MCP tools.
 *
 * Milestone 1 scope: read-only order search + detail over the existing JSON
 * API. Mutations (buy label etc.) arrive in M2 behind the approval flow.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ShiposApiClient } from '../api.js';

type ToolRegistrar = Pick<McpServer, 'registerTool'>;

const SearchOrdersSchema = z.object({
  q: z
    .string()
    .min(1)
    .describe('Free-text query; matches order numbers and references (e.g. "1041", "AMZ-1041").'),
  page: z.number().int().min(1).optional().describe('Page number (default 1).'),
  limit: z.number().int().min(1).max(100).optional().describe('Rows per page (default 25, max 100).'),
  account_id: z.number().int().positive().optional().describe('Filter by account id.'),
  status: z.string().optional().describe('Filter by order status token.'),
  order_type: z.string().optional().describe('Filter by order type.'),
  order_state: z.string().optional().describe('Filter by order state.'),
  destination: z.string().optional().describe('Filter by destination label.'),
});

const GetOrderSchema = z.object({
  order_number: z.string().min(1).optional().describe('Exact order number to look up.'),
  order_id: z.number().int().positive().optional().describe('Exact order id to look up.'),
  detail: z
    .enum(['row', 'lines'])
    .optional()
    .describe('"row" (default) returns the feed row; "lines" also fetches line-level items from the shipment snapshot.'),
});

type SearchOrdersInput = z.infer<typeof SearchOrdersSchema>;
type GetOrderInput = z.infer<typeof GetOrderSchema>;

function summary(count: number, detail: string): { content: { type: 'text'; text: string }[] } {
  return { content: [{ type: 'text', text: `Found ${count} order(s).\n${detail}` }] };
}

function notFound(what: string): { content: { type: 'text'; text: string }[] } {
  return { content: [{ type: 'text', text: `No order found for ${what}. The order may not exist or may be outside your account access.` }] };
}

function errorResult(error: unknown): { content: { type: 'text'; text: string }[] } {
  return { content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : String(error)}` }] };
}

export function registerShiposTools(server: ToolRegistrar, client: ShiposApiClient): void {
  server.registerTool(
    'shipos_search_orders',
    { inputSchema: SearchOrdersSchema, description: 'Search SHIP-OS orders by number/reference.' },
    async (rawInput: any) => {
      const input = SearchOrdersSchema.parse(rawInput) as SearchOrdersInput;
      try {
        const result = await client.searchOrders({
          q: input.q,
          page: input.page ?? 1,
          limit: input.limit ?? 25,
          accountId: input.account_id,
          status: input.status,
          orderType: input.order_type,
          orderState: input.order_state,
          destination: input.destination,
        });
        if (result.rows.length === 0) {
          return notFound(`query "${input.q}"`);
        }
        const lines = result.rows
          .map((row, index) => {
            return `${index + 1}. ${row.order_number} — ${row.status_summary_label ?? 'n/a'} — ${row.destination_label ?? row.city_state_display ?? 'n/a'} — ${row.item_summary ?? ''}${row.tracking_number ? ` — tracking ${row.tracking_number}` : ''}`;
          })
          .join('\n');
        return summary(
          result.count,
          `${lines}\n\nUse shipos_get_order with an order_number for the full detail card (order_id ${result.rows[0]?.order_id ?? 'n/a'} for the first match).`,
        );
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    'shipos_get_order',
    { inputSchema: GetOrderSchema, description: 'Get a SHIP-OS order detail card (number, status, ship-to, items).' },
    async (rawInput: any) => {
    const input = GetOrderSchema.parse(rawInput) as GetOrderInput;
    if (!input.order_number && !input.order_id) {
      return { content: [{ type: 'text', text: 'Provide either order_number or order_id.' }] };
    }
    try {
      const q = input.order_number ?? String(input.order_id);
      const result = await client.searchOrders({ q, page: 1, limit: 25 });
      const match = result.rows.find((row) => {
        if (input.order_number) {
          return row.order_number === input.order_number;
        }
        return row.order_id === input.order_id;
      });

      if (!match) {
        return notFound(`"${q}"`);
      }

      const card: Record<string, unknown> = {
        order_number: match.order_number,
        order_id: match.order_id,
        status: match.status_summary_label,
        status_tone: match.status_summary_tone,
        ship_to: match.destination_label ?? match.city_state_display,
        destination_display: match.destination_display,
        item_summary: match.item_summary,
        item_count: match.item_count,
        unit_count: match.unit_count,
        account: match.account_name,
        ordered_at: match.ordered_at,
        shipped_at: match.shipped_at,
        tracking_number: match.tracking_number,
        is_billed: match.is_billed,
        is_international: match.is_international,
        order_state: match.order_state,
        hold_state: match.hold_state,
        delivery_state: match.delivery_state,
        section: match.section,
        reference: match.reference,
      };

      let detail = JSON.stringify(card, null, 2);

      if (input.detail === 'lines' && match.shipment_id) {
        try {
          const snapshot = await client.shipmentSnapshot(match.order_id, match.shipment_id);
          detail += `\n\nShipment lines:\n${JSON.stringify(snapshot, null, 2)}`;
        } catch (error) {
          detail += `\n\n(Shipment snapshot unavailable: ${error instanceof Error ? error.message : String(error)})`;
        }
      }

      return summary(1, detail);
    } catch (error) {
      return errorResult(error);
    }
  });
}
