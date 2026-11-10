'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ApiClient } from '../../lib/api';
import { establishSession, friendlyError, slugify } from '../../lib/auth-flow';
import { loadSession, saveSession, savePendingWorkspace } from '../../lib/session';
import { Button, inputClass, Spinner } from '../ui/Button';
import { Icon } from '../ui/Icon';

type Mode = 'signin' | 'signup' | 'forgot';

function Field({
  label,
  hint,
  children,
  action,
  htmlFor,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  htmlFor: string;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label htmlFor={htmlFor} className="text-sm font-medium text-fg">
          {label}
        </label>
        {action}
      </div>
      {children}
      {hint && <p className="mt-1.5 text-[13px] text-faint">{hint}</p>}
    </div>
  );
}

export function AuthForm({ initialMode }: { initialMode: Mode }) {
  const router = useRouter();
  const params = useSearchParams();
  const demoRequested = params.get('demo') === '1';

  const [mode, setMode] = useState<Mode>(initialMode);
  const [accountType, setAccountType] = useState<'personal' | 'company'>('personal');
  const [fullName, setFullName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [verifyEmailSentTo, setVerifyEmailSentTo] = useState<string | null>(null);
  const demoStarted = useRef(false);

  // Server configuration state for production resiliency
  const [showServerConfig, setShowServerConfig] = useState(false);
  const [customApiUrl, setCustomApiUrl] = useState('');
  const [currentApiUrl, setCurrentApiUrl] = useState('');
  const [testingConnection, setTestingConnection] = useState(false);
  const [testFeedback, setTestFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    const id = setTimeout(() => {
      const base = ApiClient.getBaseUrl();
      setCurrentApiUrl(base);
      setCustomApiUrl(base.replace(/\/api\/v1\/?$/, ''));
    }, 0);
    return () => clearTimeout(id);
  }, []);

  const saveAndTestServerUrl = async () => {
    if (!customApiUrl.trim()) return;
    setTestingConnection(true);
    setTestFeedback(null);
    const testResult = await ApiClient.testConnection(customApiUrl);
    setTestingConnection(false);
    if (testResult.ok) {
      ApiClient.setBaseUrl(customApiUrl);
      const newUrl = ApiClient.getBaseUrl();
      setCurrentApiUrl(newUrl);
      setTestFeedback({ ok: true, message: `Connected to ${newUrl}!` });
      setError(null);
    } else {
      setTestFeedback({
        ok: false,
        message: testResult.error ? `Could not reach ${customApiUrl}: ${testResult.error}` : `Could not reach ${customApiUrl}.`,
      });
    }
  };

  // Already signed in? Go straight to the workspace (unless a demo was requested).
  useEffect(() => {
    if (!demoRequested && loadSession() && ApiClient.getToken()) {
      router.replace('/app/');
    }
  }, [router, demoRequested]);

  const startDemo = async () => {
    setError(null);
    setDemoLoading(true);
    try {
      await ApiClient.logout();
      const token = await ApiClient.ensureSession();
      if (!token) throw new Error('The demo workspace is not available right now. Please try again in a moment.');
      const session = await establishSession('demo@docmind.app', 'Demo user');
      saveSession({ ...session, email: 'Demo workspace', fullName: 'Demo user' });
      router.push('/app/');
    } catch (err) {
      setDemoLoading(false);
      setError(friendlyError(err, 'Could not open the demo workspace.'));
    }
  };

  useEffect(() => {
    if (demoRequested && !demoStarted.current) {
      demoStarted.current = true;
      void startDemo();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoRequested]);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setNotice(null);
    setVerifyEmailSentTo(null);
    // keep the URL in step so the back button and shared links behave
    router.replace(next === 'signup' ? '/signup/' : '/login/');
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);

    if (mode === 'forgot') {
      setLoading(true);
      try {
        await ApiClient.forgotPassword(email);
      } catch {
        // The API answers the same way whether or not the address exists.
      }
      setLoading(false);
      setNotice('If an account exists for that address, a reset link is on its way. It works once and expires in 60 minutes.');
      return;
    }

    if (mode === 'signup') {
      if (password.length < 8) return setError('Use at least 8 characters for your password.');
      if (accountType === 'company' && !companyName.trim()) return setError('Enter your company name.');
      setLoading(true);
      try {
        await ApiClient.register(email, password);
        if (accountType === 'company') {
          savePendingWorkspace({ name: companyName.trim(), slug: slug || slugify(companyName) || 'company' });
        }
        try {
          await ApiClient.login(email, password);
          await establishSession(email, fullName.trim());
          router.push('/app/');
        } catch {
          // Sign-in is usually blocked until the email is verified.
          setLoading(false);
          setVerifyEmailSentTo(email);
        }
      } catch (err) {
        setLoading(false);
        setError(friendlyError(err, 'Could not create your account.'));
      }
      return;
    }

    // Sign in
    setLoading(true);
    try {
      await ApiClient.login(email, password);
      await establishSession(email);
      router.push('/app/');
    } catch (err) {
      setLoading(false);
      setError(friendlyError(err, 'Could not sign in. Check your email and password.'));
    }
  };

  /* ---------- Verification pending ---------- */
  if (verifyEmailSentTo) {
    return (
      <div className="anim-rise">
        <div className="mb-5 inline-flex size-11 items-center justify-center rounded-full bg-ok-soft text-ok">
          <Icon name="check" className="size-5" strokeWidth={2.2} />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Check your inbox</h1>
        <p className="mt-2 text-[15px] leading-7 text-muted">
          We sent a verification link to <span className="font-medium text-fg">{verifyEmailSentTo}</span>. It expires in
          24 hours. Once you have verified, sign in to open your workspace.
        </p>
        <Button className="mt-6 w-full" size="lg" onClick={() => switchMode('signin')}>
          Go to sign in
        </Button>
      </div>
    );
  }

  /* ---------- Demo in progress ---------- */
  if (demoRequested && (demoLoading || (!error && !loading))) {
    return (
      <div className="anim-rise text-center">
        <Spinner className="mx-auto size-6 text-fg" />
        <p className="mt-4 text-sm text-muted">Opening the demo workspace&hellip;</p>
      </div>
    );
  }

  const title = mode === 'signin' ? 'Sign in to DocMind' : mode === 'signup' ? 'Create your workspace' : 'Reset your password';
  const subtitle =
    mode === 'signin'
      ? 'Welcome back. Pick up where you left off.'
      : mode === 'signup'
        ? 'Free plan: 20 documents and 100 questions a month. No card needed.'
        : 'Enter your email and we will send a link that works once.';

  return (
    <div className="anim-rise">
      <h1 className="text-[1.75rem] font-semibold leading-tight tracking-[-0.02em]">{title}</h1>
      <p className="mt-2 text-[15px] leading-6 text-muted">{subtitle}</p>

      <form onSubmit={onSubmit} className="mt-7 space-y-4" noValidate={false}>
        {error && (
          <div role="alert" className="rounded-lg bg-danger-soft px-3.5 py-3 text-sm text-danger space-y-2">
            <div className="flex items-start gap-2.5">
              <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
              <div className="flex-1">
                <span>{error}</span>
                {error.includes('Cannot reach the DocMind server') && (
                  <div className="mt-1">
                    <button
                      type="button"
                      onClick={() => setShowServerConfig(prev => !prev)}
                      className="text-xs font-semibold underline hover:opacity-80"
                    >
                      {showServerConfig ? 'Hide server settings' : 'Configure API server URL →'}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {error.includes('Cannot reach the DocMind server') && showServerConfig && (
              <div className="rounded-md border border-danger/30 bg-bg p-3 text-fg space-y-2.5 mt-2">
                <div className="text-xs text-muted">
                  Current API Target: <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-[11px] text-fg border border-line-strong">{currentApiUrl}</code>
                </div>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={customApiUrl}
                    onChange={e => setCustomApiUrl(e.target.value)}
                    placeholder="https://api.yourdomain.com"
                    className="h-8 flex-1 rounded border border-border bg-surface px-2.5 font-mono text-xs text-fg focus:outline-none focus:ring-1 focus:ring-brand"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={saveAndTestServerUrl}
                    disabled={testingConnection}
                  >
                    {testingConnection ? 'Testing…' : 'Save & Connect'}
                  </Button>
                </div>
                {testFeedback && (
                  <p className={`text-xs ${testFeedback.ok ? 'text-ok font-medium' : 'text-danger'}`}>
                    {testFeedback.message}
                  </p>
                )}
                <p className="text-[11px] text-faint">
                  Note: In production hosting (e.g. Vercel or Cloudflare), configure the <code>NEXT_PUBLIC_API_BASE_URL</code> environment variable in your dashboard to permanently configure this for all users.
                </p>
              </div>
            )}
          </div>
        )}
        {notice && (
          <div role="status" className="flex items-start gap-2.5 rounded-lg bg-ok-soft px-3.5 py-3 text-sm text-ok">
            <Icon name="check" className="mt-0.5 size-4" strokeWidth={2.2} />
            <span>{notice}</span>
          </div>
        )}

        {mode === 'signup' && (
          <>
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium">What will you use DocMind for?</legend>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { id: 'personal', label: 'Just me', icon: 'user', desc: 'A private workspace' },
                    { id: 'company', label: 'My company', icon: 'building', desc: 'A team workspace' },
                  ] as const
                ).map(opt => (
                  <label
                    key={opt.id}
                    className={`cursor-pointer rounded-xl border p-3 transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-fg ${
                      accountType === opt.id ? 'border-fg bg-surface ring-1 ring-fg' : 'border-line-strong bg-surface hover:bg-surface-2'
                    }`}
                  >
                    <input
                      type="radio"
                      name="account-type"
                      value={opt.id}
                      checked={accountType === opt.id}
                      onChange={() => setAccountType(opt.id)}
                      className="sr-only"
                    />
                    <Icon name={opt.icon} className="size-[18px] text-muted" />
                    <span className="mt-1.5 block text-sm font-semibold">{opt.label}</span>
                    <span className="block text-[13px] text-muted">{opt.desc}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <Field label="Full name" htmlFor="fullName">
              <input
                id="fullName"
                type="text"
                required
                autoComplete="name"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                className={inputClass}
              />
            </Field>

            {accountType === 'company' && (
              <>
                <Field label="Company name" htmlFor="company">
                  <input
                    id="company"
                    type="text"
                    required
                    autoComplete="organization"
                    value={companyName}
                    onChange={e => {
                      setCompanyName(e.target.value);
                      if (!slugTouched) setSlug(slugify(e.target.value));
                    }}
                    className={inputClass}
                  />
                </Field>
                <Field label="Workspace address" htmlFor="slug" hint="Lowercase letters, numbers and hyphens.">
                  <div className="flex h-10 items-center rounded-lg border border-line-strong bg-surface px-3 text-sm focus-within:border-fg focus-within:ring-2 focus-within:ring-fg/15">
                    <span className="text-faint">docmind/</span>
                    <input
                      id="slug"
                      type="text"
                      value={slug}
                      onChange={e => {
                        setSlugTouched(true);
                        setSlug(slugify(e.target.value));
                      }}
                      className="ml-0.5 w-full bg-transparent outline-none"
                    />
                  </div>
                </Field>
              </>
            )}
          </>
        )}

        <Field label={accountType === 'company' && mode === 'signup' ? 'Work email' : 'Email'} htmlFor="email">
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder={mode === 'signup' && accountType === 'company' ? 'you@company.com' : 'you@example.com'}
            className={inputClass}
          />
        </Field>

        {mode !== 'forgot' && (
          <Field
            label="Password"
            htmlFor="password"
            hint={mode === 'signup' ? 'At least 8 characters.' : undefined}
            action={
              mode === 'signin' ? (
                <button
                  type="button"
                  onClick={() => switchMode('forgot')}
                  className="text-[13px] font-medium text-muted underline-offset-2 hover:text-fg hover:underline"
                >
                  Forgot password?
                </button>
              ) : undefined
            }
          >
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                required
                minLength={mode === 'signup' ? 8 : undefined}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                className={`${inputClass} pr-16`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(s => !s)}
                aria-pressed={showPassword}
                className="absolute inset-y-0 right-2 my-auto h-7 rounded px-2 text-[13px] font-medium text-muted hover:text-fg"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </Field>
        )}

        <Button type="submit" size="lg" className="w-full" disabled={loading}>
          {loading && <Spinner />}
          {mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'}
        </Button>
      </form>

      <div className="mt-6 text-center text-sm text-muted">
        {mode === 'signin' && (
          <>
            New to DocMind?{' '}
            <button type="button" onClick={() => switchMode('signup')} className="font-medium text-fg underline underline-offset-2">
              Create an account
            </button>
          </>
        )}
        {mode === 'signup' && (
          <>
            Already have an account?{' '}
            <button type="button" onClick={() => switchMode('signin')} className="font-medium text-fg underline underline-offset-2">
              Sign in
            </button>
          </>
        )}
        {mode === 'forgot' && (
          <button type="button" onClick={() => switchMode('signin')} className="font-medium text-fg underline underline-offset-2">
            Back to sign in
          </button>
        )}
      </div>

      {mode !== 'forgot' && (
        <div className="mt-8 border-t border-line pt-6">
          <p className="text-sm text-muted">Want to look around first?</p>
          <Button variant="secondary" className="mt-3 w-full" onClick={startDemo} disabled={demoLoading || loading}>
            {demoLoading && <Spinner />}
            Open the demo workspace
          </Button>
        </div>
      )}
    </div>
  );
}
