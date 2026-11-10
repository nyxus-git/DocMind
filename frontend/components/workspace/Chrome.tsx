'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ApiClient, WorkspaceDetailDTO } from '../../lib/api';
import { formatBytes, percent } from '../../lib/format';
import { UserSession } from '../../lib/session';
import { Button } from '../ui/Button';
import { Icon, IconName } from '../ui/Icon';
import { Logo, LogoMark } from '../ui/Logo';
import { ThemeToggle } from '../ui/ThemeToggle';
import { Meter } from './parts';
import { TabId, useWorkspace } from './WorkspaceContext';

export const NAV: { id: TabId; label: string; icon: IconName }[] = [
  { id: 'dashboard', label: 'Overview', icon: 'grid' },
  { id: 'library', label: 'Library', icon: 'file' },
  { id: 'chat', label: 'Ask', icon: 'chat' },
  { id: 'compare', label: 'Compare', icon: 'compare' },
  { id: 'settings', label: 'Settings', icon: 'sliders' },
];

function useDismiss(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);
  return ref;
}

/* ---------------------------------------------------------------- */
/* Sidebar (desktop)                                                 */
/* ---------------------------------------------------------------- */
export function Sidebar() {
  const { tab, setTab, usage, documents, conversations } = useWorkspace();
  const counts: Partial<Record<TabId, number>> = { library: documents.length, chat: conversations.length };

  return (
    <aside className="hidden w-60 shrink-0 flex-col justify-between border-r border-line bg-surface px-3 py-4 lg:flex">
      <div>
        <Link href="/" className="mb-6 block px-2" aria-label="DocMind website">
          <Logo />
        </Link>
        <nav aria-label="Workspace" className="space-y-0.5">
          {NAV.map(item => {
            const active = tab === item.id;
            const count = counts[item.id];
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                aria-current={active ? 'page' : undefined}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
                  active ? 'bg-brand text-brand-fg' : 'text-muted hover:bg-surface-2 hover:text-fg'
                }`}
              >
                <Icon name={item.icon} className="size-[18px]" />
                <span className="flex-1">{item.label}</span>
                {count !== undefined && count > 0 && (
                  <span className={`tabular text-xs ${active ? 'opacity-80' : 'text-faint'}`}>{count}</span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {usage && (
        <div className="space-y-4 rounded-xl bg-bg p-3.5">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-semibold">{usage.tier_name || usage.tier || 'Plan'}</span>
            {usage.tier === 'STARTER' && (
              <button type="button" onClick={() => setTab('settings')} className="text-[13px] font-medium text-fg underline underline-offset-2">
                Upgrade
              </button>
            )}
          </div>
          <Meter
            label="Questions"
            used={usage.questions_used}
            limit={usage.questions_limit}
            valueText={`${usage.questions_used} of ${usage.questions_limit.toLocaleString('en-US')}`}
          />
          <Meter
            label="Storage"
            used={usage.storage_bytes}
            limit={usage.storage_limit_bytes}
            valueText={`${formatBytes(usage.storage_bytes)} of ${formatBytes(usage.storage_limit_bytes)}`}
          />
        </div>
      )}
    </aside>
  );
}

/* ---------------------------------------------------------------- */
/* Bottom nav (mobile / tablet)                                      */
/* ---------------------------------------------------------------- */
export function MobileNav() {
  const { tab, setTab } = useWorkspace();
  return (
    <nav
      aria-label="Workspace"
      className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      {NAV.map(item => {
        const active = tab === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            aria-current={active ? 'page' : undefined}
            className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium ${active ? 'text-fg' : 'text-faint'}`}
          >
            <span className={`inline-flex h-6 w-11 items-center justify-center rounded-full transition-colors ${active ? 'bg-brand text-brand-fg' : ''}`}>
              <Icon name={item.icon} className="size-[18px]" />
            </span>
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}

/* ---------------------------------------------------------------- */
/* Top bar                                                           */
/* ---------------------------------------------------------------- */
function WorkspaceSwitcher({
  session,
  onSwitch,
}: {
  session: UserSession;
  onSwitch: (ws: WorkspaceDetailDTO) => void;
}) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<WorkspaceDetailDTO[] | null>(null);
  const ref = useDismiss(open, () => setOpen(false));

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && !list) {
      try {
        setList(await ApiClient.listWorkspaces());
      } catch {
        setList([]);
      }
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={toggle}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex h-9 max-w-[14rem] items-center gap-2 rounded-lg px-2.5 text-sm font-medium hover:bg-surface-2 sm:max-w-[18rem]"
      >
        <Icon name={session.isCompany ? 'building' : 'user'} className="size-4 text-muted" />
        <span className="truncate">{session.workspaceName}</span>
        <Icon name="chevronDown" className="size-4 text-faint" />
      </button>
      {open && (
        <div className="anim-pop-in absolute left-0 top-full z-50 mt-1.5 w-72 rounded-xl border border-line bg-surface p-1.5 shadow-pop">
          <p className="px-2.5 pb-1 pt-1.5 text-xs font-medium text-faint">Workspaces</p>
          {list === null && <p className="px-2.5 py-3 text-sm text-muted">Loading&hellip;</p>}
          {list && list.length === 0 && <p className="px-2.5 py-3 text-sm text-muted">No other workspaces found.</p>}
          <ul role="listbox" aria-label="Workspaces">
            {list?.map(ws => (
              <li key={ws.id} role="option" aria-selected={ws.id === session.workspaceId}>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    if (ws.id !== session.workspaceId) onSwitch(ws);
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-surface-2"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{ws.name}</span>
                    <span className="block text-xs text-muted">
                      {ws.role.charAt(0) + ws.role.slice(1).toLowerCase()} &bull; {ws.member_count} {ws.member_count === 1 ? 'member' : 'members'}
                    </span>
                  </span>
                  {ws.id === session.workspaceId && <Icon name="check" className="size-4 text-ok" strokeWidth={2.2} />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function TopBar({
  onSwitchWorkspace,
  onSignOut,
  onOpenSearch,
}: {
  onSwitchWorkspace: (ws: WorkspaceDetailDTO) => void;
  onSignOut: () => void;
  onOpenSearch?: () => void;
}) {
  const { session, canUpload, openUpload, setTab } = useWorkspace();
  const [menu, setMenu] = useState(false);
  const menuRef = useDismiss(menu, () => setMenu(false));
  const initial = (session.fullName || session.email).charAt(0).toUpperCase();

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-line bg-bg/90 px-3 backdrop-blur sm:px-5">
      <div className="flex min-w-0 items-center gap-1">
        <Link href="/" className="mr-1 lg:hidden" aria-label="DocMind website">
          <LogoMark className="size-7" />
        </Link>
        <WorkspaceSwitcher session={session} onSwitch={onSwitchWorkspace} />
      </div>

      <div className="flex items-center gap-1.5">
        {onOpenSearch && (
          <button
            type="button"
            onClick={onOpenSearch}
            className="hidden sm:inline-flex h-8 items-center gap-2 rounded-lg border border-line bg-surface px-2.5 text-xs text-muted hover:bg-surface-2 hover:text-fg transition-colors"
            title="Search passages (Ctrl+K / Cmd+K)"
          >
            <Icon name="search" className="size-3.5" />
            <span>Search</span>
            <kbd className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-mono text-faint">⌘K</kbd>
          </button>
        )}
        {onOpenSearch && (
          <button
            type="button"
            onClick={onOpenSearch}
            aria-label="Search documents"
            className="inline-flex size-8 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg sm:hidden"
          >
            <Icon name="search" className="size-4" />
          </button>
        )}
        {canUpload && (
          <Button size="sm" onClick={openUpload}>
            <Icon name="plus" />
            <span className="hidden sm:inline">Upload</span>
            <span className="sr-only sm:hidden">Upload documents</span>
          </Button>
        )}
        <ThemeToggle />
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenu(m => !m)}
            aria-haspopup="menu"
            aria-expanded={menu}
            aria-label="Account menu"
            className="inline-flex size-9 items-center justify-center rounded-full bg-brand text-sm font-semibold text-brand-fg"
          >
            {initial}
          </button>
          {menu && (
            <div role="menu" className="anim-pop-in absolute right-0 top-full z-50 mt-1.5 w-64 rounded-xl border border-line bg-surface p-1.5 shadow-pop">
              <div className="border-b border-line px-2.5 pb-2.5 pt-1.5">
                <p className="truncate text-sm font-semibold">{session.fullName}</p>
                <p className="truncate text-[13px] text-muted">{session.email}</p>
                <p className="mt-1 text-xs text-faint">{session.role.charAt(0) + session.role.slice(1).toLowerCase()} in {session.workspaceName}</p>
              </div>
              <button
                role="menuitem"
                type="button"
                onClick={() => {
                  setMenu(false);
                  setTab('settings');
                }}
                className="mt-1 flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm hover:bg-surface-2"
              >
                <Icon name="sliders" className="size-4 text-muted" /> Settings
              </button>
              {Boolean(session.isSuperAdmin) && (
                <Link
                  role="menuitem"
                  href="/admin/"
                  onClick={() => setMenu(false)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm hover:bg-surface-2 text-amber-500 hover:text-amber-400 font-medium"
                >
                  <Icon name="shield" className="size-4 text-amber-500" /> Admin Console
                </Link>
              )}
              <Link
                role="menuitem"
                href="/"
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm hover:bg-surface-2"
              >
                <Icon name="external" className="size-4 text-muted" /> DocMind website
              </Link>
              <button
                role="menuitem"
                type="button"
                onClick={() => {
                  setMenu(false);
                  onSignOut();
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-danger hover:bg-danger-soft"
              >
                <Icon name="logout" className="size-4" /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export { percent };
