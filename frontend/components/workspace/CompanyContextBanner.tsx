'use client';

import React from 'react';
import Link from 'next/link';
import { Icon } from '../ui/Icon';
import { useWorkspace } from './WorkspaceContext';

export function CompanyContextBanner() {
  const { session, canManageMembers } = useWorkspace();
  const isCompany = session.isCompany || session.workspaceType === 'COMPANY';
  if (!isCompany) return null;

  return (
    <div className="border-b border-line bg-surface-2/60 px-3 py-2 sm:px-5">
      <div className="mx-auto flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-md bg-brand/10 px-2 py-0.5 font-semibold text-fg">
            <Icon name="building" className="size-3.5" />
            Company Workspace
          </span>
          <span className="hidden text-muted md:inline">
            Documents uploaded here become searchable to employees in the Employee Portal.
          </span>
        </div>

        <nav aria-label="Company portal views" className="flex flex-wrap items-center gap-1.5">
          {canManageMembers && (
            <Link
              href="/company/"
              className="inline-flex items-center gap-1 rounded-md border border-line bg-surface px-2.5 py-1 font-medium text-fg transition-colors hover:bg-surface-2"
            >
              <Icon name="sliders" className="size-3.5 text-muted" />
              Company Console
            </Link>
          )}
          <Link
            href="/employee/"
            className="inline-flex items-center gap-1 rounded-md border border-line bg-surface px-2.5 py-1 font-medium text-fg transition-colors hover:bg-surface-2"
          >
            <Icon name="userCheck" className="size-3.5 text-muted" />
            Employee Portal
          </Link>
        </nav>
      </div>
    </div>
  );
}
