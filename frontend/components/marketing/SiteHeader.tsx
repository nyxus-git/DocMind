'use client';

import React, { useEffect, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { Logo } from '../ui/Logo';
import { LinkButton } from '../ui/Button';
import { ThemeToggle } from '../ui/ThemeToggle';
import { Icon } from '../ui/Icon';
import { portalHomeForSession, readRawSession, UserSession } from '../../lib/session';

const subscribeStorage = (cb: () => void) => {
  window.addEventListener('storage', cb);
  return () => window.removeEventListener('storage', cb);
};

const NAV = [
  { href: '#how-it-works', label: 'How it works' },
  { href: '#features', label: 'Features' },
  { href: '#security', label: 'Security' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#faq', label: 'FAQ' },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const rawSession = useSyncExternalStore(subscribeStorage, readRawSession, () => '');
  let parsedSession: UserSession | null = null;
  if (rawSession) {
    try {
      parsedSession = JSON.parse(rawSession) as UserSession;
    } catch {
      parsedSession = null;
    }
  }
  const signedIn = !!parsedSession;
  const isSuperAdmin = Boolean(parsedSession?.isSuperAdmin);
  const homeHref = parsedSession ? portalHomeForSession(parsedSession) : '/app/';
  const homeLabel = isSuperAdmin
    ? 'Admin Console'
    : parsedSession?.isCompany
      ? `Open ${parsedSession.workspaceName}`
      : 'Open workspace';
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-40 transition-colors ${
        scrolled || open ? 'border-b border-line bg-bg/90 backdrop-blur' : 'border-b border-transparent'
      }`}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
        <Link href="/" aria-label="DocMind home">
          <Logo />
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {NAV.map(item => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-fg"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <ThemeToggle />
          {signedIn ? (
            <LinkButton href={homeHref} size="sm">
              {homeLabel}
            </LinkButton>
          ) : (
            <>
              <LinkButton href="/login" variant="ghost" size="sm">
                Sign in
              </LinkButton>
              <LinkButton href="/signup" size="sm">
                Start free
              </LinkButton>
            </>
          )}
        </div>

        <div className="flex items-center gap-1 md:hidden">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? 'Close menu' : 'Open menu'}
            className="inline-flex size-9 items-center justify-center rounded-lg text-fg hover:bg-surface-2"
          >
            <Icon name={open ? 'x' : 'menu'} className="size-5" />
          </button>
        </div>
      </div>

      {open && (
        <div id="mobile-nav" className="border-t border-line bg-bg px-5 pb-5 pt-3 md:hidden">
          <nav aria-label="Mobile" className="flex flex-col">
            {NAV.map(item => (
              <a
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-2 py-3 text-base text-fg hover:bg-surface-2"
              >
                {item.label}
              </a>
            ))}
          </nav>
          <div className="mt-3 flex gap-2">
            {signedIn ? (
              <LinkButton href={homeHref} className="flex-1">
                {homeLabel}
              </LinkButton>
            ) : (
              <>
                <LinkButton href="/login" variant="secondary" className="flex-1">
                  Sign in
                </LinkButton>
                <LinkButton href="/signup" className="flex-1">
                  Start free
                </LinkButton>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
