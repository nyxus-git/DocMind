'use client';

import React, { useState } from 'react';
import { SavedInsightDTO } from '../../lib/api';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/Toast';

interface SavedInsightsModalProps {
  open: boolean;
  onClose: () => void;
  insights: SavedInsightDTO[];
  onDeleteInsight: (id: string) => Promise<void>;
}

export function SavedInsightsModal({
  open,
  onClose,
  insights,
  onDeleteInsight,
}: SavedInsightsModalProps) {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const filtered = insights.filter(
    i =>
      i.title.toLowerCase().includes(search.toLowerCase()) ||
      i.question.toLowerCase().includes(search.toLowerCase()) ||
      i.answer.toLowerCase().includes(search.toLowerCase()) ||
      i.tags.some(t => t.toLowerCase().includes(search.toLowerCase())),
  );

  const copyInsight = async (ins: SavedInsightDTO) => {
    const lines = [
      `### ${ins.title}`,
      `**Question:** ${ins.question}`,
      `**Answer:** ${ins.answer}`,
      '',
    ];
    if (ins.citations.length > 0) {
      lines.push('**Sources:**');
      ins.citations.forEach(c => {
        lines.push(`- [${c.source_label}] ${c.filename} (p. ${c.page_start || 1}): "${c.excerpt}"`);
      });
    }
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopiedId(ins.id);
      setTimeout(() => setCopiedId(null), 2000);
      toast('Insight copied to clipboard.', 'success');
    } catch {
      toast('Failed to copy.', 'error');
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await onDeleteInsight(id);
      toast('Insight removed from notebook.', 'success');
    } catch {
      toast('Failed to delete insight.', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Research Notebook & Saved Insights"
      width="max-w-2xl"
    >
      <div className="space-y-4 py-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted">
            Pinned verifiable insights and executive Q&amp;A summaries saved by your team.
          </p>
          <div className="relative">
            <Icon
              name="search"
              className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted"
            />
            <input
              type="search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search insights..."
              className="h-8 w-48 rounded-lg border border-line bg-surface-1 pl-8 pr-3 text-xs focus:border-fg focus:outline-none sm:w-56"
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-xl border border-line bg-surface-1 py-10 text-center">
            <Icon name="sparkles" className="mx-auto size-6 text-muted" />
            <p className="mt-2 text-sm font-medium text-fg">
              {search.trim() ? 'No matching insights' : 'Notebook is empty'}
            </p>
            <p className="mt-1 text-xs text-muted">
              {search.trim()
                ? 'Try a different search query.'
                : 'In Chat, click "Save to Notebook" on any verified answer to bookmark it here.'}
            </p>
          </div>
        ) : (
          <ul className="space-y-3 max-h-[28rem] overflow-y-auto pr-1">
            {filtered.map(ins => (
              <li
                key={ins.id}
                className="rounded-xl border border-line bg-surface-1 p-4 transition-colors hover:border-line-strong"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h4 className="text-sm font-semibold text-fg">{ins.title}</h4>
                    <p className="mt-1 text-xs text-muted">
                      <span className="font-semibold text-fg/80">Q:</span> {ins.question}
                    </p>
                    <p className="mt-2 text-xs leading-relaxed text-fg">
                      <span className="font-semibold text-brand">A:</span> {ins.answer}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyInsight(ins)}
                      title="Copy insight"
                    >
                      <Icon
                        name={copiedId === ins.id ? 'check' : 'copy'}
                        className="size-3.5"
                      />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(ins.id)}
                      disabled={deletingId === ins.id}
                      title="Delete insight"
                      className="text-danger hover:bg-danger-soft hover:text-danger"
                    >
                      <Icon name="trash" className="size-3.5" />
                    </Button>
                  </div>
                </div>

                {ins.citations.length > 0 && (
                  <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-line/60 pt-2.5">
                    <span className="text-[11px] font-medium text-muted">Sources:</span>
                    {ins.citations.map((c, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 rounded bg-surface-2 px-1.5 py-0.5 text-[11px] font-mono text-muted"
                      >
                        <span className="font-bold text-fg">[{c.source_label}]</span>
                        <span className="max-w-[10rem] truncate">{c.filename}</span>
                      </span>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
