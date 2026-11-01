'use client';

import React from 'react';
import { CitationDTO } from '../lib/api';

interface CitationDrawerProps {
  citation: CitationDTO | null;
  onClose: () => void;
  onOpenDocument?: (docId: string) => void;
}

export const CitationDrawer: React.FC<CitationDrawerProps> = ({
  citation,
  onClose,
  onOpenDocument
}) => {
  if (!citation) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
        <div className="flex items-center gap-2.5">
          <span className="px-2.5 py-1 rounded bg-cyan-500/20 text-cyan-400 font-mono font-bold text-xs border border-cyan-500/30">
            {citation.source_label}
          </span>
          <div>
            <h3 className="text-sm font-semibold text-slate-100">Verified Evidence Source</h3>
            <p className="text-[11px] text-slate-400">Server-authenticated citation provenance</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
        >
          ✕
        </button>
      </div>

      {/* Body */}
      <div className="p-6 space-y-6 overflow-y-auto flex-1">
        {/* Source Document Card */}
        <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">📄</span>
            <div className="truncate">
              <p className="text-xs text-slate-400">Source Document</p>
              <p className="text-sm font-medium text-slate-100 truncate">{citation.filename}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-slate-800/80">
            <div>
              <span className="text-slate-400">Page Reference:</span>
              <p className="text-slate-200 font-mono font-medium">
                {citation.page_start ? `Page ${citation.page_start}` : 'Header / Section'}
              </p>
            </div>
            <div>
              <span className="text-slate-400">Section Hierarchy:</span>
              <p className="text-slate-200 truncate font-medium">
                {citation.section || 'General Content'}
              </p>
            </div>
          </div>
        </div>

        {/* Verbatim Excerpt */}
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-2">
            Verbatim Grounding Excerpt
          </label>
          <div className="p-4 rounded-xl bg-slate-950/90 border border-slate-800 text-sm leading-relaxed text-slate-300 font-serif italic selection:bg-cyan-500/30">
            "{citation.excerpt}"
          </div>
        </div>

        {citation.is_source_deleted && (
          <div className="p-3 rounded-lg bg-amber-950/40 border border-amber-800/60 text-xs text-amber-300 flex items-center gap-2">
            <span>⚠️</span>
            <span>The source document for this historical citation has been deleted.</span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex justify-end">
        {onOpenDocument && (
          <button
            onClick={() => onOpenDocument(citation.document_id)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors"
          >
            <svg className="w-4 h-4 shrink-0" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            <span>View Document Details</span>
          </button>
        )}
      </div>
    </div>
  );
};
