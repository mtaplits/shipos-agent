import { describe, expect, it } from 'vitest';
import { NAV_ITEMS, SETTINGS_NAV_ITEM, SHIPOS_NAV_ITEM } from './useNavigationItems';

describe('SHIP-OS navigation surface', () => {
  it('exposes only chat, history, SHIP-OS, and settings', () => {
    expect(NAV_ITEMS.map(({ id, path }) => ({ id, path }))).toEqual([
      { id: 'home', path: '/' },
      { id: 'sessions', path: '/sessions' },
    ]);
    expect(SHIPOS_NAV_ITEM.path).toBe('/shipos');
    expect(SETTINGS_NAV_ITEM.path).toBe('/settings');
  });

  it('does not expose generic Goose product surfaces', () => {
    const paths = [...NAV_ITEMS, SHIPOS_NAV_ITEM, SETTINGS_NAV_ITEM].map((item) => item.path);
    expect(paths).not.toEqual(expect.arrayContaining([
      '/recipes', '/skills', '/apps', '/schedules', '/extensions', '/permission',
    ]));
  });
});
