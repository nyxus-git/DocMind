'use client';

import React, { useSyncExternalStore } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Spinner } from '../ui/Button';
import { Logo } from '../ui/Logo';
import { Panel } from '../workspace/parts';
import { CompanyPortalShell } from './CompanyPortalShell';

const RESERVED_PATHS = new Set([
  'app',
  'admin',
  'auth',
  'company',
  'employee',
  'login',
  'signup',
  'org',
  'api',
  '404',
  '_not-found',
]);

const emptySubscribe = () => () => {};

export function NotFoundFallback() {
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);
  const nextPath = usePathname();
  const rawPath = mounted && typeof window !== 'undefined' ? window.location.pathname : nextPath;

  if (!mounted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg text-fg">
        <Spinner className="size-6 text-fg" />
      </div>
    );
  }

  const segs = (rawPath || '').split('/').filter(Boolean);
  const first = (segs[0] || '').toLowerCase();
  const isCompanySlugRoute =
    Boolean(first) &&
    !RESERVED_PATHS.has(first) &&
    /^[a-z0-9][a-z0-9-]*$/i.test(first) &&
    segs.length <= 2;

  if (isCompanySlugRoute) {
    return <CompanyPortalShell />;
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg px-4 text-fg">
      <Panel className="w-full max-w-md p-6 text-center sm:p-8">
        <div className="mb-4 flex justify-center">
          <Logo />
        </div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">404</p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">This page could not be found</h1>
        <p className="mt-2 text-sm text-muted">
          Check the link or sign in to open your company or personal workspace.
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Link
            href="/"
            className="inline-flex h-10 items-center justify-center rounded-xl border border-line bg-surface px-4 text-sm font-medium hover:bg-surface-2"
          >
            Go home
          </Link>
          <Link
            href="/login/"
            className="inline-flex h-10 items-center justify-center rounded-xl bg-brand px-4 text-sm font-medium text-brand-fg hover:opacity-90"
          >
            Sign in
          </Link>
        </div>
      </Panel>
    </div>
  );
}
