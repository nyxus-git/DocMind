'use client';

import React from 'react';
import { Modal } from '../ui/Modal';
import { Icon } from '../ui/Icon';

interface KeyboardShortcutsModalProps {
  open: boolean;
  onClose: () => void;
}

export function KeyboardShortcutsModal({ open, onClose }: KeyboardShortcutsModalProps) {
  const shortcuts = [
    { key: '⌘ / Ctrl + K', description: 'Global deep search across all documents' },
    { key: '?', description: 'Open this keyboard shortcuts & pro tips cheat sheet' },
    { key: '1 - 6', description: 'Quick jump between workspace views' },
    { key: 'Esc', description: 'Close any active modal, drawer, or reader' },
  ];

  const proTips = [
    {
      title: 'Zero-Hallucination Citations',
      desc: 'DocMind strictly grounds all claims using numbered tags like [S1]. Click any citation to inspect verbatim source text and page numbers.',
    },
    {
      title: 'Focus Modes',
      desc: 'Switch between Strict Compliance, Executive Brief, Legal Risk, or Technical Deep-Dive in chat to tailor the answer structure.',
    },
    {
      title: 'Multi-Document Comparison',
      desc: 'Select up to 5 documents in Compare to generate a side-by-side difference matrix on liability, uptime, or pricing.',
    },
  ];

  return (
    <Modal open={open} onClose={onClose} title="Keyboard Shortcuts & Pro Tips">
      <div className="space-y-6 py-2">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Keyboard Navigation</h3>
          <dl className="mt-3 divide-y divide-line rounded-xl border border-line bg-surface-1">
            {shortcuts.map(s => (
              <div key={s.key} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <dt className="text-muted">{s.description}</dt>
                <dd>
                  <kbd className="rounded-md border border-line bg-surface-2 px-2 py-0.5 font-mono text-xs font-semibold text-fg">
                    {s.key}
                  </kbd>
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Enterprise Pro Tips</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {proTips.map(t => (
              <div key={t.title} className="rounded-xl border border-line bg-surface-1 p-3.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-fg">
                  <Icon name="sparkles" className="size-3.5 text-brand" />
                  <span>{t.title}</span>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-muted">{t.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

