'use client';

import React, { useMemo, useState } from 'react';
import { ApiClient, DocumentDTO, DocumentSummaryResponse } from '../../../lib/api';
import { formatBytes, formatDate } from '../../../lib/format';
import { Button, inputClass, Spinner } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { Modal } from '../../ui/Modal';
import { useToast } from '../../ui/Toast';
import { EmptyState, FileTypeIcon, PageHeader, Panel, StatusBadge } from '../parts';
import { useWorkspace } from '../WorkspaceContext';

const FILTERS: { id: string; label: string }[] = [
  { id: 'ALL', label: 'All' },
  { id: 'READY', label: 'Ready' },
  { id: 'IN_PROGRESS', label: 'In progress' },
  { id: 'FAILED', label: 'Failed' },
];

function matchesFilter(d: DocumentDTO, f: string) {
  if (f === 'ALL') return true;
  if (f === 'IN_PROGRESS') return ['UPLOADING', 'QUEUED', 'PROCESSING'].includes(d.status);
  return d.status === f;
}

function IconButton({
  label,
  onClick,
  children,
  tone = 'default',
  disabled,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  tone?: 'default' | 'danger';
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      disabled={disabled}
      className={`inline-flex size-8 items-center justify-center rounded-lg transition-colors disabled:opacity-40 ${
        tone === 'danger' ? 'text-muted hover:bg-danger-soft hover:text-danger' : 'text-muted hover:bg-surface-2 hover:text-fg'
      }`}
    >
      {children}
    </button>
  );
}

export function LibraryView() {
  const { documents, documentsLoaded, refreshDocuments, refreshUsage, openUpload, askDocuments, canUpload, canAsk, handleApiError } = useWorkspace();
  const toast = useToast();

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('ALL');
  const [toDelete, setToDelete] = useState<DocumentDTO | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [summaryFor, setSummaryFor] = useState<DocumentDTO | null>(null);
  const [summary, setSummary] = useState<DocumentSummaryResponse | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    FILTERS.forEach(f => (c[f.id] = documents.filter(d => matchesFilter(d, f.id)).length));
    return c;
  }, [documents]);

  const visible = documents.filter(d => matchesFilter(d, filter) && (!query || d.filename.toLowerCase().includes(query.toLowerCase())));

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await ApiClient.deleteDocument(toDelete.id);
      toast(`Deleted ${toDelete.filename}.`, 'success');
      setToDelete(null);
      await Promise.all([refreshDocuments(), refreshUsage()]);
    } catch (err) {
      if (!handleApiError(err)) toast(err instanceof Error ? err.message : 'Could not delete the document.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const openSummary = async (doc: DocumentDTO) => {
    setSummaryFor(doc);
    setSummary(null);
    setSummaryError(null);
    try {
      setSummary(await ApiClient.getDocumentSummary(doc.id));
    } catch (err) {
      if (!handleApiError(err)) setSummaryError(err instanceof Error ? err.message : 'Could not create a summary.');
    }
  };

  const retry = async (doc: DocumentDTO) => {
    setBusyId(doc.id);
    try {
      await ApiClient.retryDocument(doc.id);
      toast(`Retrying ${doc.filename}.`, 'info');
      await refreshDocuments();
    } catch (err) {
      if (!handleApiError(err)) toast(err instanceof Error ? err.message : 'Could not retry processing.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const download = async (doc: DocumentDTO) => {
    setBusyId(doc.id);
    try {
      const { download_url } = await ApiClient.getDownloadUrl(doc.id);
      window.open(download_url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      if (!handleApiError(err)) toast(err instanceof Error ? err.message : 'Could not open the file.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="Library"
        description="Every document in this workspace. Ask questions once a document shows as Ready."
        actions={
          canUpload && (
            <Button onClick={openUpload}>
              <Icon name="upload" /> Upload
            </Button>
          )
        }
      />

      {!documentsLoaded ? (
        <div className="flex justify-center py-20">
          <Spinner className="size-6 text-muted" />
        </div>
      ) : documents.length === 0 ? (
        <EmptyState
          icon="file"
          title="Your library is empty"
          body="Upload a PDF, Word file, text file or Markdown note. Scanned pages are read automatically."
          action={
            canUpload ? (
              <Button onClick={openUpload}>
                <Icon name="upload" /> Upload your first document
              </Button>
            ) : (
              <p className="text-sm text-muted">Ask a workspace admin to upload documents.</p>
            )
          }
        />
      ) : (
        <>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative sm:w-72">
              <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
              <input
                type="search"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search by file name"
                aria-label="Search documents"
                className={`${inputClass} pl-9`}
              />
            </div>
            <div role="group" aria-label="Filter by status" className="flex gap-1 overflow-x-auto">
              {FILTERS.map(f => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilter(f.id)}
                  aria-pressed={filter === f.id}
                  className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    filter === f.id ? 'bg-brand text-brand-fg' : 'text-muted hover:bg-surface-2 hover:text-fg'
                  }`}
                >
                  {f.label} <span className="tabular opacity-70">{counts[f.id]}</span>
                </button>
              ))}
            </div>
          </div>

          <Panel className="overflow-hidden">
            {visible.length === 0 ? (
              <p className="px-5 py-12 text-center text-[15px] text-muted">No documents match your search or filter.</p>
            ) : (
              <ul className="divide-y divide-line">
                {visible.map(d => (
                  <li key={d.id} className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <FileTypeIcon filename={d.filename} />
                      <div className="min-w-0">
                        <p className="truncate text-[15px] font-medium">{d.filename}</p>
                        <p className="tabular text-[13px] text-muted">
                          {d.page_count ? `${d.page_count} pages • ` : ''}
                          {formatBytes(d.size_bytes)} &bull; Added {formatDate(d.created_at)}
                        </p>
                        {d.status === 'FAILED' && d.safe_error?.message && (
                          <p className="mt-0.5 text-[13px] text-danger">{d.safe_error.message}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-3 sm:justify-end">
                      <StatusBadge status={d.status} />
                      <div className="flex items-center">
                        {d.status === 'READY' && canAsk && (
                          <IconButton label={`Ask ${d.filename}`} onClick={() => askDocuments([d.id])}>
                            <Icon name="chat" />
                          </IconButton>
                        )}
                        {d.status === 'READY' && (
                          <IconButton label={`Summarize ${d.filename}`} onClick={() => openSummary(d)}>
                            <Icon name="book" />
                          </IconButton>
                        )}
                        {d.status === 'FAILED' && canUpload && (
                          <IconButton label={`Retry ${d.filename}`} onClick={() => retry(d)} disabled={busyId === d.id}>
                            <Icon name="retry" />
                          </IconButton>
                        )}
                        {d.status === 'READY' && (
                          <IconButton label={`Download ${d.filename}`} onClick={() => download(d)} disabled={busyId === d.id}>
                            <Icon name="download" />
                          </IconButton>
                        )}
                        {canUpload && (
                          <IconButton label={`Delete ${d.filename}`} tone="danger" onClick={() => setToDelete(d)}>
                            <Icon name="trash" />
                          </IconButton>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </>
      )}

      {/* Delete confirmation */}
      <Modal
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        title="Delete this document?"
        lockClose={deleting}
        footer={
          <>
            <Button variant="ghost" onClick={() => setToDelete(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="danger-solid" onClick={confirmDelete} disabled={deleting}>
              {deleting && <Spinner />}
              Delete document
            </Button>
          </>
        }
      >
        <p className="text-[15px] leading-7 text-muted">
          <span className="font-medium text-fg">{toDelete?.filename}</span> will disappear from search and answers right away. Past answers
          that cited it keep their quoted passages. This cannot be undone.
        </p>
      </Modal>

      {/* Summary */}
      <Modal
        open={!!summaryFor}
        onClose={() => setSummaryFor(null)}
        title="Summary"
        description={summaryFor?.filename}
        width="max-w-2xl"
        footer={
          <Button variant="secondary" onClick={() => setSummaryFor(null)}>
            Close
          </Button>
        }
      >
        {!summary && !summaryError && (
          <div className="flex items-center gap-3 py-8 text-sm text-muted">
            <Spinner className="size-4" /> Reading the document&hellip;
          </div>
        )}
        {summaryError && <p role="alert" className="rounded-lg bg-danger-soft px-3.5 py-3 text-sm text-danger">{summaryError}</p>}
        {summary && (
          <div className="space-y-6">
            <p className="text-[15px] leading-7">{summary.overview}</p>
            {summary.key_points?.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold">Key points</h3>
                <ul className="mt-3 space-y-3">
                  {summary.key_points.map((kp, i) => (
                    <li key={i} className="rounded-xl bg-surface-2 px-4 py-3">
                      <p className="text-[15px] font-medium">{kp.point}</p>
                      <p className="mt-1 text-sm leading-6 text-muted">{kp.explanation}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {summary.sections && summary.sections.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold">By section</h3>
                <dl className="mt-3 space-y-3">
                  {summary.sections.map((s, i) => (
                    <div key={i}>
                      <dt className="text-sm font-medium">{s.title}</dt>
                      <dd className="text-sm leading-6 text-muted">{s.content}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
            {summary.caveats && <p className="rounded-lg bg-warn-soft px-3.5 py-3 text-sm text-warn">{summary.caveats}</p>}
          </div>
        )}
      </Modal>
    </div>
  );
}
