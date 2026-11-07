'use client';

import React, { useState } from 'react';
import { CitationDTO } from '../lib/api';

interface GroundedMessageViewProps {
  content: string;
  role: 'user' | 'assistant' | 'system';
  citations?: CitationDTO[];
  suggestedFollowups?: string[];
  onSelectCitation: (citation: CitationDTO) => void;
  onSelectFollowup?: (prompt: string) => void;
}

export const GroundedMessageView: React.FC<GroundedMessageViewProps> = ({
  content,
  role,
  citations = [],
  suggestedFollowups = [],
  onSelectCitation,
  onSelectFollowup,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (role === 'user') {
    return (
      <div className="text-sm font-medium leading-relaxed whitespace-pre-wrap text-slate-900">
        {content}
      </div>
    );
  }

  // Parse inline text with bolding, code backticks, and [S1] citation badges
  const renderFormattedLine = (line: string, keyPrefix: string) => {
    // Split tokens by citations [S1], [S2] or bold **text** or code `code`
    const tokenRegex = /(\[S\d+\]|\*\*[^*]+\*\*|`[^`]+`)/g;
    const parts = line.split(tokenRegex);

    return parts.map((part, idx) => {
      const key = `${keyPrefix}-${idx}`;

      // 1. Citation Badge [S1]
      const citMatch = part.match(/^\[(S\d+)\]$/);
      if (citMatch) {
        const label = citMatch[1];
        const cit = citations.find(c => c.source_label === label);
        return (
          <button
            key={key}
            type="button"
            onClick={() => cit && onSelectCitation(cit)}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 rounded-md text-[11px] font-mono font-bold bg-cyan-500/20 hover:bg-cyan-500/35 text-cyan-300 hover:text-cyan-100 border border-cyan-500/40 hover:border-cyan-400 shadow-sm transition-all hover:scale-105 active:scale-95 cursor-pointer align-baseline"
            title={cit ? `Inspect proof in ${cit.filename} (Page ${cit.page_start || 1})` : `Citation ${label}`}
          >
            <span>[{label}]</span>
            {cit?.page_start && (
              <span className="text-[10px] text-cyan-400/80 font-sans font-normal">p.{cit.page_start}</span>
            )}
          </button>
        );
      }

      // 2. Bold text **text**
      if (part.startsWith('**') && part.endsWith('**')) {
        const boldText = part.slice(2, -2);
        return (
          <strong key={key} className="font-bold text-white tracking-tight">
            {boldText}
          </strong>
        );
      }

      // 3. Inline Code `code`
      if (part.startsWith('`') && part.endsWith('`')) {
        const codeText = part.slice(1, -1);
        return (
          <code key={key} className="px-1.5 py-0.5 rounded bg-slate-800 text-cyan-300 font-mono text-xs border border-slate-700/60">
            {codeText}
          </code>
        );
      }

      // 4. Plain text
      return <span key={key}>{part}</span>;
    });
  };

  // Parse structured blocks (headings, lists, paragraphs)
  const renderBody = () => {
    const rawParagraphs = content.split('\n\n');

    return rawParagraphs.map((para, pIdx) => {
      const trimmed = para.trim();
      if (!trimmed) return null;

      // Heading 3: ### ...
      if (trimmed.startsWith('### ')) {
        const headingText = trimmed.replace(/^###\s+/, '');
        return (
          <div key={`h3-${pIdx}`} className="pt-2 pb-1 border-b border-slate-800/80 mb-2">
            <h3 className="text-base font-bold text-cyan-300 flex items-center gap-2">
              <span className="w-1.5 h-3.5 bg-gradient-to-b from-cyan-400 to-teal-400 rounded-sm"></span>
              <span>{renderFormattedLine(headingText, `h3-${pIdx}`)}</span>
            </h3>
          </div>
        );
      }

      // Heading 2: ## ...
      if (trimmed.startsWith('## ')) {
        const headingText = trimmed.replace(/^##\s+/, '');
        return (
          <div key={`h2-${pIdx}`} className="pt-3 pb-1 border-b border-slate-800 mb-2">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span>{renderFormattedLine(headingText, `h2-${pIdx}`)}</span>
            </h2>
          </div>
        );
      }

      // Check if paragraph is a list of bullet points
      const lines = trimmed.split('\n');
      const isBulletList = lines.every(l => l.trim().startsWith('•') || l.trim().startsWith('-') || l.trim().startsWith('*') || l.trim().startsWith('• '));

      if (isBulletList) {
        return (
          <ul key={`ul-${pIdx}`} className="space-y-2.5 my-2">
            {lines.map((line, lIdx) => {
              const cleanLine = line.replace(/^[•\-*]\s*/, '').trim();
              return (
                <li key={`li-${pIdx}-${lIdx}`} className="flex items-start gap-2.5 text-xs sm:text-sm text-slate-200 leading-relaxed group">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-2 shrink-0 shadow-sm shadow-cyan-400/50 group-hover:scale-125 transition-transform" />
                  <div className="flex-1">{renderFormattedLine(cleanLine, `li-${pIdx}-${lIdx}`)}</div>
                </li>
              );
            })}
          </ul>
        );
      }

      // Regular paragraph
      return (
        <p key={`p-${pIdx}`} className="text-xs sm:text-sm text-slate-200 leading-relaxed">
          {renderFormattedLine(trimmed, `p-${pIdx}`)}
        </p>
      );
    });
  };

  return (
    <div className="space-y-4">
      {/* Top message action bar */}
      <div className="flex items-center justify-between border-b border-slate-800/60 pb-2 text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
          <span className="font-semibold text-slate-300">DocMind Grounded Synthesis</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-cyan-300 font-mono border border-slate-700/80">
            Zero Hallucination
          </span>
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-800/80 hover:bg-slate-700 text-[11px] text-slate-300 hover:text-white transition-colors cursor-pointer"
          title="Copy markdown answer"
        >
          <span>{copied ? '✓ Copied' : '📋 Copy'}</span>
        </button>
      </div>

      {/* Message content body */}
      <div className="space-y-3">{renderBody()}</div>

      {/* Verified Source Citations Drawer Strip */}
      {citations && citations.length > 0 && (
        <div className="pt-3.5 border-t border-slate-800/80 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <span>🛡️</span> Verified Ground-Truth Citations:
            </span>
            <span className="text-[10px] text-cyan-400 font-mono">
              {citations.length} Source Passages
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {citations.map((cit, idx) => (
              <button
                key={cit.citation_id || `${cit.source_label}-${idx}`}
                onClick={() => onSelectCitation(cit)}
                className="p-2.5 rounded-xl bg-slate-950/70 hover:bg-cyan-950/30 border border-slate-800 hover:border-cyan-500/50 text-left transition-all group flex flex-col justify-between gap-1 shadow-sm active:scale-[0.98] cursor-pointer"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-mono font-bold text-[10px] border border-cyan-500/30 shrink-0">
                      [{cit.source_label}]
                    </span>
                    <span className="text-xs font-semibold text-slate-200 group-hover:text-cyan-300 transition-colors truncate">
                      {cit.filename}
                    </span>
                  </div>
                  {cit.page_start && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-900 text-slate-400 font-mono shrink-0">
                      Page {cit.page_start}
                    </span>
                  )}
                </div>
                {cit.excerpt && (
                  <p className="text-[11px] text-slate-400 font-mono truncate line-clamp-1 italic">
                    &ldquo;{cit.excerpt.slice(0, 90)}...&rdquo;
                  </p>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Suggested Follow-up Chips */}
      {suggestedFollowups && suggestedFollowups.length > 0 && (
        <div className="pt-3 border-t border-slate-800/80 space-y-2">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            <span className="text-cyan-400">⚡</span>
            <span>Suggested Inquiries (1-Click):</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {suggestedFollowups.map((followup, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => onSelectFollowup?.(followup)}
                className="px-3 py-1.5 rounded-xl bg-slate-900/90 hover:bg-cyan-500/15 hover:border-cyan-500/50 text-xs text-slate-300 hover:text-cyan-200 border border-slate-800 transition-all text-left flex items-center gap-2 cursor-pointer shadow-sm active:scale-95 group"
              >
                <span className="text-cyan-400 group-hover:translate-x-0.5 transition-transform text-xs">→</span>
                <span>{followup}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
