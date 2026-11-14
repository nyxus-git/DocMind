'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { ApiClient, DocumentComplianceScanResponse, DocumentContentDTO, DocumentDTO, DocumentSummaryResponse, ExtractionResponse } from '../../../lib/api';
import { formatBytes, formatDate } from '../../../lib/format';
import { Button, inputClass, Spinner } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { Modal } from '../../ui/Modal';
import { useToast } from '../../ui/Toast';
import { ComplianceScanModal } from '../ComplianceScanModal';
import { DocumentReaderModal, openDocumentWithFallback } from '../DocumentReaderModal';
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
  const { session, documents, documentsLoaded, spaces, refreshDocuments, refreshUsage, openUpload, askDocuments, canUpload, canAsk, canManageMembers, handleApiError } = useWorkspace();
  const toast = useToast();
  const isCompany = session.isCompany || session.workspaceType === 'COMPANY';
  const companySlug = session.workspaceSlug && session.workspaceSlug !== 'personal' ? session.workspaceSlug : null;

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('ALL');
  const [spaceFilter, setSpaceFilter] = useState('ALL');
  const [toDelete, setToDelete] = useState<DocumentDTO | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [summaryFor, setSummaryFor] = useState<DocumentDTO | null>(null);
  const [summary, setSummary] = useState<DocumentSummaryResponse | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [extractFor, setExtractFor] = useState<DocumentDTO | null>(null);
  const [extractPreset, setExtractPreset] = useState('entities');
  const [extracting, setExtracting] = useState(false);
  const [extractResult, setExtractResult] = useState<ExtractionResponse | null>(null);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [editingDoc, setEditingDoc] = useState<DocumentDTO | null>(null);
  const [editFilename, setEditFilename] = useState('');
  const [editTags, setEditTags] = useState('');
  const [editSpaceId, setEditSpaceId] = useState('');
  const [savingMeta, setSavingMeta] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [readerContent, setReaderContent] = useState<DocumentContentDTO | null>(null);

  // Production SaaS Batch Operations & Compliance States
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [showBatchDeleteModal, setShowBatchDeleteModal] = useState(false);
  const [batchSpaceId, setBatchSpaceId] = useState<string>('');
  const [showBatchSpaceModal, setShowBatchSpaceModal] = useState(false);
  const [batchAssigning, setBatchAssigning] = useState(false);

  const [complianceDoc, setComplianceDoc] = useState<DocumentDTO | null>(null);
  const [complianceScan, setComplianceScan] = useState<DocumentComplianceScanResponse | null>(null);
  const [complianceLoading, setComplianceLoading] = useState(false);

  const [sortBy, setSortBy] = useState<'date_desc' | 'date_asc' | 'name' | 'size'>('date_desc');
  const [fileTypeFilter, setFileTypeFilter] = useState<'ALL' | 'PDF' | 'DOCX' | 'TXT'>('ALL');

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    FILTERS.forEach(f => (c[f.id] = documents.filter(d => matchesFilter(d, f.id)).length));
    return c;
  }, [documents]);

  const visible = useMemo(() => {
    const list = documents.filter(
      d =>
        matchesFilter(d, filter) &&
        (spaceFilter === 'ALL'
          ? true
          : spaceFilter === 'GENERAL'
            ? !d.space_id
            : d.space_id === spaceFilter) &&
        (fileTypeFilter === 'ALL'
          ? true
          : fileTypeFilter === 'PDF'
            ? d.filename.toLowerCase().endsWith('.pdf')
            : fileTypeFilter === 'DOCX'
              ? d.filename.toLowerCase().endsWith('.docx') || d.filename.toLowerCase().endsWith('.doc')
              : d.filename.toLowerCase().endsWith('.txt') || d.filename.toLowerCase().endsWith('.md')) &&
        (!query ||
          d.filename.toLowerCase().includes(query.toLowerCase()) ||
          (d.space_name || '').toLowerCase().includes(query.toLowerCase()) ||
          (d.tags || []).some(t => t.toLowerCase().includes(query.toLowerCase()))),
    );

    return list.sort((a, b) => {
      if (sortBy === 'date_asc') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      if (sortBy === 'name') return a.filename.localeCompare(b.filename);
      if (sortBy === 'size') return b.size_bytes - a.size_bytes;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [documents, filter, spaceFilter, fileTypeFilter, query, sortBy]);

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

  const runExtraction = async (doc: DocumentDTO, preset: string) => {
    setExtractFor(doc);
    setExtractPreset(preset);
    setExtractResult(null);
    setExtractError(null);
    setExtracting(true);
    try {
      const res = await ApiClient.extractPreset(doc.id, preset);
      setExtractResult(res);
    } catch (err) {
      if (!handleApiError(err)) setExtractError(err instanceof Error ? err.message : 'Structured extraction failed.');
    } finally {
      setExtracting(false);
    }
  };

  const openEditMeta = (doc: DocumentDTO) => {
    setEditingDoc(doc);
    setEditFilename(doc.filename);
    setEditTags((doc.tags || []).join(', '));
    setEditSpaceId(doc.space_id || '');
  };

  const saveMeta = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDoc) return;
    setSavingMeta(true);
    try {
      const parsedTags = editTags
        .split(',')
        .map(t => t.trim())
        .filter(Boolean);
      await ApiClient.updateDocument(editingDoc.id, {
        filename: editFilename.trim() || editingDoc.filename,
        tags: parsedTags,
        ...(editSpaceId ? { space_id: editSpaceId, clear_space: false } : { clear_space: true }),
      });
      toast('Document updated.', 'success');
      setEditingDoc(null);
      await refreshDocuments();
    } catch (err) {
      if (!handleApiError(err)) toast(err instanceof Error ? err.message : 'Could not update document.', 'error');
    } finally {
      setSavingMeta(false);
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
      await openDocumentWithFallback(doc.id, content => {
        setReaderContent(content);
        toast('Original PDF binary missing in storage — opened extracted text reader.', 'info');
      });
    } catch (err) {
      if (!handleApiError(err)) toast(err instanceof Error ? err.message : 'Could not open the file.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const runComplianceScan = async (doc: DocumentDTO) => {
    setComplianceDoc(doc);
    setComplianceLoading(true);
    setComplianceScan(null);
    try {
      const res = await ApiClient.scanDocumentCompliance(doc.id);
      setComplianceScan(res);
    } catch (err) {
      if (!handleApiError(err)) toast(err instanceof Error ? err.message : 'Compliance scan failed.', 'error');
    } finally {
      setComplianceLoading(false);
    }
  };

  const toggleSelectDoc = (id: string) => {
    setSelectedIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === visible.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(visible.map(d => d.id));
    }
  };

  const handleBatchDelete = async () => {
    if (selectedIds.length === 0) return;
    setBatchDeleting(true);
    try {
      const res = await ApiClient.batchDeleteDocuments(selectedIds);
      toast(`Deleted ${res.deleted_count} documents.`, 'success');
      setSelectedIds([]);
      setShowBatchDeleteModal(false);
      await Promise.all([refreshDocuments(), refreshUsage()]);
    } catch (err) {
      if (!handleApiError(err)) toast(err instanceof Error ? err.message : 'Batch delete failed.', 'error');
    } finally {
      setBatchDeleting(false);
    }
  };

  const handleBatchAssignSpace = async () => {
    if (selectedIds.length === 0) return;
    setBatchAssigning(true);
    try {
      await ApiClient.batchAssignSpace(selectedIds, batchSpaceId || null);
      toast(`Updated knowledge space for ${selectedIds.length} documents.`, 'success');
      setSelectedIds([]);
      setShowBatchSpaceModal(false);
      await refreshDocuments();
    } catch (err) {
      if (!handleApiError(err)) toast(err instanceof Error ? err.message : 'Failed to assign space.', 'error');
    } finally {
      setBatchAssigning(false);
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

      {isCompany && (
        <div className="mb-5 flex flex-col gap-3 rounded-xl border border-brand/25 bg-brand/5 px-4 py-3.5 text-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2.5">
            <Icon name="info" className="mt-0.5 size-4 shrink-0 text-fg" />
            <div>
              <p className="font-medium text-fg">
                How documents reach the Employee Portal
              </p>
              <p className="mt-0.5 text-xs leading-5 text-muted">
                Documents uploaded here default to <strong>General (all employees)</strong> once Ready. To limit access to a department, assign a <strong>Department Space</strong> during upload or via the edit (<Icon name="edit" className="inline size-3 align-text-bottom" />) button.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Link
              href={companySlug ? `/${companySlug}/` : '/employee/'}
              className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs font-medium hover:bg-surface-2"
            >
              {companySlug ? `${session.workspaceName} Portal` : 'Employee Portal'} <Icon name="arrowRight" className="size-3" />
            </Link>
            {canManageMembers && !companySlug && (
              <Link
                href="/company/"
                className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs font-medium hover:bg-surface-2"
              >
                Manage Spaces <Icon name="arrowRight" className="size-3" />
              </Link>
            )}
          </div>
        </div>
      )}

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
            <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative sm:w-64">
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
              {spaces.length > 0 && (
                <select
                  aria-label="Filter by department space"
                  value={spaceFilter}
                  onChange={e => setSpaceFilter(e.target.value)}
                  className={`${inputClass} sm:w-52`}
                >
                  <option value="ALL">All spaces</option>
                  <option value="GENERAL">General (All employees)</option>
                  {spaces.map(sp => (
                    <option key={sp.id} value={sp.id}>
                      {sp.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="Sort documents"
                value={sortBy}
                onChange={e => setSortBy(e.target.value as 'date_desc' | 'date_asc' | 'name' | 'size')}
                className={`${inputClass} sm:w-40 text-xs`}
              >
                <option value="date_desc">Newest First</option>
                <option value="date_asc">Oldest First</option>
                <option value="name">Name (A-Z)</option>
                <option value="size">Largest Size</option>
              </select>

              <div role="group" aria-label="Filter by file type" className="flex rounded-lg border border-line bg-surface-1 p-0.5 text-xs">
                {(['ALL', 'PDF', 'DOCX', 'TXT'] as const).map(ft => (
                  <button
                    key={ft}
                    type="button"
                    onClick={() => setFileTypeFilter(ft)}
                    className={`rounded-md px-2 py-1 font-medium transition-colors ${
                      fileTypeFilter === ft ? 'bg-surface-2 text-fg shadow-sm' : 'text-muted hover:text-fg'
                    }`}
                  >
                    {ft === 'TXT' ? 'TXT/MD' : ft}
                  </button>
                ))}
              </div>

              <div role="group" aria-label="Filter by status" className="flex gap-1 overflow-x-auto">
                {FILTERS.map(f => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFilter(f.id)}
                    aria-pressed={filter === f.id}
                    className={`whitespace-nowrap rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                      filter === f.id ? 'bg-brand text-brand-fg' : 'text-muted hover:bg-surface-2 hover:text-fg'
                    }`}
                  >
                    {f.label} <span className="tabular opacity-70">{counts[f.id]}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {visible.length > 0 && canUpload && (
            <div className="mb-2 flex items-center justify-between px-1 text-xs text-muted">
              <label className="flex cursor-pointer items-center gap-2 select-none">
                <input
                  type="checkbox"
                  checked={selectedIds.length > 0 && selectedIds.length === visible.length}
                  onChange={toggleSelectAll}
                  className="rounded border-line"
                />
                <span>Select all ({visible.length})</span>
              </label>
              {selectedIds.length > 0 && (
                <span className="font-medium text-fg">{selectedIds.length} selected</span>
              )}
            </div>
          )}

          <Panel className="overflow-hidden">
            {visible.length === 0 ? (
              <p className="px-5 py-12 text-center text-[15px] text-muted">No documents match your search or filter.</p>
            ) : (
              <ul className="divide-y divide-line">
                {visible.map(d => (
                  <li key={d.id} className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      {canUpload && (
                        <input
                          type="checkbox"
                          aria-label={`Select ${d.filename}`}
                          checked={selectedIds.includes(d.id)}
                          onChange={() => toggleSelectDoc(d.id)}
                          className="size-4 shrink-0 rounded border-line"
                        />
                      )}
                      <FileTypeIcon filename={d.filename} />
                      <div className="min-w-0">
                        <p className="truncate text-[15px] font-medium">{d.filename}</p>
                        <p className="tabular text-[13px] text-muted">
                          {d.page_count ? `${d.page_count} pages • ` : ''}
                          {formatBytes(d.size_bytes)} &bull; Added {formatDate(d.created_at)}
                        </p>
                        {(isCompany || d.space_name || (d.tags && d.tags.length > 0)) && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {d.space_name ? (
                              <span className="inline-flex items-center gap-1 rounded-md bg-brand/10 px-1.5 py-0.5 text-[11px] font-medium text-fg">
                                <Icon name="folder" className="size-3" /> {d.space_name}
                              </span>
                            ) : isCompany ? (
                              <span className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-muted">
                                <Icon name="globe" className="size-3" /> General (All employees)
                              </span>
                            ) : null}
                            {(d.tags || []).map(tag => (
                              <span key={tag} className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted">
                                #{tag}
                              </span>
                            ))}
                          </div>
                        )}
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
                          <IconButton label={`Scan security & compliance for ${d.filename}`} onClick={() => runComplianceScan(d)}>
                            <Icon name="shield" className="text-brand" />
                          </IconButton>
                        )}
                        {d.status === 'READY' && (
                          <IconButton label={`Summarize ${d.filename}`} onClick={() => openSummary(d)}>
                            <Icon name="book" />
                          </IconButton>
                        )}
                        {d.status === 'READY' && canAsk && (
                          <IconButton label={`Extract data from ${d.filename}`} onClick={() => runExtraction(d, 'entities')}>
                            <Icon name="table" />
                          </IconButton>
                        )}
                        {canUpload && (
                          <IconButton label={`Rename or tag ${d.filename}`} onClick={() => openEditMeta(d)}>
                            <Icon name="edit" />
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

      {/* Structured Extraction Modal */}
      <Modal
        open={!!extractFor}
        onClose={() => setExtractFor(null)}
        title="Structured Extraction"
        description={extractFor?.filename}
        width="max-w-2xl"
        footer={
          <>
            {extractResult && (
              <Button
                variant="secondary"
                onClick={() => {
                  const blob = new Blob([JSON.stringify(extractResult.extracted_data, null, 2)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `${extractFor?.filename || 'document'}_${extractPreset}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                <Icon name="download" /> Export JSON
              </Button>
            )}
            <Button variant="secondary" onClick={() => setExtractFor(null)}>
              Close
            </Button>
          </>
        }
      >
        <div className="mb-4 flex flex-wrap gap-1.5">
          {[
            { id: 'entities', label: 'Entities' },
            { id: 'dates', label: 'Dates & Deadlines' },
            { id: 'metrics', label: 'Metrics & Numbers' },
            { id: 'obligations', label: 'Obligations' },
            { id: 'sections', label: 'Sections' },
          ].map(p => (
            <button
              key={p.id}
              type="button"
              disabled={extracting}
              onClick={() => extractFor && runExtraction(extractFor, p.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                extractPreset === p.id ? 'bg-brand text-brand-fg' : 'bg-surface-2 text-muted hover:text-fg'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {extracting && (
          <div className="flex items-center gap-3 py-8 text-sm text-muted">
            <Spinner className="size-4" /> Extracting structured {extractPreset} data&hellip;
          </div>
        )}
        {extractError && (
          <p role="alert" className="rounded-lg bg-danger-soft px-3.5 py-3 text-sm text-danger">
            {extractError}
          </p>
        )}
        {extractResult && !extracting && (
          <div className="space-y-4">
            <p className="text-xs text-muted">{extractResult.confidence_note}</p>
            <pre className="scroll-thin max-h-72 overflow-auto rounded-xl border border-line bg-bg p-4 font-mono text-xs leading-relaxed">
              {JSON.stringify(extractResult.extracted_data, null, 2)}
            </pre>
            {extractResult.citations?.length > 0 && (
              <div className="text-xs text-muted">
                Verified across {extractResult.citations.length} source passage(s).
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Rename & Tag Document Modal */}
      <Modal
        open={!!editingDoc}
        onClose={() => setEditingDoc(null)}
        title="Edit document details"
        lockClose={savingMeta}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditingDoc(null)} disabled={savingMeta}>
              Cancel
            </Button>
            <Button type="submit" form="edit-doc-form" disabled={savingMeta}>
              {savingMeta && <Spinner />} Save changes
            </Button>
          </>
        }
      >
        <form id="edit-doc-form" onSubmit={saveMeta} className="space-y-4">
          <div>
            <label htmlFor="doc-rename" className="mb-1.5 block text-sm font-medium">
              File name
            </label>
            <input
              id="doc-rename"
              type="text"
              required
              value={editFilename}
              onChange={e => setEditFilename(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="doc-tags" className="mb-1.5 block text-sm font-medium">
              Tags (comma-separated)
            </label>
            <input
              id="doc-tags"
              type="text"
              placeholder="contract, vendor, q4-2026"
              value={editTags}
              onChange={e => setEditTags(e.target.value)}
              className={inputClass}
            />
          </div>
          {spaces.length > 0 && (
            <div>
              <label htmlFor="doc-space" className="mb-1.5 block text-sm font-medium">
                Department / Knowledge Space
              </label>
              <select
                id="doc-space"
                value={editSpaceId}
                onChange={e => setEditSpaceId(e.target.value)}
                className={inputClass}
              >
                <option value="">General (All members)</option>
                {spaces.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.visibility === 'RESTRICTED' ? 'Restricted' : 'All members'})
                  </option>
                ))}
              </select>
            </div>
          )}
        </form>
      </Modal>

      <DocumentReaderModal
        content={readerContent}
        onClose={() => setReaderContent(null)}
        onAskDocument={canAsk ? docId => askDocuments([docId]) : undefined}
      />

      <ComplianceScanModal
        open={!!complianceDoc}
        onClose={() => setComplianceDoc(null)}
        scan={complianceScan}
        loading={complianceLoading}
        filename={complianceDoc?.filename || ''}
      />

      {/* Floating Bottom Batch Operations Bar */}
      {selectedIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 z-30 flex -translate-x-1/2 flex-wrap items-center gap-3 rounded-2xl border border-line-strong bg-surface-1 px-5 py-3 shadow-2xl ring-1 ring-fg/10 animate-fade-in">
          <span className="rounded-full bg-brand px-2.5 py-0.5 text-xs font-semibold text-brand-fg">
            {selectedIds.length} selected
          </span>
          {canAsk && (
            <Button size="sm" variant="secondary" onClick={() => askDocuments(selectedIds)}>
              <Icon name="chat" className="size-3.5" />
              <span>Ask in Chat</span>
            </Button>
          )}
          {canUpload && spaces.length > 0 && (
            <Button size="sm" variant="secondary" onClick={() => setShowBatchSpaceModal(true)}>
              <Icon name="folder" className="size-3.5" />
              <span>Assign Space</span>
            </Button>
          )}
          {canUpload && (
            <Button size="sm" variant="danger-solid" onClick={() => setShowBatchDeleteModal(true)}>
              <Icon name="trash" className="size-3.5" />
              <span>Delete Selected</span>
            </Button>
          )}
          <button
            type="button"
            onClick={() => setSelectedIds([])}
            className="text-xs text-muted hover:text-fg hover:underline"
          >
            Deselect
          </button>
        </div>
      )}

      {/* Batch Delete Confirmation Modal */}
      <Modal
        open={showBatchDeleteModal}
        onClose={() => setShowBatchDeleteModal(false)}
        title={`Permanently delete ${selectedIds.length} documents?`}
        lockClose={batchDeleting}
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowBatchDeleteModal(false)} disabled={batchDeleting}>
              Cancel
            </Button>
            <Button variant="danger-solid" onClick={handleBatchDelete} disabled={batchDeleting}>
              {batchDeleting && <Spinner />} Delete {selectedIds.length} files
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">
          This will permanently delete the selected {selectedIds.length} documents, all their indexed text chunks,
          vector embeddings, and citations. This action cannot be undone.
        </p>
      </Modal>

      {/* Batch Assign Space Modal */}
      <Modal
        open={showBatchSpaceModal}
        onClose={() => setShowBatchSpaceModal(false)}
        title={`Assign space for ${selectedIds.length} documents`}
        lockClose={batchAssigning}
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowBatchSpaceModal(false)} disabled={batchAssigning}>
              Cancel
            </Button>
            <Button onClick={handleBatchAssignSpace} disabled={batchAssigning}>
              {batchAssigning && <Spinner />} Save space
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-muted">
            Choose the target knowledge space for all {selectedIds.length} selected documents:
          </p>
          <select
            value={batchSpaceId}
            onChange={e => setBatchSpaceId(e.target.value)}
            className={inputClass}
          >
            <option value="">General (All employees)</option>
            {spaces.map(s => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.visibility === 'RESTRICTED' ? 'Restricted' : 'All members'})
              </option>
            ))}
          </select>
        </div>
      </Modal>
    </div>
  );
}
