import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Mail, Send } from 'lucide-react';
import { defineMessages, useIntl } from 'react-intl';

const messages = defineMessages({
  eyebrow: { id: 'shipos.firstRunEyebrow', defaultMessage: 'SHIP-OS Agent' },
  title: { id: 'shipos.firstRunTitle', defaultMessage: 'Sign in to SHIP-OS' },
  description: {
    id: 'shipos.firstRunDescription',
    defaultMessage: 'Connect your SHIP-OS account before configuring your AI provider or starting a conversation.',
  },
  emailLabel: { id: 'shipos.emailLabel', defaultMessage: 'SHIP-OS email' },
  emailPlaceholder: { id: 'shipos.emailPlaceholder', defaultMessage: 'you@example.com' },
  sendLink: { id: 'shipos.sendLink', defaultMessage: 'Send sign-in link' },
  checkEmail: {
    id: 'shipos.checkEmail',
    defaultMessage: 'Check your inbox — click the SHIP-OS sign-in link to continue.',
  },
  waiting: { id: 'shipos.waiting', defaultMessage: 'Waiting for you to click the link…' },
  error: { id: 'shipos.signInError', defaultMessage: 'Sign-in failed: {message}' },
  privacy: {
    id: 'shipos.firstRunPrivacy',
    defaultMessage: 'SHIP-OS Agent keeps its conversations, settings, provider keys, extensions, and sessions completely separate from Goose.',
  },
});

type Phase = 'checking' | 'email' | 'waiting';

export default function ShiposFirstRunGate({ children }: { children: React.ReactNode }) {
  const intl = useIntl();
  const [phase, setPhase] = useState<Phase>('checking');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    let active = true;
    void window.shiposAuth
      .state()
      .then((state) => {
        if (!active) return;
        setSignedIn(state.signedIn);
        setPhase(state.signedIn ? 'checking' : 'email');
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : String(err));
        setPhase('email');
      });
    return () => {
      active = false;
    };
  }, []);

  const requestLink = useCallback(async () => {
    setError(null);
    try {
      await window.shiposAuth.requestLink(email);
      setPhase('waiting');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [email]);

  useEffect(() => {
    if (phase !== 'waiting') return;
    let active = true;
    const poll = async () => {
      try {
        const state = await window.shiposAuth.poll();
        if (active && state.signedIn) setSignedIn(true);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : String(err));
        setPhase('email');
      }
    };
    void poll();
    return () => {
      active = false;
    };
  }, [phase]);

  if (signedIn) return <>{children}</>;

  return (
    <main className="h-screen w-screen overflow-hidden bg-background-secondary text-text-primary">
      <div className="titlebar-drag-region" />
      <div className="flex h-full items-center justify-center px-6 pb-12 pt-8">
        <section className="w-full max-w-md rounded-xl border border-border-primary bg-background-primary p-6 shadow-lg">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-info">
            {intl.formatMessage(messages.eyebrow)}
          </p>
          <h1 className="text-heading-lg font-semibold">{intl.formatMessage(messages.title)}</h1>
          <p className="mt-2 text-sm text-text-secondary">{intl.formatMessage(messages.description)}</p>

          {error && (
            <div role="alert" className="mt-4 rounded-lg border border-border-danger bg-background-danger/10 px-3 py-2 text-sm text-text-danger">
              {intl.formatMessage(messages.error, { message: error })}
            </div>
          )}

          {phase === 'checking' && (
            <div className="mt-6 flex items-center gap-3 text-sm text-text-secondary">
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
              {intl.formatMessage(messages.waiting)}
            </div>
          )}

          {phase === 'waiting' && (
            <div className="mt-6 rounded-lg border border-border-primary bg-background-secondary p-4">
              <div className="flex items-start gap-3">
                <Loader2 className="mt-0.5 h-5 w-5 animate-spin text-text-info" aria-hidden />
                <div>
                  <p className="text-sm font-medium">{intl.formatMessage(messages.checkEmail)}</p>
                  <p className="mt-1 text-xs text-text-secondary">{intl.formatMessage(messages.waiting)}</p>
                </div>
              </div>
            </div>
          )}

          {phase === 'email' && (
            <form className="mt-6" onSubmit={(event) => { event.preventDefault(); void requestLink(); }}>
              <label htmlFor="first-run-email" className="mb-1 block text-sm font-medium">
                {intl.formatMessage(messages.emailLabel)}
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" aria-hidden />
                <input
                  id="first-run-email"
                  type="email"
                  required
                  autoFocus
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder={intl.formatMessage(messages.emailPlaceholder)}
                  className="w-full rounded-md border border-border-primary bg-background-primary py-2.5 pl-9 pr-3 text-sm placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-ring-info"
                />
              </div>
              <button
                type="submit"
                disabled={!email.trim()}
                className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-background-info px-4 py-2 text-sm font-medium text-text-inverse hover:opacity-90 disabled:opacity-40"
              >
                <Send className="h-4 w-4" aria-hidden />
                {intl.formatMessage(messages.sendLink)}
              </button>
            </form>
          )}

          <p className="mt-5 border-t border-border-secondary pt-4 text-xs leading-relaxed text-text-tertiary">
            {intl.formatMessage(messages.privacy)}
          </p>
        </section>
      </div>
    </main>
  );
}
