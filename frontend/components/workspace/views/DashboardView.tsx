'use client';

import React, { useEffect, useState } from 'react';
import { ApiClient, WorkspaceComplianceSummaryResponse } from '../../../lib/api';
import { formatBytes, timeAgo } from '../../../lib/format';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { FileTypeIcon, Meter, Panel, StatusBadge } from '../parts';
import { useWorkspace } from '../WorkspaceContext';

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export function DashboardView() {
  const {
    session,
    usage,
    documents,
    documentsLoaded,
    conversations,
    setTab,
    openUpload,
    askDocuments,
    openNotebook,
    canUpload,
    canAsk,
    canManageMembers,
  } = useWorkspace();

  const [compliance, setCompliance] = useState<WorkspaceComplianceSummaryResponse | null>(null);
  const [loadingCompliance, setLoadingCompliance] = useState(false);

  useEffect(() => {
    if (!session.workspaceId) return;
    let active = true;
    setLoadingCompliance(true);
    ApiClient.getWorkspaceComplianceSummary(session.workspaceId)
      .then(res => {
        if (active) setCompliance(res);
      })
      .catch(() => {
        // graceful fallback if not yet scanned
      })
      .finally(() => {
        if (active) setLoadingCompliance(false);
      });
    return () => {
      active = false;
    };
  }, [session.workspaceId, documents.length]);

  const firstName = (session.fullName || '').split(' ')[0] || 'there';
  const ready = documents.filter(d => d.status === 'READY');
  const steps = [
    { done: documents.length > 0, label: 'Upload a document', hint: 'PDF, Word, text or Markdown.', action: canUpload ? openUpload : undefined, cta: 'Upload' },
    { done: conversations.length > 0, label: 'Ask your first question', hint: 'You will get an answer with numbered sources.', action: () => setTab('chat'), cta: 'Ask', hidden: !canAsk },
    { done: ready.length >= 2, label: 'Compare two documents', hint: 'See differences in one table.', action: () => setTab('compare'), cta: 'Compare', hidden: !canAsk },
    { done: false, label: 'Invite a teammate', hint: 'Add colleagues as Admin, Member or Viewer.', action: () => setTab('settings'), cta: 'Invite', hidden: !canManageMembers || !session.isCompany },
  ].filter(s => !s.hidden);
  const allDone = steps.every(s => s.done);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-[1.75rem] font-semibold tracking-[-0.02em]">
            {greeting()}, {firstName}
          </h1>
          <p className="mt-1 text-[15px] text-muted">
            {session.workspaceName}
            {usage?.tier_name ? ` • ${usage.tier_name} plan` : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {openNotebook && (
            <Button variant="secondary" size="sm" onClick={openNotebook}>
              <Icon name="bookmark" />
              Notebook
            </Button>
          )}
          {canAsk && ready.length > 0 && (
            <Button size="sm" onClick={() => setTab('chat')}>
              <Icon name="chat" />
              Ask Question
            </Button>
          )}
        </div>
      </div>

      {documentsLoaded && !allDone && (
        <Panel className="p-5 sm:p-6">
          <h2 className="text-base font-semibold">Get started</h2>
          <ul className="mt-4 divide-y divide-line">
            {steps.map(s => (
              <li key={s.label} className="flex items-center gap-3 py-3">
                <span
                  className={`inline-flex size-6 shrink-0 items-center justify-center rounded-full border ${
                    s.done ? 'border-ok bg-ok text-white' : 'border-line-strong text-transparent'
                  }`}
                  aria-hidden="true"
                >
                  <Icon name="check" className="size-3.5" strokeWidth={2.6} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-[15px] font-medium ${s.done ? 'text-muted line-through' : ''}`}>{s.label}</span>
                  <span className="block text-[13px] text-muted">{s.hint}</span>
                </span>
                {!s.done && s.action && (
                  <Button variant="secondary" size="sm" onClick={s.action}>
                    {s.cta}
                  </Button>
                )}
                {s.done && <span className="sr-only">Done</span>}
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {/* Compliance & Governance Posture */}
      <Panel className="p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="inline-flex size-10 items-center justify-center rounded-xl bg-brand-soft text-brand-ink">
              <Icon name="shield" className="size-5" />
            </span>
            <div>
              <h2 className="text-base font-semibold">Security & Compliance Posture</h2>
              <p className="text-xs text-muted">
                Zero-leakage scanner for PII, payment cards, API keys, and confidentiality markings.
              </p>
            </div>
          </div>
          <Button variant="secondary" size="sm" onClick={() => setTab('library')}>
            <Icon name="scan" />
            Scan Documents in Library
          </Button>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-line bg-surface-2/40 p-3">
            <span className="text-xs text-muted">Total Documents</span>
            <p className="mt-1 text-xl font-bold">{compliance ? compliance.total_documents : documents.length}</p>
          </div>
          <div className="rounded-xl border border-line bg-surface-2/40 p-3">
            <span className="text-xs text-muted">Clean Documents</span>
            <p className="mt-1 text-xl font-bold text-ok">
              {loadingCompliance ? '...' : (compliance?.clean_documents ?? 0)}
            </p>
          </div>
          <div className="rounded-xl border border-line bg-surface-2/40 p-3">
            <span className="text-xs text-muted">At-Risk Documents</span>
            <p className="mt-1 text-xl font-bold text-warn">
              {loadingCompliance ? '...' : (compliance?.at_risk_documents ?? 0)}
            </p>
          </div>
          <div className="rounded-xl border border-line bg-surface-2/40 p-3">
            <span className="text-xs text-muted">Critical Findings</span>
            <p className="mt-1 text-xl font-bold text-red-500">
              {loadingCompliance ? '...' : (compliance?.critical_findings_count ?? 0)}
            </p>
          </div>
        </div>

        {compliance && Object.keys(compliance.category_counts).length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2 pt-3 border-t border-line text-xs">
            <span className="text-muted font-medium">Flagged Categories:</span>
            {Object.entries(compliance.category_counts).map(([cat, count]) => (
              <span key={cat} className="rounded-md bg-brand-soft px-2 py-0.5 font-medium text-brand-ink">
                {cat.replace(/_/g, ' ')}: {count}
              </span>
            ))}
          </div>
        )}
      </Panel>

      {usage && (
        <Panel className="grid gap-6 p-5 sm:grid-cols-3 sm:p-6">
          <Meter
            label="Documents"
            used={usage.documents_count}
            limit={usage.documents_limit}
            valueText={`${usage.documents_count} of ${usage.documents_limit.toLocaleString('en-US')}`}
          />
          <Meter
            label="Storage"
            used={usage.storage_bytes}
            limit={usage.storage_limit_bytes}
            valueText={`${formatBytes(usage.storage_bytes)} of ${formatBytes(usage.storage_limit_bytes)}`}
          />
          <Meter
            label="Questions this month"
            used={usage.questions_used}
            limit={usage.questions_limit}
            valueText={`${usage.questions_used} of ${usage.questions_limit.toLocaleString('en-US')}`}
            hint={usage.billing_period_reset_date ? `Resets ${new Date(usage.billing_period_reset_date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}` : undefined}
          />
        </Panel>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="recent-docs" className="min-w-0">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="recent-docs" className="text-base font-semibold">
              Recent documents
            </h2>
            {documents.length > 0 && (
              <button type="button" onClick={() => setTab('library')} className="text-sm font-medium text-muted hover:text-fg">
                View all
              </button>
            )}
          </div>
          <Panel>
            {documents.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <p className="text-[15px] font-medium">No documents yet</p>
                <p className="mt-1 text-sm text-muted">Upload a contract, filing or report to start asking questions.</p>
                {canUpload && (
                  <Button className="mt-4" size="sm" onClick={openUpload}>
                    <Icon name="upload" /> Upload a document
                  </Button>
                )}
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {documents.slice(0, 5).map(d => (
                  <li key={d.id} className="flex items-center gap-3 px-4 py-3">
                    <FileTypeIcon filename={d.filename} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{d.filename}</p>
                      <p className="text-[13px] text-muted">
                        {d.page_count ? `${d.page_count} pages • ` : ''}
                        {timeAgo(d.created_at)}
                      </p>
                    </div>
                    {d.status === 'READY' && canAsk ? (
                      <Button variant="ghost" size="sm" onClick={() => askDocuments([d.id])}>
                        Ask
                      </Button>
                    ) : (
                      <StatusBadge status={d.status} />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </section>

        <section aria-labelledby="recent-chats" className="min-w-0">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="recent-chats" className="text-base font-semibold">
              Recent conversations
            </h2>
            {conversations.length > 0 && (
              <button type="button" onClick={() => setTab('chat')} className="text-sm font-medium text-muted hover:text-fg">
                Open Ask
              </button>
            )}
          </div>
          <Panel>
            {conversations.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <p className="text-[15px] font-medium">No conversations yet</p>
                <p className="mt-1 text-sm text-muted">Ask a question and the thread will be saved here.</p>
                {canAsk && ready.length > 0 && (
                  <Button className="mt-4" size="sm" onClick={() => setTab('chat')}>
                    <Icon name="chat" /> Ask a question
                  </Button>
                )}
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {conversations.slice(0, 5).map(c => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => {
                        window.sessionStorage?.setItem?.('docmind_open_conv', c.id);
                        setTab('chat');
                      }}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2"
                    >
                      <Icon name="chat" className="size-4 text-faint" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{c.title || 'Untitled conversation'}</span>
                        <span className="block text-[13px] text-muted">{timeAgo(c.updated_at || c.created_at)}</span>
                      </span>
                      <Icon name="chevronRight" className="size-4 text-faint" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </section>
      </div>
    </div>
  );
}
