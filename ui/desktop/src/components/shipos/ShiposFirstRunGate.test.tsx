/** @vitest-environment jsdom */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IntlTestWrapper } from '../../i18n/test-utils';
import ShiposFirstRunGate from './ShiposFirstRunGate';

const state = vi.fn();
const requestLink = vi.fn();
const poll = vi.fn();
const reloadApp = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window, 'shiposAuth', {
    configurable: true,
    value: { state, requestLink, poll, signOut: vi.fn() },
  });
  window.electron.reloadApp = reloadApp;
});

function renderGate() {
  return render(
    <IntlTestWrapper>
      <ShiposFirstRunGate><div>private chat shell</div></ShiposFirstRunGate>
    </IntlTestWrapper>
  );
}

describe('ShiposFirstRunGate', () => {
  it('blocks the chat shell and shows SHIP-OS login for a fresh profile', async () => {
    state.mockResolvedValue({ signedIn: false });
    renderGate();
    expect(await screen.findByRole('heading', { name: 'Sign in to SHIP-OS' })).toBeInTheDocument();
    expect(screen.queryByText('private chat shell')).not.toBeInTheDocument();
  });

  it('renders the chat shell only after a persisted SHIP-OS session exists', async () => {
    state.mockResolvedValue({ signedIn: true, email: 'operator@example.com' });
    renderGate();
    expect(await screen.findByText('private chat shell')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Sign in to SHIP-OS' })).not.toBeInTheDocument();
  });

  it('reloads after login completes so Goose starts from the completed isolated profile', async () => {
    state.mockResolvedValue({ signedIn: false });
    requestLink.mockResolvedValue(undefined);
    poll.mockResolvedValue({ signedIn: true, email: 'operator@example.com' });
    const user = userEvent.setup();
    renderGate();
    await user.type(await screen.findByLabelText('SHIP-OS email'), 'operator@example.com');
    await user.click(screen.getByRole('button', { name: 'Send sign-in link' }));
    await waitFor(() => expect(reloadApp).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('private chat shell')).not.toBeInTheDocument();
  });

  it('requests a desktop link and keeps the chat shell blocked while waiting', async () => {
    state.mockResolvedValue({ signedIn: false });
    requestLink.mockResolvedValue(undefined);
    poll.mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    renderGate();
    await user.type(await screen.findByLabelText('SHIP-OS email'), 'operator@example.com');
    await user.click(screen.getByRole('button', { name: 'Send sign-in link' }));
    await waitFor(() => expect(requestLink).toHaveBeenCalledWith('operator@example.com'));
    expect(await screen.findByText(/Check your inbox/)).toBeInTheDocument();
    expect(screen.queryByText('private chat shell')).not.toBeInTheDocument();
  });
});
