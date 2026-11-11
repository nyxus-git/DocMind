'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ApiClient,
  ApiError,
  CompanyPortalPublicDTO,
  UserProfileDTO,
  WorkspaceDetailDTO,
} from '../../lib/api';
import { establishSession, friendlyError } from '../../lib/auth-flow';
import { clearSession, loadSession, nameFromEmail, portalHomeForSession, saveSession, UserSession } from '../../lib/session';
import { Button, inputClass, Spinner } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { Logo } from '../ui/Logo';
import { ThemeToggle } from '../ui/ThemeToggle';
import { ToastProvider, useToast } from '../ui/Toast';
import { CompanyConsoleInner } from '../company/CompanyConsole';
import { EmployeePortalInner, PendingApprovalScreen } from '../employee/EmployeePortal';
import { Panel } from '../workspace/parts';

const RESERVED_SEGMENTS = new Set([
  'app',
  'admin',
  'auth',
  'company',
  'employee',
  'login',
  'signup',
  'org',
  'api',
]);

function readPortalSlugFromLocation(fallbackPathname?: string | null): { slug: string | null; emailParam: string } {
  if (typeof window === 'undefined') return { slug: null, emailParam: '' };
  const params = new URLSearchParams(window.location.search);
  const querySlug = (params.get('c') || params.get('org') || '').trim().toLowerCase();
  const emailParam = (params.get('email') || '').trim();
  if (querySlug && !RESERVED_SEGMENTS.has(querySlug)) {
    return { slug: querySlug, emailParam };
  }
  const pathname = window.location.pathname || fallbackPathname || '';
  const segs = pathname.split('/').filter(Boolean);
  const first = (segs[0] || '').trim().toLowerCase();
  if (first && !RESERVED_SEGMENTS.has(first)) {
    return { slug: first, emailParam };
  }
  return { slug: null, emailParam };
}

type PortalViewState =
  | { kind: 'loading' }
  | { kind: 'not_found'; slug: string }
  | { kind: 'error'; slug: string; message: string }
  | { kind: 'unauthenticated'; portal: CompanyPortalPublicDTO; prefillEmail: string }
  | { kind: 'console'; portal: CompanyPortalPublicDTO; session: UserSession }
  | { kind: 'employee'; portal: CompanyPortalPublicDTO; session: UserSession }
  | {
      kind: 'pending';
      portal: CompanyPortalPublicDTO;
      email: string;
      primaryWs: WorkspaceDetailDTO | null;
    }
  | {
      kind: 'no_access';
      portal: CompanyPortalPublicDTO;
      profile: UserProfileDTO;
      primaryWs: WorkspaceDetailDTO | null;
    };

function CompanyPortalAuthCard({
  portal,
  prefillEmail,
  onAuthenticated,
}: {
  portal: CompanyPortalPublicDTO;
  prefillEmail: string;
  onAuthenticated: () => void;
}) {
  const [mode, setMode] = useState<'signin' | 'join'>('signin');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState(prefillEmail);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [deptNote, setDeptNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifyEmailTo, setVerifyEmailTo] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const joinHint =
    portal.allowed_domains.length > 0
      ? `Corporate domain: @${portal.allowed_domains.join(', @')}`
      : portal.join_policy === 'DOMAIN_APPROVAL'
        ? 'Admin approval enabled for access requests'
        : 'Invite-only workspace for authorized members';

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);

    if (mode === 'join') {
      if (password.length < 8) {
        setError('Use at least 8 characters for your password.');
        return;
      }
      setSubmitting(true);
      try {
        await ApiClient.register(email, password, {
          account_type: 'employee',
          target_company_slug: portal.slug,
          department_note: deptNote.trim() || undefined,
        });
        try {
          await ApiClient.login(email, password);
          await establishSession(email, fullName.trim() || undefined, portal.slug);
          onAuthenticated();
        } catch {
          setSubmitting(false);
          setVerifyEmailTo(email);
        }
      } catch (err) {
        setSubmitting(false);
        setError(friendlyError(err, `Could not create your ${portal.company_name} account.`));
      }
      return;
    }

    setSubmitting(true);
    try {
      await ApiClient.login(email, password);
      await establishSession(email, undefined, portal.slug);
      onAuthenticated();
    } catch (err) {
      setSubmitting(false);
      setError(friendlyError(err, 'Could not sign in. Check your email and password.'));
    }
  };

  if (verifyEmailTo) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-bg px-4 text-fg">
        <Panel className="w-full max-w-md p-6 sm:p-8">
          <div className="mb-4 inline-flex size-11 items-center justify-center rounded-full bg-ok-soft text-ok">
            <Icon name="check" className="size-5" strokeWidth={2.2} />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Verify your email to enter {portal.company_name}</h1>
          <p className="mt-2 text-sm leading-6 text-muted">
            We sent a verification link to <strong className="text-fg">{verifyEmailTo}</strong>. Click the link in your inbox, then sign in here to access your {portal.company_name} portal.
          </p>
          <div className="mt-6 space-y-2.5">
            <Button
              className="w-full"
              onClick={() => {
                setVerifyEmailTo(null);
                setMode('signin');
              }}
            >
              Back to {portal.company_name} Sign In
            </Button>
            <Button
              variant="secondary"
              className="w-full"
              onClick={async () => {
                try {
                  await ApiClient.resendVerification(verifyEmailTo);
                  setNotice('Verification email re-sent.');
                } catch {
                  // fail silently
                }
              }}
            >
              Resend verification email
            </Button>
            {notice && <p className="text-center text-xs text-ok">{notice}</p>}
          </div>
        </Panel>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-bg text-fg">
      <header className="border-b border-line px-4 sm:px-6">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" aria-label="DocMind home">
              <Logo />
            </Link>
            <span className="h-4 w-px bg-line" />
            <span className="text-sm font-semibold">{portal.company_name}</span>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/signup/" className="hidden text-xs font-medium text-muted hover:text-fg sm:inline">
              Create your own company
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <Panel className="w-full max-w-md p-6 sm:p-8">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted">
            <Icon name="building" className="size-3.5" />
            <span>{portal.company_name} Knowledge Portal</span>
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            {mode === 'signin' ? `Sign in to ${portal.company_name}` : `Join ${portal.company_name}`}
          </h1>
          <p className="mt-1.5 text-sm text-muted">
            {mode === 'signin'
              ? 'Sign in as an Admin or Employee. Your dashboard opens automatically based on your role.'
              : 'Create your employee account to ask questions across approved company documents.'}
          </p>

          <div className="mt-4 flex items-center gap-2 rounded-lg border border-line bg-surface-2/60 px-3 py-2 text-xs text-muted">
            <Icon name="lock" className="size-3.5 shrink-0 text-fg" />
            <span>{joinHint}</span>
          </div>

          <div className="mt-5 grid grid-cols-2 rounded-xl border border-line bg-surface-2 p-1 text-xs font-medium">
            <button
              type="button"
              onClick={() => {
                setMode('signin');
                setError(null);
              }}
              className={`rounded-lg py-2 transition-colors ${mode === 'signin' ? 'bg-surface text-fg shadow-xs' : 'text-muted hover:text-fg'}`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('join');
                setError(null);
              }}
              className={`rounded-lg py-2 transition-colors ${mode === 'join' ? 'bg-surface text-fg shadow-xs' : 'text-muted hover:text-fg'}`}
            >
              Employee Sign Up
            </button>
          </div>

          <form onSubmit={onSubmit} className="mt-5 space-y-4">
            {error && (
              <div role="alert" className="flex items-start gap-2 rounded-lg bg-danger-soft px-3.5 py-2.5 text-sm text-danger">
                <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {mode === 'join' && portal.join_policy === 'INVITE_ONLY' && (
              <div className="rounded-lg border border-line bg-surface-2/70 px-3.5 py-2.5 text-xs text-muted">
                This portal is <strong className="text-fg">Invite Only</strong>. Complete this form if an Admin already sent an invite to your email address.
              </div>
            )}

            {mode === 'join' && (
              <div>
                <label htmlFor="portal-name" className="mb-1.5 block text-sm font-medium">Full name</label>
                <input
                  id="portal-name"
                  type="text"
                  required
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  className={inputClass}
                />
              </div>
            )}

            <div>
              <label htmlFor="portal-email" className="mb-1.5 block text-sm font-medium">Work email</label>
              <input
                id="portal-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder={portal.allowed_domains[0] ? `you@${portal.allowed_domains[0]}` : 'you@company.com'}
                className={inputClass}
              />
            </div>

            {mode === 'join' && (
              <div>
                <label htmlFor="portal-dept" className="mb-1.5 block text-sm font-medium">Department / Team (optional)</label>
                <input
                  id="portal-dept"
                  type="text"
                  value={deptNote}
                  onChange={e => setDeptNote(e.target.value)}
                  placeholder="e.g. Engineering, HR, Sales"
                  className={inputClass}
                />
              </div>
            )}

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label htmlFor="portal-pass" className="text-sm font-medium">Password</label>
                {mode === 'signin' && (
                  <Link href="/login/" className="text-xs text-muted underline underline-offset-2 hover:text-fg">
                    Forgot password?
                  </Link>
                )}
              </div>
              <div className="relative">
                <input
                  id="portal-pass"
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={mode === 'join' ? 8 : undefined}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className={`${inputClass} pr-16`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(s => !s)}
                  className="absolute inset-y-0 right-2 my-auto h-7 rounded px-2 text-xs font-medium text-muted hover:text-fg"
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            <Button type="submit" size="lg" className="w-full" disabled={submitting}>
              {submitting && <Spinner />}
              {mode === 'signin' ? `Sign in to ${portal.company_name}` : `Continue to ${portal.company_name}`}
            </Button>
          </form>
        </Panel>
      </main>
    </div>
  );
}

function CompanyPortalInner() {
  const pathname = usePathname();
  const toast = useToast();
  const [state, setState] = useState<PortalViewState>({ kind: 'loading' });
  const [deptNote, setDeptNote] = useState('');
  const [requesting, setRequesting] = useState(false);

  const bootstrap = useCallback(async () => {
    const { slug, emailParam } = readPortalSlugFromLocation(pathname);
    if (!slug) {
      const existing = loadSession();
      if (existing && ApiClient.getToken()) {
        window.location.replace(portalHomeForSession(existing));
      } else {
        window.location.replace('/login/');
      }
      return;
    }

    let portal: CompanyPortalPublicDTO | null = null;
    let portalFetchErr: unknown = null;
    try {
      portal = await ApiClient.getCompanyPortalBySlug(slug);
    } catch (err) {
      portalFetchErr = err;
    }

    const token = ApiClient.getToken();
    if (!token) {
      if (!portal) {
        if (portalFetchErr instanceof ApiError && portalFetchErr.status === 404) {
          setState({ kind: 'not_found', slug });
        } else {
          setState({
            kind: 'error',
            slug,
            message: portalFetchErr instanceof Error ? portalFetchErr.message : 'Unable to reach DocMind API server.',
          });
        }
        return;
      }
      if (typeof document !== 'undefined') {
        document.title = `${portal.company_name} Knowledge Portal · DocMind`;
      }
      setState({ kind: 'unauthenticated', portal, prefillEmail: emailParam });
      return;
    }

    try {
      const [workspaces, profile] = await Promise.all([
        ApiClient.listWorkspaces(),
        ApiClient.getMyProfile(),
      ]);
      const targetWs = workspaces.find(w => w.slug.toLowerCase() === slug.toLowerCase());
      const resolvedPortal: CompanyPortalPublicDTO | null =
        portal ??
        (targetWs
          ? {
              exists: true,
              company_name: targetWs.name,
              slug: targetWs.slug,
              join_policy: 'INVITE_ONLY',
              allowed_domains: [],
            }
          : null);

      if (!resolvedPortal) {
        if (portalFetchErr instanceof ApiError && portalFetchErr.status === 404) {
          setState({ kind: 'not_found', slug });
        } else {
          setState({
            kind: 'error',
            slug,
            message: portalFetchErr instanceof Error ? portalFetchErr.message : 'Unable to reach DocMind API server.',
          });
        }
        return;
      }

      if (typeof document !== 'undefined') {
        document.title = `${resolvedPortal.company_name} Knowledge Portal · DocMind`;
      }

      if (targetWs) {
        ApiClient.setActiveWorkspaceId(targetWs.id);
        const prev = loadSession();
        const fullName =
          (prev && prev.email === profile.email ? prev.fullName : '') || nameFromEmail(profile.email);
        const nextSession: UserSession = {
          email: profile.email,
          fullName,
          workspaceName: targetWs.name,
          workspaceSlug: targetWs.slug,
          workspaceId: targetWs.id,
          workspaceType: 'COMPANY',
          isCompany: true,
          role: targetWs.role as UserSession['role'],
          isSuperAdmin: Boolean(profile.is_superadmin),
          pendingJoinCompany: null,
        };
        saveSession(nextSession);

        const role = targetWs.role.toUpperCase();
        if (role === 'OWNER' || role === 'ADMIN' || role === 'MEMBER') {
          setState({ kind: 'console', portal: resolvedPortal, session: nextSession });
        } else {
          setState({ kind: 'employee', portal: resolvedPortal, session: nextSession });
        }
        return;
      }

      const primaryWs = workspaces[0] ?? null;
      const pendingSlug = profile.pending_join_request?.company_slug?.toLowerCase();
      if (pendingSlug === resolvedPortal.slug.toLowerCase()) {
        setState({
          kind: 'pending',
          portal: resolvedPortal,
          email: profile.email,
          primaryWs,
        });
        return;
      }

      setState({
        kind: 'no_access',
        portal: resolvedPortal,
        profile,
        primaryWs,
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearSession();
        await ApiClient.logout().catch(() => {});
        if (portal) {
          setState({ kind: 'unauthenticated', portal, prefillEmail: emailParam });
        } else {
          setState({ kind: 'not_found', slug });
        }
        return;
      }
      if (portal) {
        toast(err instanceof Error ? err.message : 'Could not load portal.', 'error');
        setState({ kind: 'unauthenticated', portal, prefillEmail: emailParam });
      } else {
        setState({
          kind: 'error',
          slug,
          message: err instanceof Error ? err.message : 'Unable to reach DocMind API server.',
        });
      }
    }
  }, [pathname, toast]);

  useEffect(() => {
    const t = setTimeout(() => {
      void bootstrap();
    }, 0);
    return () => clearTimeout(t);
  }, [bootstrap]);

  const handleSignOut = async () => {
    await ApiClient.logout();
    clearSession();
    void bootstrap();
  };

  if (state.kind === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg">
        <Spinner className="size-6 text-fg" />
      </div>
    );
  }

  if (state.kind === 'error') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-bg px-4 text-fg">
        <Panel className="w-full max-w-md p-6 text-center sm:p-8">
          <div className="mx-auto mb-4 inline-flex size-12 items-center justify-center rounded-full bg-warn-soft text-warn">
            <Icon name="alert" className="size-6" />
          </div>
          <h1 className="text-xl font-semibold">Cannot connect to server</h1>
          <p className="mt-2 text-sm text-muted">{state.message}</p>
          <div className="mt-6 flex flex-col gap-2">
            <Button onClick={() => void bootstrap()}>
              <Icon name="retry" /> Try again
            </Button>
            <Link
              href="/login/"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-line bg-surface px-4 text-sm font-medium hover:bg-surface-2"
            >
              Back to Sign in
            </Link>
          </div>
        </Panel>
      </div>
    );
  }

  if (state.kind === 'not_found') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-bg px-4 text-fg">
        <Panel className="w-full max-w-md p-6 text-center sm:p-8">
          <div className="mx-auto mb-4 inline-flex size-12 items-center justify-center rounded-full bg-surface-2 text-muted">
            <Icon name="building" className="size-6" />
          </div>
          <h1 className="text-xl font-semibold">Company Portal Not Found</h1>
          <p className="mt-2 text-sm text-muted">
            No company workspace exists at <code className="rounded bg-surface-2 px-1.5 py-0.5 text-xs">/{state.slug}/</code>. Check the link shared by your Company Admin.
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <Link
              href="/login/"
              className="inline-flex h-10 items-center justify-center rounded-xl bg-brand px-4 text-sm font-medium text-brand-fg hover:opacity-90"
            >
              Sign in to DocMind
            </Link>
            <Link
              href="/signup/"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-line bg-surface px-4 text-sm font-medium hover:bg-surface-2"
            >
              Register a Company
            </Link>
          </div>
        </Panel>
      </div>
    );
  }

  if (state.kind === 'unauthenticated') {
    return (
      <CompanyPortalAuthCard
        portal={state.portal}
        prefillEmail={state.prefillEmail}
        onAuthenticated={() => void bootstrap()}
      />
    );
  }

  if (state.kind === 'pending') {
    const altHref = state.primaryWs
      ? state.primaryWs.workspace_type === 'COMPANY'
        ? `/${state.primaryWs.slug}/`
        : '/app/'
      : undefined;
    return (
      <PendingApprovalScreen
        companyName={state.portal.company_name}
        email={state.email}
        onRefresh={() => void bootstrap()}
        onSignOut={() => void handleSignOut()}
        alternateHref={altHref}
        alternateLabel={state.primaryWs ? `Open ${state.primaryWs.name}` : undefined}
      />
    );
  }

  if (state.kind === 'no_access') {
    const altHref = state.primaryWs
      ? state.primaryWs.workspace_type === 'COMPANY'
        ? `/${state.primaryWs.slug}/`
        : '/app/'
      : '/';
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-bg px-4 text-fg">
        <Panel className="w-full max-w-md p-6 sm:p-8">
          <div className="mb-4 inline-flex size-11 items-center justify-center rounded-full bg-warn-soft text-warn">
            <Icon name="lock" className="size-5" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Restricted to {state.portal.company_name} Members</h1>
          <p className="mt-2 text-sm leading-6 text-muted">
            You are signed in as <strong className="text-fg">{state.profile.email}</strong>, which does not have permission to view{' '}
            <strong className="text-fg">{state.portal.company_name}</strong> documents.
          </p>

          {state.portal.join_policy !== 'INVITE_ONLY' && (
            <form
              onSubmit={async e => {
                e.preventDefault();
                setRequesting(true);
                try {
                  const res = await ApiClient.requestCompanyPortalAccess(state.portal.slug, deptNote.trim() || undefined);
                  toast(
                    res.status === 'JOINED'
                      ? `Joined ${res.company_name}!`
                      : `Access request sent to ${res.company_name} Admins.`,
                    'success',
                  );
                  await bootstrap();
                } catch (err) {
                  toast(err instanceof Error ? err.message : 'Could not request access.', 'error');
                } finally {
                  setRequesting(false);
                }
              }}
              className="mt-4 space-y-2.5 border-t border-line pt-4"
            >
              <input
                type="text"
                value={deptNote}
                onChange={e => setDeptNote(e.target.value)}
                placeholder="Department / Team note (optional)"
                className={inputClass}
              />
              <Button type="submit" className="w-full" disabled={requesting}>
                {requesting && <Spinner />}
                Request Employee Access to {state.portal.company_name}
              </Button>
            </form>
          )}

          <div className="mt-4 space-y-2 border-t border-line pt-4">
            {state.primaryWs && (
              <Link
                href={altHref}
                className="inline-flex h-10 w-full items-center justify-center rounded-xl border border-line bg-surface px-4 text-sm font-medium hover:bg-surface-2"
              >
                Go to {state.primaryWs.name}
              </Link>
            )}
            <Button variant="ghost" className="w-full" onClick={() => void handleSignOut()}>
              Sign out &amp; switch account
            </Button>
          </div>
        </Panel>
      </div>
    );
  }

  if (state.kind === 'console') {
    return (
      <CompanyConsoleInner
        session={state.session}
        portalSlug={state.portal.slug}
        onSignOut={() => void handleSignOut()}
      />
    );
  }

  return (
    <EmployeePortalInner
      session={state.session}
      portalSlug={state.portal.slug}
      onSignOut={() => void handleSignOut()}
    />
  );
}

export function CompanyPortalShell() {
  return (
    <ToastProvider>
      <CompanyPortalInner />
    </ToastProvider>
  );
}

