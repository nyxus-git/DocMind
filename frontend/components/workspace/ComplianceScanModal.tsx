'use client';

import React, { useState } from 'react';
import { DocumentComplianceScanResponse } from '../../lib/api';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/Toast';

interface ComplianceScanModalProps {
  open: boolean;
  onClose: () => void;
  scan: DocumentComplianceScanResponse | null;
  loading: boolean;
  filename: string;
}

export function ComplianceScanModal({
  open,
  onClose,
  scan,
  loading,
  filename,
}: ComplianceScanModalProps) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  const getRiskTone = (level: string) => {
    switch (level) {
      case 'CRITICAL':
        return 'bg-danger-soft text-danger border-danger/30';
      case 'HIGH':
        return 'bg-danger-soft text-danger border-danger/30';
      case 'MEDIUM':
        return 'bg-warn-soft text-warn border-warn/30';
      case 'LOW':
        return 'bg-surface-2 text-fg border-line';
      case 'CLEAN':
      default:
        return 'bg-ok-soft text-ok border-ok/30';
    }
  };

  const exportReport = async () => {
    if (!scan) return;
    const md = [
      `# Compliance & Security Audit Report`,
      `**Document:** ${scan.filename}`,
      `**Risk Score:** ${scan.risk_score} / 100 (${scan.risk_level})`,
      `**Chunks Scanned:** ${scan.scanned_chunks}`,
      `**Findings:** ${scan.findings_count}`,
      '',
      `## Detected Sensitive Entities & PII`,
      scan.findings.length === 0
        ? 'No sensitive data detected. Document is clean.'
        : scan.findings
            .map(
              f =>
                `- **[${f.severity}] ${f.label}** (Page ${f.page || 'N/A'}): \`${f.redacted_snippet}\``,
            )
            .join('\n'),
      '',
      `## Compliance Recommendations`,
      scan.recommendations.map(r => `- ${r}`).join('\n'),
    ].join('\n');

    try {
      await navigator.clipboard.writeText(md);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast('Audit report copied to clipboard.', 'success');
    } catch {
      toast('Failed to copy to clipboard.', 'error');
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Security & Compliance Scanner"
      width="max-w-2xl"
    >
      <div className="space-y-6 py-2">
        <div className="flex flex-col gap-2 border-b border-line pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-fg">{filename}</p>
            <p className="text-xs text-muted">
              Deep regex &amp; Luhn heuristic inspection for Credentials, PII, and Financial Data.
            </p>
          </div>
          {scan && (
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${getRiskTone(
                  scan.risk_level,
                )}`}
              >
                <Icon
                  name={scan.risk_level === 'CLEAN' ? 'check' : 'shield'}
                  className="size-3.5"
                />
                {scan.risk_level} RISK ({scan.risk_score}/100)
              </span>
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <span className="size-6 animate-spin rounded-full border-2 border-brand border-t-transparent" />
            <p className="mt-3 text-sm text-muted">Scanning document chunks for sensitive data...</p>
          </div>
        ) : !scan ? (
          <p className="py-8 text-center text-sm text-muted">Could not retrieve scan results.</p>
        ) : (
          <div className="space-y-6">
            {/* Score bar */}
            <div>
              <div className="flex justify-between text-xs font-medium text-muted">
                <span>Security Risk Score</span>
                <span className="font-semibold text-fg">{scan.risk_score} / 100</span>
              </div>
              <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-surface-2">
                <div
                  className={`h-full transition-all duration-500 ${
                    scan.risk_score > 70
                      ? 'bg-danger'
                      : scan.risk_score > 30
                        ? 'bg-warn'
                        : scan.risk_score > 0
                          ? 'bg-brand'
                          : 'bg-ok'
                  }`}
                  style={{ width: `${Math.max(5, scan.risk_score)}%` }}
                />
              </div>
            </div>

            {/* Findings list */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
                Flagged Sensitive Items ({scan.findings_count})
              </h3>
              {scan.findings.length === 0 ? (
                <div className="mt-2 rounded-xl border border-ok/30 bg-ok-soft p-4 text-center">
                  <Icon name="check" className="mx-auto size-5 text-ok" />
                  <p className="mt-1 text-sm font-medium text-ok">No sensitive data detected</p>
                  <p className="text-xs text-muted">
                    Scanned {scan.scanned_chunks} document chunks. No API keys, credentials, or government IDs found.
                  </p>
                </div>
              ) : (
                <ul className="mt-2 divide-y divide-line rounded-xl border border-line bg-surface-1">
                  {scan.findings.map((f, i) => (
                    <li key={i} className="flex flex-col gap-1 p-3.5 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase ${
                              f.severity === 'CRITICAL' || f.severity === 'HIGH'
                                ? 'bg-danger-soft text-danger'
                                : f.severity === 'MEDIUM'
                                  ? 'bg-warn-soft text-warn'
                                  : 'bg-surface-2 text-muted'
                            }`}
                          >
                            {f.severity}
                          </span>
                          <span className="text-xs font-semibold text-fg">{f.label}</span>
                          {f.page && (
                            <span className="text-[11px] text-muted">p. {f.page}</span>
                          )}
                        </div>
                        <p className="mt-1 font-mono text-xs text-muted">
                          Matched: <code className="text-fg">{f.redacted_snippet}</code>
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Recommendations */}
            {scan.recommendations.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Recommendations</h3>
                <ul className="mt-2 space-y-1.5 text-xs text-muted">
                  {scan.recommendations.map((r, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <Icon name="check" className="mt-0.5 size-3.5 shrink-0 text-brand" />
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex justify-end gap-2 border-t border-line pt-4">
              <Button variant="secondary" onClick={onClose}>
                Close
              </Button>
              <Button variant="secondary" onClick={exportReport}>
                <Icon name={copied ? 'check' : 'copy'} className="size-3.5" />
                <span>{copied ? 'Copied' : 'Copy Audit Report'}</span>
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
