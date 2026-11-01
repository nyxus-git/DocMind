'use client';

import React from 'react';
import { UsageSummaryDTO } from '../lib/api';

interface NavbarProps {
  usage?: UsageSummaryDTO | null;
  onOpenUpload: () => void;
  activeWorkspaceName?: string;
}

export const Navbar: React.FC<NavbarProps> = ({
  usage,
  onOpenUpload,
  activeWorkspaceName = 'Personal Workspace'
}) => {
  const percentQuestions = usage ? Math.round((usage.questions_used / usage.questions_limit) * 100) : 0;
  const storageMbUsed = usage ? (usage.storage_bytes / (1024 * 1024)).toFixed(1) : '0';
  const storageMbLimit = usage ? (usage.storage_limit_bytes / (1024 * 1024)).toFixed(0) : '200';

  return (
    <header className="h-16 border-b border-slate-800 bg-slate-950/80 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-30">
      {/* Brand & Workspace */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-500 to-teal-400 flex items-center justify-center font-bold text-slate-950 shadow-lg shadow-cyan-500/20">
            D
          </div>
          <span className="font-semibold text-lg tracking-tight text-white flex items-center gap-1.5">
            DocMind
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 font-mono border border-cyan-500/20">
              v1.0
            </span>
          </span>
        </div>

        <div className="h-4 w-px bg-slate-800" />

        <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-full">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>{activeWorkspaceName}</span>
        </div>
      </div>

      {/* Usage Indicators & Actions */}
      <div className="flex items-center gap-4">
        {usage && (
          <div className="hidden md:flex items-center gap-4 text-xs font-medium text-slate-400">
            {/* Storage Metric */}
            <div className="flex items-center gap-1.5 bg-slate-900/60 border border-slate-800/80 px-2.5 py-1 rounded-md">
              <span className="text-slate-500">Storage:</span>
              <span className="text-slate-200">{storageMbUsed} / {storageMbLimit} MB</span>
            </div>

            {/* Questions Metric */}
            <div className="flex items-center gap-2 bg-slate-900/60 border border-slate-800/80 px-2.5 py-1 rounded-md">
              <span className="text-slate-500">Q&A:</span>
              <span className="text-slate-200">{usage.questions_used} / {usage.questions_limit}</span>
              <div className="w-12 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-cyan-400 to-teal-400 rounded-full"
                  style={{ width: `${Math.min(100, percentQuestions)}%` }}
                />
              </div>
            </div>
          </div>
        )}

        <button
          onClick={onOpenUpload}
          className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-teal-400 hover:from-cyan-400 hover:to-teal-300 text-slate-950 font-medium text-sm transition-all shadow-md shadow-cyan-500/10 active:scale-95"
        >
          <svg className="w-4 h-4 shrink-0" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          <span>Upload File</span>
        </button>
      </div>
    </header>
  );
};
