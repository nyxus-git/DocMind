'use client';

import React, { useState } from 'react';
import { ApiClient, CompareResponse } from '../../../lib/api';
import { formatBytes } from '../../../lib/format';
import { Button, inputClass, Spinner } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { useToast } from '../../ui/Toast';
import { EmptyState, PageHeader, Panel } from '../parts';
import { CiteMarker } from '../RichText';
import { useWorkspace } from '../WorkspaceContext';

const TOPICS = ['Limitation of liability', 'Service levels and uptime', 'Payment terms', 'Termination and renewal', 'Data protection'];

export function CompareView() {
  const { documents, documentsLoaded, openCitation, setTab, canAsk, handleApiError } = useWorkspace();
  const toast = useToast();

  const ready = documents.filter(d => d.status === 'READY');
  const [selected, setSelected] = useState<string[]>([]);
  const [topic, setTopic] = useState('');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CompareResponse | null>(null);
  const [copied, setCopied] = useState(false);

  const toggle = (id: string) =>
    setSelected(prev => (prev.includes(id) ? prev.filter(x => x !== id) : prev.length >= 5 ? prev : [...prev, id]));

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      setResult(await ApiClient.compareDocuments(selected, topic.trim() || undefined));
    } catch (err) {
      if (!handleApiError(err)) setError(err instanceof Error ? err.message : 'The comparison could not be completed.');
    } finally {
      setRunning(false);
    }
  };

  const docNames = result ? Array.from(new Set(result.matrix.flatMap(m => Object.keys(m.per_document_values)))) : [];

  const copyMarkdown = async () => {
    if (!result) return;
    const header = `| Attribute | ${docNames.join(' | ')} | Key differences | Sources |\n| --- | ${docNames.map(() => '---').join(' | ')} | --- | --- |`;
    const rows = result.matrix
      .map(m => {
        const vals = docNames.map(d => m.per_document_values[d] || 'Not specified').join(' | ');
        return `| **${m.attribute}** | ${vals} | ${m.differences_summary} | ${(m.source_labels || []).join(', ') || 'None'} |`;
      })
      .join('\n');
    const md = `# Document comparison${topic ? `: ${topic}` : ''}\n\n${result.narrative_summary}\n\n${header}\n${rows}\n${result.limitations ? `\n**Limitations:** ${result.limitations}\n` : ''}`;
    try {
      await navigator.clipboard.writeText(md);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast('Copy was blocked by the browser. Select the table and copy it manually.', 'error');
    }
  };

  return (
    <div>
      <PageHeader
        title="Compare"
        description="Choose two to five documents and a topic. DocMind lays the matching passages side by side and flags the differences."
        actions={
          result && (
            <Button variant="secondary" onClick={copyMarkdown}>
              <Icon name={copied ? 'check' : 'copy'} />
              {copied ? 'Copied' : 'Copy as Markdown'}
            </Button>
          )
        }
      />

      {documentsLoaded && ready.length < 2 ? (
        <EmptyState
          icon="compare"
          title="You need at least two ready documents"
          body={ready.length === 0 ? 'Upload two or more documents and wait for them to finish processing.' : 'Upload one more document to compare it with the one you have.'}
          action={<Button onClick={() => setTab('library')}>Go to library</Button>}
        />
      ) : (
        <>
          <Panel className="p-5 sm:p-6">
            <div className="flex items-baseline justify-between">
              <h2 className="text-base font-semibold">1. Choose documents</h2>
              <span className={`tabular text-sm ${selected.length >= 2 ? 'text-ok' : 'text-muted'}`}>{selected.length} of 5 selected</span>
            </div>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {ready.map(d => {
                const on = selected.includes(d.id);
                const full = !on && selected.length >= 5;
                return (
                  <li key={d.id}>
                    <label
                      className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-3 transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-fg ${
                        on ? 'border-fg bg-bg ring-1 ring-fg' : 'border-line hover:bg-surface-2'
                      } ${full ? 'cursor-not-allowed opacity-50' : ''}`}
                    >
                      <input type="checkbox" checked={on} disabled={full} onChange={() => toggle(d.id)} className="sr-only" />
                      <span
                        className={`inline-flex size-5 shrink-0 items-center justify-center rounded-md border ${on ? 'border-brand bg-brand text-brand-fg' : 'border-line-strong'}`}
                        aria-hidden="true"
                      >
                        {on && <Icon name="check" className="size-3.5" strokeWidth={2.6} />}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{d.filename}</span>
                        <span className="block text-[13px] text-muted">
                          {d.page_count ? `${d.page_count} pages • ` : ''}
                          {formatBytes(d.size_bytes)}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>

            <h2 className="mt-7 text-base font-semibold">2. Choose a topic</h2>
            <label htmlFor="topic" className="sr-only">
              Topic to compare
            </label>
            <input
              id="topic"
              value={topic}
              onChange={e => setTopic(e.target.value)}
              placeholder="For example: limitation of liability"
              className={`${inputClass} mt-3`}
            />
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {TOPICS.map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTopic(t)}
                  className="rounded-full bg-surface-2 px-3 py-1 text-[13px] text-muted transition-colors hover:text-fg"
                >
                  {t}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[13px] text-faint">Leave the topic empty for a general comparison.</p>

            <div className="mt-6 flex items-center gap-3">
              <Button size="lg" onClick={run} disabled={running || selected.length < 2 || !canAsk}>
                {running && <Spinner />}
                {running ? 'Comparing' : 'Compare documents'}
              </Button>
              {selected.length < 2 && <span className="text-sm text-muted">Select at least two documents.</span>}
              {!canAsk && <span className="text-sm text-muted">Viewers cannot run comparisons.</span>}
            </div>
          </Panel>

          {error && (
            <p role="alert" className="mt-5 flex items-start gap-2.5 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
              <Icon name="alert" className="mt-0.5 size-4" /> {error}
            </p>
          )}

          {result && (
            <div className="mt-8 space-y-5">
              <Panel className="p-5 sm:p-6">
                <h2 className="text-base font-semibold">Summary</h2>
                <p className="mt-2 max-w-3xl text-[15px] leading-7">{result.narrative_summary}</p>
              </Panel>

              {result.limitations && (
                <p className="flex items-start gap-2.5 rounded-xl bg-warn-soft px-4 py-3 text-sm leading-6 text-warn">
                  <Icon name="alert" className="mt-0.5 size-4" /> {result.limitations}
                </p>
              )}

              <Panel className="scroll-thin overflow-x-auto">
                <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
                  <caption className="sr-only">Comparison of {docNames.join(', ')}</caption>
                  <thead>
                    <tr className="border-b border-line bg-surface-2/60">
                      <th scope="col" className="w-40 px-4 py-3 font-medium text-faint">
                        Topic
                      </th>
                      {docNames.map(n => (
                        <th key={n} scope="col" className="px-4 py-3 font-semibold">
                          <span className="block max-w-[14rem] truncate" title={n}>
                            {n}
                          </span>
                        </th>
                      ))}
                      <th scope="col" className="px-4 py-3 font-semibold">
                        Key differences
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.matrix.map((row, i) => (
                      <tr key={i} className="border-b border-line align-top last:border-b-0">
                        <th scope="row" className="px-4 py-4 text-left font-semibold">
                          {row.attribute}
                        </th>
                        {docNames.map(n => (
                          <td key={n} className="px-4 py-4 leading-6">
                            {row.per_document_values[n] || <span className="text-faint">Not specified</span>}
                          </td>
                        ))}
                        <td className="px-4 py-4 leading-6">
                          {row.differences_summary}
                          {row.source_labels?.map(l => (
                            <CiteMarker key={l} label={l} citation={result.citations?.find(c => c.source_label === l)} onOpen={openCitation} />
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Panel>

              {result.citations && result.citations.length > 0 && (
                <section aria-labelledby="evidence">
                  <h2 id="evidence" className="mb-3 text-base font-semibold">
                    Sources
                  </h2>
                  <ul className="grid gap-3 md:grid-cols-2">
                    {result.citations.map(c => (
                      <li key={c.citation_id || c.source_label}>
                        <button
                          type="button"
                          onClick={() => openCitation(c)}
                          className="flex h-full w-full flex-col rounded-xl border border-line bg-surface p-4 text-left transition-colors hover:border-line-strong hover:bg-surface-2"
                        >
                          <span className="flex items-center gap-2 text-sm font-medium">
                            <span className="inline-flex min-w-[1.3rem] justify-center rounded-[5px] bg-brand px-1 text-[11px] font-semibold leading-[1.3rem] text-brand-fg">
                              {c.source_label.replace(/^S/i, '')}
                            </span>
                            <span className="truncate">{c.filename}</span>
                            {c.page_start && <span className="tabular ml-auto shrink-0 text-[13px] text-muted">p. {c.page_start}</span>}
                          </span>
                          <span className="mt-2 line-clamp-3 font-serif text-[14px] leading-6 text-muted">&ldquo;{c.excerpt}&rdquo;</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
