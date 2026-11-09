'use client';

import React from 'react';
import { CitationDTO } from '../../lib/api';

/** Small marker that opens the source it points to. Matches the numbered markers on the marketing page. */
export function CiteMarker({
  label,
  citation,
  onOpen,
}: {
  label: string;
  citation?: CitationDTO;
  onOpen?: (c: CitationDTO) => void;
}) {
  const n = label.replace(/^S/i, '');
  if (!citation || !onOpen) {
    return (
      <span className="mx-0.5 inline-flex min-w-[1.2rem] translate-y-[-0.1em] items-center justify-center rounded-[5px] bg-surface-2 px-1 text-[11px] font-semibold leading-[1.2rem] text-muted">
        {n}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onOpen(citation)}
      title={`${citation.filename}${citation.page_start ? `, page ${citation.page_start}` : ''}`}
      aria-label={`Open source ${n}: ${citation.filename}${citation.page_start ? `, page ${citation.page_start}` : ''}`}
      className="mx-0.5 inline-flex min-w-[1.2rem] translate-y-[-0.1em] items-center justify-center rounded-[5px] bg-brand px-1 text-[11px] font-semibold leading-[1.2rem] text-brand-fg transition-colors hover:bg-mark hover:text-[#1a1400]"
    >
      {n}
    </button>
  );
}

const CITE_RE = /\[(S\d+(?:\s*,\s*S\d+)*)\]/g;
const TOKEN_RE = /(\*\*[^*]+\*\*|\[S\d+(?:\s*,\s*S\d+)*\])/g;

function renderInline(
  text: string,
  citations: CitationDTO[],
  onCite: ((c: CitationDTO) => void) | undefined,
  keyPrefix: string,
): React.ReactNode[] {
  return text.split(TOKEN_RE).map((part, i) => {
    if (!part) return null;
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={`${keyPrefix}-${i}`} className="font-semibold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    CITE_RE.lastIndex = 0;
    const m = CITE_RE.exec(part);
    if (m && m[0] === part) {
      return (
        <React.Fragment key={`${keyPrefix}-${i}`}>
          {m[1].split(/\s*,\s*/).map(label => (
            <CiteMarker key={label} label={label} citation={citations.find(c => c.source_label === label)} onOpen={onCite} />
          ))}
        </React.Fragment>
      );
    }
    return <React.Fragment key={`${keyPrefix}-${i}`}>{part}</React.Fragment>;
  });
}

const LIST_RE = /^\s*([-*•]|\d+[.)])\s+/;

/** Minimal renderer for assistant answers: paragraphs, lists, bold, tables and clickable citation markers. */
export function RichText({
  content,
  citations,
  onCite,
}: {
  content: string;
  citations: CitationDTO[];
  onCite?: (c: CitationDTO) => void;
}) {
  const blocks = content.trim().split(/\n{2,}/);
  return (
    <div className="space-y-3 text-[15px] leading-7">
      {blocks.map((block, bi) => {
        const lines = block.split('\n').filter(l => l.trim().length > 0);
        if (lines.length === 0) return null;

        if (lines.every(l => l.trim().startsWith('|'))) {
          const rows = lines.filter(l => !/^[\s|:-]+$/.test(l));
          const cells = rows.map(r =>
            r
              .trim()
              .replace(/^\||\|$/g, '')
              .split('|')
              .map(c => c.trim()),
          );
          const [head, ...body] = cells;
          return (
            <div key={bi} className="scroll-thin overflow-x-auto rounded-lg border border-line">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="bg-surface-2/60">
                  <tr>
                    {head.map((h, i) => (
                      <th key={i} className="px-3 py-2 font-semibold">
                        {renderInline(h, citations, onCite, `h${bi}-${i}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {body.map((r, ri) => (
                    <tr key={ri} className="border-t border-line align-top">
                      {r.map((c, ci) => (
                        <td key={ci} className="px-3 py-2">
                          {renderInline(c, citations, onCite, `c${bi}-${ri}-${ci}`)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        // Group consecutive lines into list runs and plain-text runs, so a sentence followed
        // directly by bullets renders as a paragraph and a list.
        const groups: { list: boolean; lines: string[] }[] = [];
        lines.forEach(l => {
          const isList = LIST_RE.test(l);
          const last = groups[groups.length - 1];
          if (last && last.list === isList) last.lines.push(l);
          else groups.push({ list: isList, lines: [l] });
        });

        return (
          <div key={bi} className="space-y-2">
            {groups.map((g, gi) => {
              if (g.list) {
                const ordered = /^\s*\d/.test(g.lines[0]);
                const Tag = ordered ? 'ol' : 'ul';
                return (
                  <Tag key={gi} className={`space-y-1.5 pl-5 ${ordered ? 'list-decimal' : 'list-disc'} marker:text-faint`}>
                    {g.lines.map((l, li) => (
                      <li key={li}>{renderInline(l.replace(LIST_RE, ''), citations, onCite, `l${bi}-${gi}-${li}`)}</li>
                    ))}
                  </Tag>
                );
              }
              return (
                <p key={gi}>
                  {g.lines.map((l, li) => (
                    <React.Fragment key={li}>
                      {li > 0 && <br />}
                      {renderInline(l, citations, onCite, `p${bi}-${gi}-${li}`)}
                    </React.Fragment>
                  ))}
                </p>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
