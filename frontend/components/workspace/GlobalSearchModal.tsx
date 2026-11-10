'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ApiClient, SearchResultItemDTO } from '../../lib/api';
import { Button, inputClass, Spinner } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { Modal } from '../ui/Modal';
import { useWorkspace } from './WorkspaceContext';

export function GlobalSearchModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { askDocuments, openCitation, handleApiError } = useWorkspace();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResultItemDTO[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, [open]);

  const runSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setError(null);
    try {
      const res = await ApiClient.searchWorkspace(q, undefined, 12);
      setResults(res.results);
    } catch (err) {
      if (!handleApiError(err)) {
        setError(err instanceof Error ? err.message : 'Search failed.');
      }
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Search workspace passages"
      description="Hybrid semantic + keyword search across every Ready document in this workspace."
    >
      <form onSubmit={runSearch} className="flex gap-2">
        <div className="relative flex-1">
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search clauses, terms, figures, or topics..."
            className={`${inputClass} pl-9`}
          />
        </div>
        <Button type="submit" disabled={searching || !query.trim()}>
          {searching ? <Spinner /> : 'Search'}
        </Button>
      </form>

      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-danger-soft px-3.5 py-2.5 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="mt-4 max-h-80 overflow-y-auto scroll-thin space-y-2.5">
        {results === null && !searching && (
          <p className="py-6 text-center text-sm text-muted">
            Enter a phrase or question to locate matching passages across all indexed files.
          </p>
        )}
        {results && results.length === 0 && !searching && (
          <p className="py-6 text-center text-sm text-muted">
            No matching passages found for &ldquo;{query}&rdquo;.
          </p>
        )}
        {results?.map((r, idx) => (
          <div key={`${r.document_id}-${idx}`} className="rounded-xl border border-line bg-bg p-3.5 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex items-center gap-2">
                <Icon name="file" className="size-4 text-muted" />
                <span className="truncate text-sm font-semibold">{r.filename}</span>
              </div>
              <span className="shrink-0 rounded bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-muted">
                {r.page_start ? `Page ${r.page_start}` : r.section || 'Passage'}
              </span>
            </div>
            <p className="text-[13px] leading-relaxed text-muted">{r.snippet}</p>
            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-faint">Relevance score: {r.score}</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    openCitation({
                      citation_id: `search-${idx}`,
                      document_id: r.document_id,
                      filename: r.filename,
                      page_start: r.page_start,
                      page_end: r.page_end,
                      section: r.section,
                      excerpt: r.snippet,
                      source_label: `S${idx + 1}`,
                    });
                  }}
                  className="text-xs font-medium text-muted hover:text-fg"
                >
                  Inspect
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    askDocuments([r.document_id]);
                  }}
                  className="text-xs font-medium text-fg underline underline-offset-2"
                >
                  Ask about this file &rarr;
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}

