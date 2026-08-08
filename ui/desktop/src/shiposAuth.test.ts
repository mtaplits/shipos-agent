import { describe, it, expect } from 'vitest';
import {
  parseDesktopLinkHtml,
  renderMcpServerYaml,
  mergeMcpServerIntoConfig,
  type McpServerEntry,
} from './shiposAuth';

const entry: McpServerEntry = {
  command: 'node',
  args: ['/repo/mcp/shipos/dist/index.js'],
  env: {
    SHIPOS_API_BASE_URL: 'https://app.shipos.us',
    SHIPOS_SESSION_COOKIE: 'session=abc',
  },
};

describe('parseDesktopLinkHtml', () => {
  it('extracts session id and client secret from the check-email page', () => {
    const html =
      '<section class="card" data-desktop-session-id="abc123">' +
      '<script>var sessionId = "abc123"; var clientSecret = "secret-token";</script>';
    expect(parseDesktopLinkHtml(html)).toEqual({ sessionId: 'abc123', clientSecret: 'secret-token' });
  });

  it('returns null when the page has no desktop session', () => {
    expect(parseDesktopLinkHtml('<section class="card">no session</section>')).toBeNull();
  });
});

describe('renderMcpServerYaml', () => {
  it('renders the shipos MCP entry', () => {
    const yaml = renderMcpServerYaml('shipos', entry);
    expect(yaml).toContain('  shipos:');
    expect(yaml).toContain('    command: "node"');
    expect(yaml).toContain('      - "/repo/mcp/shipos/dist/index.js"');
    expect(yaml).toContain('      SHIPOS_SESSION_COOKIE: "session=abc"');
  });
});

describe('mergeMcpServerIntoConfig', () => {
  it('creates mcpServers in an empty file', () => {
    const out = mergeMcpServerIntoConfig('', 'shipos', entry);
    expect(out).toContain('mcpServers:');
    expect(out).toContain('  shipos:');
  });

  it('appends mcpServers to a config that has no mcpServers', () => {
    const out = mergeMcpServerIntoConfig('model: gpt-4o\n', 'shipos', entry);
    expect(out).toContain('model: gpt-4o');
    expect(out.indexOf('mcpServers:')).toBeGreaterThan(out.indexOf('model:'));
  });

  it('adds shipos inside an existing mcpServers block', () => {
    const config = 'model: gpt-4o\nmcpServers:\n  filesystem:\n    command: npx\nprovider: anthropic\n';
    const out = mergeMcpServerIntoConfig(config, 'shipos', entry);
    expect(out).toContain('  filesystem:');
    expect(out).toContain('  shipos:');
    // provider stays a top-level key after the block
    expect(out.indexOf('provider:')).toBeGreaterThan(out.indexOf('shipos:'));
  });

  it('replaces an existing shipos entry without touching siblings', () => {
    const config = 'mcpServers:\n  shipos:\n    command: old\n  filesystem:\n    command: npx\n';
    const out = mergeMcpServerIntoConfig(config, 'shipos', entry);
    expect(out).not.toContain('command: old');
    expect(out).toContain('  shipos:');
    expect(out).toContain('  filesystem:');
  });
});
