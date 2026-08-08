/**
 * SHIP-OS sign-in / status view.
 *
 * Drives the desktop-link flow via the main-process bridge (window.shiposAuth):
 * request-link -> poll -> session cookie persisted in the keychain + the
 * SHIP-OS MCP server registered in the goose config. LLM provider keys are
 * BYOK, configured separately in Settings -> Providers (goose's own UI).
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { CheckCircle2, Loader2, LogOut, Mail, Send } from 'lucide-react';
import { defineMessages, useIntl } from 'react-intl';

const messages = defineMessages({
  title: { id: 'shipos.title', defaultMessage: 'SHIP-OS' },
  subtitle: {
    id: 'shipos.subtitle',
    defaultMessage: 'Connect SHIP-OS to the agent. The session is stored in your keychain.',
  },
  signedInAs: { id: 'shipos.signedInAs', defaultMessage: 'Signed in as {email}' },
  emailLabel: { id: 'shipos.emailLabel', defaultMessage: 'SHIP-OS email' },
  emailPlaceholder: { id: 'shipos.emailPlaceholder', defaultMessage: 'you@example.com' },
  sendLink: { id: 'shipos.sendLink', defaultMessage: 'Send sign-in link' },
  checkEmail: {
    id: 'shipos.checkEmail',
    defaultMessage: 'Check your inbox — click the SHIP-OS sign-in link to continue.',
  },
  waiting: { id: 'shipos.waiting', defaultMessage: 'Waiting for you to click the link…' },
  signOut: { id: 'shipos.signOut', defaultMessage: 'Sign out' },
  signInError: { id: 'shipos.signInError', defaultMessage: 'Sign-in failed: {message}' },
  byokNote: {
    id: 'shipos.byokNote',
    defaultMessage: 'LLM provider keys are yours (BYOK) — set them in Settings → Providers.',
  },
  baseUrl: { id: 'shipos.baseUrl', defaultMessage: 'Backend: {baseUrl}' },
  back: { id: 'shipos.back', defaultMessage: 'Back to chat' },
});

type Phase = 'idle' | 'link-sent' | 'signed-in';

export default function ShiposView(): React.JSX.Element {
  const intl = useIntl();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>('idle');
  const [email, setEmail] = useState('');
  const [signedInEmail, setSignedInEmail] = useState<string | null>(null);
  const [baseUrl, setBaseUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshState = useCallback(async () => {
    try {
      const state = await window.shiposAuth.state();
      if (state.signedIn) {
        setPhase('signed-in');
        setSignedInEmail(state.email ?? null);
        setBaseUrl(state.baseUrl ?? null);
      }
    } catch {
      // Not signed in; stay on the current phase.
    }
  }, []);

  useEffect(() => {
    void refreshState();
  }, [refreshState]);

  const sendLink = useCallback(async () => {
    setError(null);
    try {
      await window.shiposAuth.requestLink(email);
      setPhase('link-sent');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [email]);

  // Poll while waiting for the emailed link to be clicked.
  useEffect(() => {
    if (phase !== 'link-sent') {
      return;
    }
    let cancelled = false;
    const timer = window.setInterval(async () => {
      try {
        const state = await window.shiposAuth.poll();
        if (cancelled) {
          return;
        }
        if (state.signedIn) {
          setPhase('signed-in');
          setSignedInEmail(state.email ?? null);
          setBaseUrl(state.baseUrl ?? null);
          window.clearInterval(timer);
        }
      } catch (err) {
        if (cancelled) {
          return;
        }
        setError(err instanceof Error ? err.message : String(err));
        setPhase('idle');
        window.clearInterval(timer);
      }
    }, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [phase]);

  const signOut = useCallback(async () => {
    setError(null);
    const state = await window.shiposAuth.signOut();
    if (!state.signedIn) {
      setPhase('idle');
      setSignedInEmail(null);
    }
  }, []);

  return (
    <div className="h-full w-full overflow-y-auto bg-background-secondary">
      <div className="mx-auto max-w-xl px-8 py-10">
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-heading-lg font-semibold text-text-primary">{intl.formatMessage(messages.title)}</h1>
          {phase === 'signed-in' && <CheckCircle2 className="w-5 h-5 text-text-success" aria-hidden />}
        </div>
        <p className="text-sm text-text-secondary mb-6">{intl.formatMessage(messages.subtitle)}</p>

        {error && (
          <div role="alert" className="mb-4 rounded-lg border border-border-danger bg-background-danger/10 px-3 py-2 text-sm text-text-danger">
            {intl.formatMessage(messages.signInError, { message: error })}
          </div>
        )}

        {phase === 'signed-in' && signedInEmail ? (
          <div className="rounded-lg border border-border-primary bg-background-primary p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-text-primary">
                  {intl.formatMessage(messages.signedInAs, { email: signedInEmail })}
                </p>
                {baseUrl && (
                  <p className="mt-1 text-xs text-text-tertiary">{intl.formatMessage(messages.baseUrl, { baseUrl })}</p>
                )}
                <p className="mt-2 text-xs text-text-secondary">{intl.formatMessage(messages.byokNote)}</p>
              </div>
              <button
                type="button"
                onClick={() => void signOut()}
                className="inline-flex flex-shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-text-primary hover:bg-background-tertiary"
              >
                <LogOut className="w-4 h-4" aria-hidden />
                {intl.formatMessage(messages.signOut)}
              </button>
            </div>
          </div>
        ) : phase === 'link-sent' ? (
          <div className="rounded-lg border border-border-primary bg-background-primary p-4">
            <div className="flex items-center gap-3">
              <Loader2 className="w-5 h-5 animate-spin text-text-info" aria-hidden />
              <div>
                <p className="text-sm font-medium text-text-primary">{intl.formatMessage(messages.checkEmail)}</p>
                <p className="mt-1 text-xs text-text-secondary">{intl.formatMessage(messages.waiting)}</p>
              </div>
            </div>
          </div>
        ) : (
          <form
            className="rounded-lg border border-border-primary bg-background-primary p-4"
            onSubmit={(event) => {
              event.preventDefault();
              void sendLink();
            }}
          >
            <label htmlFor="shipos-email" className="block text-sm font-medium text-text-primary mb-1">
              {intl.formatMessage(messages.emailLabel)}
            </label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Mail className="absolute left-3 top-1/2 w-4 h-4 -translate-y-1/2 text-text-tertiary" aria-hidden />
                <input
                  id="shipos-email"
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder={intl.formatMessage(messages.emailPlaceholder)}
                  className="w-full rounded-md border border-border-primary bg-background-primary py-2 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-ring-info"
                />
              </div>
              <button
                type="submit"
                disabled={!email.trim()}
                className="inline-flex items-center gap-2 rounded-md bg-background-info px-3 py-2 text-sm font-medium text-text-inverse hover:opacity-90 disabled:opacity-40"
              >
                <Send className="w-4 h-4" aria-hidden />
                {intl.formatMessage(messages.sendLink)}
              </button>
            </div>
          </form>
        )}

        <button
          type="button"
          onClick={() => navigate('/')}
          className="mt-6 text-sm text-text-secondary hover:text-text-primary"
        >
          ← {intl.formatMessage(messages.back)}
        </button>
      </div>
    </div>
  );
}
