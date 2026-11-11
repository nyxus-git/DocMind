'use client';

import React from 'react';
import { DocumentDTO } from '../../lib/api';
import { percent } from '../../lib/format';
import { Icon } from '../ui/Icon';

/* ---------- Status badge ---------- */
const STATUS: Record<DocumentDTO['status'], { label: string; cls: string; pulse?: boolean }> = {
  READY: { label: 'Ready', cls: 'bg-ok-soft text-ok' },
  PROCESSING: { label: 'Processing', cls: 'bg-warn-soft text-warn', pulse: true },
  QUEUED: { label: 'Queued', cls: 'bg-surface-2 text-muted', pulse: true },
  UPLOADING: { label: 'Uploading', cls: 'bg-surface-2 text-muted', pulse: true },
  FAILED: { label: 'Failed', cls: 'bg-danger-soft text-danger' },
  DELETING: { label: 'Deleting', cls: 'bg-surface-2 text-muted' },
};

export function StatusBadge({ status }: { status: DocumentDTO['status'] }) {
  const s = STATUS[status] ?? STATUS.QUEUED;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ring-current/15 ${s.cls}`}>
      <span className={`size-1.5 rounded-full bg-current ${s.pulse ? 'animate-pulse' : ''}`} aria-hidden="true" />
      {s.label}
    </span>
  );
}

/* ---------- File type chip ---------- */
export function FileTypeIcon({ filename }: { filename: string }) {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const label = ext === 'pdf' ? 'PDF' : ext === 'docx' ? 'DOC' : ext === 'md' ? 'MD' : 'TXT';
  const tone =
    ext === 'pdf'
      ? 'bg-danger-soft text-danger'
      : ext === 'docx'
        ? 'bg-brand-soft text-brand-ink'
        : ext === 'md'
          ? 'bg-warn-soft text-warn'
          : 'bg-surface-2 text-muted';
  return (
    <span
      aria-hidden="true"
      className={`inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold tracking-wide ${tone}`}
    >
      {label}
    </span>
  );
}

/* ---------- Usage meter ---------- */
export function Meter({
  label,
  used,
  limit,
  valueText,
  hint,
}: {
  label: string;
  used: number;
  limit: number;
  valueText: string;
  hint?: string;
}) {
  const pct = percent(used, limit);
  const tone = pct >= 100 ? 'bg-danger' : pct >= 80 ? 'bg-warn' : 'bg-gradient-to-r from-brand to-[#8b5cf6]';
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium text-fg">{label}</span>
        <span className="tabular text-muted">{valueText}</span>
      </div>
      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
      >
        <div className={`h-full rounded-full transition-[width] duration-500 ${tone}`} style={{ width: `${Math.max(pct, pct > 0 ? 2 : 0)}%` }} />
      </div>
      {hint && <p className="mt-1.5 text-[13px] text-faint">{hint}</p>}
    </div>
  );
}

/* ---------- Page header & empty state ---------- */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-[1.65rem] font-semibold tracking-[-0.025em] text-fg">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-[15px] leading-6 text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: React.ComponentProps<typeof Icon>['name'];
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-line-strong bg-surface px-6 py-16 text-center">
      <span className="inline-flex size-14 items-center justify-center rounded-2xl bg-brand-soft text-brand-ink ring-8 ring-brand-soft/50">
        <Icon name={icon} className="size-6" />
      </span>
      <h2 className="mt-4 text-lg font-semibold">{title}</h2>
      <p className="mt-1.5 max-w-md text-[15px] leading-6 text-muted">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-danger/20 bg-danger-soft px-4 py-3 text-sm text-danger">
      <Icon name="alert" className="size-4" />
      <span className="flex-1">{message}</span>
      {onRetry && (
        <button type="button" onClick={onRetry} className="font-medium underline underline-offset-2">
          Try again
        </button>
      )}
    </div>
  );
}

export function Panel({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`rounded-2xl border border-line bg-surface shadow-xs ${className}`}>{children}</div>;
}
