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

function companyMonogram(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length >= 2) {
    return `${words[0][0] || ''}${words[1][0] || ''}`.toUpperCase();
  }
  return (name.trim().slice(0, 2) || 'CO').toUpperCase();
}

function CompanyPortalAuthCard({
  portal,
  prefillEmail,
  onAuthenticated,
}: {
  portal: CompanyPortalPublicDTO;
  prefillEmail: string;
  onAuthenticated: () => void;
}) {
  const [view, setView] = useState<'signin' | 'forgot'>('signin');
  const [email, setEmail] = useState(prefillEmail);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const initials = companyMonogram(portal.company_name);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);

    if (view === 'forgot') {
      setSubmitting(true);
      try {
        await ApiClient.forgotPassword(email.trim());
      } catch {
        // Uniform response to avoid account enumeration
      } finally {
        setSubmitting(false);
      }
      setNotice('If your company email has an account, a password reset link is on its way (valid 60 minutes).');
      return;
    }

    setSubmitting(true);
    try {
      await ApiClient.login(email, password);
      await establishSession(email, undefined, portal.slug);
      onAuthenticated();
    } catch (err) {
      setSubmitting(false);
      setError(friendlyError(err, 'Could not sign in. Check your company email and password.'));
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col overflow-x-hidden bg-bg text-fg">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-gradient-to-b from-surface-2/80 via-surface-2/20 to-transparent"
      />

      <header className="relative border-b border-line bg-bg/90 px-4 backdrop-blur sm:px-6">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/" aria-label="DocMind home" className="shrink-0">
              <Logo />
            </Link>
            <span className="h-5 w-px bg-line" />
            <div className="flex min-w-0 items-center gap-2.5">
              {portal.logo_url ? (
                <div className="size-8 shrink-0 overflow-hidden rounded-lg border border-line bg-surface p-0.5 flex items-center justify-center shadow-xs">
                  <img src={portal.logo_url} alt={portal.company_name} className="size-full object-contain" />
                </div>
              ) : (
                <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand text-xs font-bold tracking-tight text-brand-fg shadow-xs">
                  {initials}
                </span>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold leading-tight text-fg">{portal.company_name}</p>
                <p className="truncate text-[11px] text-muted">/{portal.slug}/ • Enterprise Portal</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <Link
              href="/signup/"
              className="hidden rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-line-strong hover:text-fg sm:inline-flex"
            >
              Start a Company Workspace
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="relative flex flex-1 items-center justify-center px-4 py-10 sm:px-6 lg:py-14">
        <div className="grid w-full max-w-5xl items-center gap-8 lg:grid-cols-[1.08fr_0.92fr] lg:gap-12">
          {/* Branded Organization Overview */}
          <section className="space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-muted shadow-xs">
              <Icon name="shield" className="size-3.5 text-fg" />
              <span>Admin-Managed Organization Portal</span>
            </div>

            <div className="flex items-start gap-4">
              {portal.logo_url ? (
                <div className="size-16 shrink-0 overflow-hidden rounded-2xl border border-line bg-surface p-1.5 flex items-center justify-center shadow-md">
                  <img src={portal.logo_url} alt={portal.company_name} className="size-full object-contain" />
                </div>
              ) : (
                <div className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-xl font-bold tracking-tight text-white shadow-sm">
                  {initials}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted">Authorized Company Workspace</p>
                <h1 className="mt-1 text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
                  {portal.company_name}
                </h1>
                <p className="mt-2 max-w-lg text-[15px] leading-relaxed text-muted">
                  Private document intelligence and grounded AI Q&amp;A for <strong className="text-fg">{portal.company_name}</strong> staff and administrators.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1.5 font-mono text-fg">
                <Icon name="globe" className="size-3.5 text-muted" />
                /{portal.slug}/
              </span>
              {portal.allowed_domains.length > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-muted">
                  <Icon name="building" className="size-3.5 text-fg" />
                  Domain: <strong className="text-fg">@{portal.allowed_domains.join(', @')}</strong>
                </span>
              )}
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-muted">
                <Icon name="lock" className="size-3.5 text-fg" />
                Private Multi-Tenant Boundary
              </span>
            </div>

            <div className="grid gap-3 rounded-2xl border border-line bg-surface p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                How {portal.company_name} Access Works
              </p>
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                <div className="rounded-xl bg-surface-2/60 p-3.5">
                  <Icon name="mail" className="size-4 text-fg" />
                  <p className="mt-2 text-xs font-semibold text-fg">Admin-Issued Login</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted">
                    Use the work email &amp; password emailed to you by your Admin.
                  </p>
                </div>
                <div className="rounded-xl bg-surface-2/60 p-3.5">
                  <Icon name="sparkles" className="size-4 text-fg" />
                  <p className="mt-2 text-xs font-semibold text-fg">Role Auto-Routing</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted">
                    Admins open Console; employees open Document Q&amp;A automatically.
                  </p>
                </div>
                <div className="rounded-xl bg-surface-2/60 p-3.5">
                  <Icon name="shield" className="size-4 text-fg" />
                  <p className="mt-2 text-xs font-semibold text-fg">Zero Cross-Leakage</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted">
                    AI only retrieves from {portal.company_name}&apos;s indexed files.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Focused Sign-In Card */}
          <Panel className="relative overflow-hidden p-6 shadow-md sm:p-8 border-line/80 backdrop-blur-sm">
            <div className="flex items-center justify-between gap-3 border-b border-line pb-4">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                  {view === 'signin' ? `${portal.company_name} Member Sign In` : 'Reset Password'}
                </p>
                <h2 className="mt-0.5 truncate text-xl font-semibold tracking-tight text-fg">
                  {view === 'signin' ? `Welcome to ${portal.company_name}` : 'Send a reset link'}
                </h2>
              </div>
              {portal.logo_url ? (
                <div className="size-10 shrink-0 overflow-hidden rounded-xl border border-line bg-surface p-1 flex items-center justify-center shadow-xs">
                  <img src={portal.logo_url} alt={portal.company_name} className="size-full object-contain" />
                </div>
              ) : (
                <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-sm font-bold text-fg">
                  {initials}
                </span>
              )}
            </div>

            {error && (
              <div role="alert" className="mt-4 flex items-start gap-2 rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger">
                <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {notice && (
              <div role="status" className="mt-4 flex items-start gap-2 rounded-xl bg-ok-soft px-3.5 py-2.5 text-sm text-ok">
                <Icon name="check" className="mt-0.5 size-4 shrink-0" />
                <span>{notice}</span>
              </div>
            )}

            <form onSubmit={onSubmit} className="mt-5 space-y-4">
              <div>
                <label htmlFor="portal-email" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">
                  Company Email ID
                </label>
                <div className="relative">
                  <Icon name="mail" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
                  <input
                    id="portal-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder={portal.allowed_domains[0] ? `name@${portal.allowed_domains[0]}` : 'employee@company.com'}
                    className={`${inputClass} pl-9`}
                  />
                </div>
              </div>

              {view === 'signin' && (
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <label htmlFor="portal-pass" className="text-xs font-semibold uppercase tracking-wide text-muted">
                      Password
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setView('forgot');
                        setError(null);
                        setNotice(null);
                      }}
                      className="text-xs font-medium text-muted underline underline-offset-2 hover:text-fg"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <Icon name="lock" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
                    <input
                      id="portal-pass"
                      type={showPassword ? 'text' : 'password'}
                      required
                      autoComplete="current-password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      className={`${inputClass} pl-9 pr-11`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(s => !s)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute inset-y-0 right-1.5 my-auto inline-flex size-8 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg"
                    >
                      <Icon name={showPassword ? 'eyeOff' : 'eye'} className="size-4" />
                    </button>
                  </div>
                </div>
              )}

              <Button type="submit" size="lg" className="w-full" disabled={submitting}>
                {submitting && <Spinner />}
                {view === 'signin' ? (
                  <>
                    <span>Sign in to {portal.company_name}</span>
                    <Icon name="arrowRight" className="size-4" />
                  </>
                ) : (
                  <span>Send Reset Link</span>
                )}
              </Button>

              {view === 'forgot' && (
                <button
                  type="button"
                  onClick={() => {
                    setView('signin');
                    setError(null);
                    setNotice(null);
                  }}
                  className="w-full text-center text-xs font-medium text-muted underline underline-offset-2 hover:text-fg"
                >
                  Back to {portal.company_name} Sign In
                </button>
              )}
            </form>

            <div className="mt-6 rounded-xl border border-line bg-surface-2/60 p-3.5 text-xs text-muted">
              <div className="flex items-start gap-2.5">
                <Icon name="userCheck" className="mt-0.5 size-4 shrink-0 text-fg" />
                <div className="leading-relaxed">
                  <p className="font-semibold text-fg">Don&apos;t have login credentials?</p>
                  <p className="mt-0.5">
                    Account creation is disabled on company portals. Ask your <strong className="text-fg">{portal.company_name}</strong> Administrator to add your work email and send your login password.
                  </p>
                </div>
              </div>
            </div>
          </Panel>
        </div>
      </main>
    </div>
  );
}

function CompanyPortalInner() {
  const pathname = usePathname();
  const toast = useToast();
  const [state, setState] = useState<PortalViewState>({ kind: 'loading' });

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
    const currentPortal = 'portal' in state && state.portal ? state.portal : null;
    clearSession();
    await ApiClient.logout().catch(() => {});
    if (currentPortal) {
      setState({ kind: 'unauthenticated', portal: currentPortal, prefillEmail: '' });
    } else {
      void bootstrap();
    }
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
            You are signed in as <strong className="text-fg">{state.profile.email}</strong>, which has not been provisioned for{' '}
            <strong className="text-fg">{state.portal.company_name}</strong>.
          </p>
          <p className="mt-2 rounded-xl border border-line bg-surface-2/60 p-3 text-xs leading-relaxed text-muted">
            Self-signup and access requests are disabled on company portals. Ask a <strong className="text-fg">{state.portal.company_name}</strong> Admin to add your email and send your portal credentials.
          </p>

          <div className="mt-5 space-y-2">
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

