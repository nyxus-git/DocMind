'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ApiClient,
  ApiError,
  CitationDTO,
  ConversationDTO,
  DocumentDTO,
  DocumentSummaryResponse,
  EmployeePortalInfoDTO,
  MessageDTO,
} from '../../lib/api';
import { establishSession } from '../../lib/auth-flow';
import { formatBytes, formatDate, timeAgo } from '../../lib/format';
import { clearSession, readRawSession, UserSession } from '../../lib/session';
import { Button, inputClass, Spinner } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { Logo } from '../ui/Logo';
import { Modal } from '../ui/Modal';
import { ThemeToggle } from '../ui/ThemeToggle';
import { ToastProvider, useToast } from '../ui/Toast';
import { CitationDrawer } from '../workspace/CitationDrawer';
import { RichText } from '../workspace/RichText';
import { FileTypeIcon, Panel, StatusBadge } from '../workspace/parts';

interface ChatMessage extends MessageDTO {
  insufficient?: boolean;
  followups?: string[];
  error?: boolean;
}

const DEFAULT_PROMPTS = [
  'What key policies or guidelines apply to employees?',
  'Summarize the main rules, limits, and timelines.',
  'What are the important terms I should know first?',
];

const subscribeStorage = (cb: () => void) => {
  window.addEventListener('storage', cb);
  return () => window.removeEventListener('storage', cb);
};

function PendingApprovalScreen({
  companyName,
  email,
  onSignOut,
  onRefresh,
}: {
  companyName: string;
  email: string;
  onSignOut: () => void;
  onRefresh: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg px-4 text-fg">
      <Panel className="w-full max-w-md p-6 text-center sm:p-8">
        <div className="mx-auto mb-4 inline-flex size-12 items-center justify-center rounded-full bg-warn-soft text-warn">
          <Icon name="clock" className="size-6" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight">Waiting for Admin Approval</h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          Your employee account <strong className="text-fg">{email}</strong> has requested access to{' '}
          <strong className="text-fg">{companyName}</strong>. Once your Company Admin approves your request, refresh below to enter the portal.
        </p>
        <div className="mt-6 space-y-2.5">
          <Button className="w-full" onClick={onRefresh}>
            <Icon name="retry" /> Check Approval Status
          </Button>
          <Button variant="ghost" className="w-full" onClick={onSignOut}>
            Sign out
          </Button>
        </div>
      </Panel>
    </div>
  );
}

function EmployeePortalInner({ session }: { session: UserSession }) {
  const router = useRouter();
  const toast = useToast();

  const [portalTab, setPortalTab] = useState<'ask' | 'docs'>('ask');
  const [portalInfo, setPortalInfo] = useState<EmployeePortalInfoDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedSpaceId, setSelectedSpaceId] = useState<string>('');
  const [documents, setDocuments] = useState<DocumentDTO[]>([]);
  const [conversations, setConversations] = useState<ConversationDTO[]>([]);

  // Chat state
  const [convId, setConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingConv, setLoadingConv] = useState(false);
  const [citation, setCitation] = useState<CitationDTO | null>(null);

  // Docs search + summary
  const [docSearch, setDocSearch] = useState('');
  const [summaryFor, setSummaryFor] = useState<DocumentDTO | null>(null);
  const [summary, setSummary] = useState<DocumentSummaryResponse | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const endRef = useRef<HTMLDivElement>(null);
  const idCounter = useRef(0);

  const signOut = useCallback(async () => {
    await ApiClient.logout();
    clearSession();
    router.replace('/login/');
  }, [router]);

  const handleErr = useCallback(
    (err: unknown, fallback: string) => {
      if (err instanceof ApiError && err.status === 401) {
        void signOut();
        return;
      }
      toast(err instanceof Error ? err.message : fallback, 'error');
    },
    [signOut, toast],
  );

  const loadPortal = useCallback(async () => {
    try {
      const info = await ApiClient.getEmployeePortalInfo();
      setPortalInfo(info);
      if (info.role === 'PENDING' || !info.workspace_id) {
        setLoading(false);
        return;
      }
      const [docs, convs] = await Promise.all([
        ApiClient.listDocuments(undefined, undefined, selectedSpaceId || undefined),
        ApiClient.listConversations(),
      ]);
      setDocuments(docs);
      setConversations(convs);
    } catch (err) {
      handleErr(err, 'Failed to load company knowledge portal.');
    } finally {
      setLoading(false);
    }
  }, [handleErr, selectedSpaceId]);

  useEffect(() => {
    const t = setTimeout(() => {
      void loadPortal();
    }, 0);
    return () => clearTimeout(t);
  }, [loadPortal]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, sending]);

  const recheckApproval = async () => {
    const refreshed = await establishSession(session.email, session.fullName);
    if (refreshed.workspaceId) {
      window.location.reload();
    } else {
      toast('Still waiting for Company Admin approval.', 'info');
    }
  };

  if (!loading && portalInfo && (portalInfo.role === 'PENDING' || !portalInfo.workspace_id)) {
    return (
      <PendingApprovalScreen
        companyName={portalInfo.pending_company_name || portalInfo.company_name}
        email={session.email}
        onSignOut={() => void signOut()}
        onRefresh={() => void recheckApproval()}
      />
    );
  }

  if (!session.workspaceId && session.pendingJoinCompany) {
    return (
      <PendingApprovalScreen
        companyName={session.pendingJoinCompany.companyName}
        email={session.email}
        onSignOut={() => void signOut()}
        onRefresh={() => void recheckApproval()}
      />
    );
  }

  const readyDocs = documents.filter(d => d.status === 'READY');
  const starterPrompts = portalInfo?.starter_prompts?.length ? portalInfo.starter_prompts : DEFAULT_PROMPTS;
  const isCompanyAdmin = portalInfo?.role === 'OWNER' || portalInfo?.role === 'ADMIN';
  const canContributorWorkspace = portalInfo?.role === 'OWNER' || portalInfo?.role === 'ADMIN' || portalInfo?.role === 'MEMBER';

  const openConversation = async (id: string) => {
    setLoadingConv(true);
    try {
      const conv = await ApiClient.getConversation(id);
      setConvId(conv.id);
      setMessages((conv.messages ?? []) as ChatMessage[]);
      setPortalTab('ask');
    } catch (err) {
      handleErr(err, 'Could not load conversation.');
    } finally {
      setLoadingConv(false);
    }
  };

  const sendQuestion = async (text?: string, docIdsOverride?: string[]) => {
    const question = (text ?? input).trim();
    if (!question || sending) return;
    setInput('');
    setSending(true);
    setPortalTab('ask');

    const now = new Date().toISOString();
    setMessages(prev => [
      ...prev,
      { id: `u-${++idCounter.current}`, conversation_id: convId ?? '', role: 'user', content: question, status: 'completed', citations: [], created_at: now },
    ]);

    try {
      let id = convId;
      if (!id) {
        const conv = await ApiClient.createConversation(question.length > 60 ? `${question.slice(0, 57)}...` : question);
        id = conv.id;
        setConvId(id);
      }
      const res = await ApiClient.sendMessage(id, question, docIdsOverride, selectedSpaceId || undefined);
      setMessages(prev => [
        ...prev,
        {
          id: res.message_id,
          conversation_id: id as string,
          role: 'assistant',
          content: res.content,
          status: 'completed',
          citations: res.citations ?? [],
          insufficient: res.insufficient_evidence,
          followups: res.suggested_followups,
          created_at: res.created_at,
        },
      ]);
      setConversations(await ApiClient.listConversations());
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong.';
      setMessages(prev => [
        ...prev,
        { id: `e-${++idCounter.current}`, conversation_id: convId ?? '', role: 'assistant', content: msg, status: 'failed', citations: [], error: true, created_at: new Date().toISOString() },
      ]);
    } finally {
      setSending(false);
    }
  };

  const giveFeedback = async (msgId: string, rating: 1 | -1) => {
    if (!convId) return;
    setMessages(prev => prev.map(m => (m.id === msgId ? { ...m, user_feedback: rating } : m)));
    try {
      await ApiClient.submitMessageFeedback(convId, msgId, rating);
      toast(rating === 1 ? 'Marked as helpful.' : 'Feedback sent to Company Admins.', 'success');
    } catch (err) {
      handleErr(err, 'Could not submit feedback.');
    }
  };

  const openSummary = async (doc: DocumentDTO) => {
    setSummaryFor(doc);
    setSummary(null);
    setSummaryError(null);
    try {
      setSummary(await ApiClient.getDocumentSummary(doc.id));
    } catch (err) {
      setSummaryError(err instanceof Error ? err.message : 'Could not summarize this document.');
    }
  };

  const filteredDocs = documents.filter(
    d =>
      !docSearch ||
      d.filename.toLowerCase().includes(docSearch.toLowerCase()) ||
      (d.space_name || '').toLowerCase().includes(docSearch.toLowerCase()),
  );

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-bg text-fg">
      <header className="shrink-0 border-b border-line bg-bg/95 px-4 backdrop-blur sm:px-6">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Logo />
            <span className="hidden h-4 w-px bg-line sm:inline-block" />
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate text-sm font-semibold">{portalInfo?.company_name || session.workspaceName}</span>
              <span className="hidden rounded-md bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-muted sm:inline-block">
                Employee Knowledge Portal
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {(portalInfo?.spaces?.length ?? 0) > 0 && (
              <select
                aria-label="Filter by department space"
                value={selectedSpaceId}
                onChange={e => {
                  setLoading(true);
                  setSelectedSpaceId(e.target.value);
                }}
                className="hidden h-8 rounded-lg border border-line bg-surface px-2.5 text-xs font-medium md:block"
              >
                <option value="">All Spaces ({readyDocs.length})</option>
                {portalInfo?.spaces.map(sp => (
                  <option key={sp.id} value={sp.id}>
                    {sp.name}
                  </option>
                ))}
              </select>
            )}
            <div className="flex rounded-lg border border-line bg-surface p-0.5">
              <button
                type="button"
                onClick={() => setPortalTab('ask')}
                className={`rounded-md px-2.5 py-1 text-xs font-medium ${portalTab === 'ask' ? 'bg-brand text-brand-fg' : 'text-muted hover:text-fg'}`}
              >
                Ask AI
              </button>
              <button
                type="button"
                onClick={() => setPortalTab('docs')}
                className={`rounded-md px-2.5 py-1 text-xs font-medium ${portalTab === 'docs' ? 'bg-brand text-brand-fg' : 'text-muted hover:text-fg'}`}
              >
                Company Docs ({documents.length})
              </button>
            </div>
            {isCompanyAdmin && (
              <Link href="/company/" className="hidden h-8 items-center gap-1 rounded-lg border border-line bg-surface px-2.5 text-xs font-medium hover:bg-surface-2 sm:inline-flex">
                <Icon name="building" className="size-3.5 text-muted" /> Console
              </Link>
            )}
            {canContributorWorkspace && (
              <Link href="/app/" className="hidden h-8 items-center gap-1 rounded-lg border border-line bg-surface px-2.5 text-xs font-medium hover:bg-surface-2 lg:inline-flex">
                Workspace
              </Link>
            )}
            <ThemeToggle />
            <Button variant="ghost" size="sm" onClick={() => void signOut()} aria-label="Sign out">
              <Icon name="logout" className="size-4" />
            </Button>
          </div>
        </div>
      </header>

      {portalTab === 'ask' ? (
        <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 gap-6 px-4 py-4 sm:px-6">
          {/* Private conversation rail */}
          <aside className="hidden w-64 shrink-0 flex-col md:flex" aria-label="Your private conversations">
            <Button
              variant="secondary"
              className="w-full justify-start"
              onClick={() => {
                setConvId(null);
                setMessages([]);
              }}
            >
              <Icon name="plus" /> New question
            </Button>
            <div className="mt-4 flex items-center gap-1.5 px-1 text-xs font-medium text-muted">
              <Icon name="lock" className="size-3.5" />
              <span>Your Private History</span>
            </div>
            <ul className="scroll-thin -mx-1 mt-2 flex-1 space-y-0.5 overflow-y-auto px-1">
              {conversations.length === 0 && (
                <li className="px-2 py-2 text-xs text-faint">Your private company Q&amp;A threads stay visible only to you.</li>
              )}
              {conversations.map(c => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => void openConversation(c.id)}
                    className={`w-full rounded-lg px-2.5 py-2 text-left transition-colors ${c.id === convId ? 'bg-surface-2' : 'hover:bg-surface-2/70'}`}
                  >
                    <span className="block truncate text-sm font-medium">{c.title || 'Company Q&A'}</span>
                    <span className="block text-xs text-faint">{timeAgo(c.updated_at || c.created_at)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          {/* Chat body */}
          <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-line bg-surface">
            <div className="scroll-thin flex-1 overflow-y-auto px-4 py-6 sm:px-8">
              {loading || loadingConv ? (
                <div className="flex justify-center py-20">
                  <Spinner className="size-5 text-muted" />
                </div>
              ) : messages.length === 0 ? (
                <div className="mx-auto flex h-full max-w-xl flex-col justify-center">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                    {portalInfo?.company_name || session.workspaceName} Knowledge Assistant
                  </p>
                  <h1 className="mt-1 text-2xl font-semibold tracking-tight">
                    {readyDocs.length ? 'Ask anything across approved company docs' : 'No company documents ready yet'}
                  </h1>
                  <p className="mt-2 text-sm leading-6 text-muted">
                    {readyDocs.length
                      ? `Searching ${readyDocs.length} company document${readyDocs.length === 1 ? '' : 's'}${selectedSpaceId ? ' in selected department' : ''}. Answers cite exact source pages.`
                      : 'Ask your Company Admin to upload PDFs or handbooks to get started.'}
                  </p>
                  {readyDocs.length > 0 && (
                    <ul className="mt-6 space-y-2">
                      {starterPrompts.map(q => (
                        <li key={q}>
                          <button
                            type="button"
                            onClick={() => void sendQuestion(q)}
                            className="w-full rounded-xl border border-line px-4 py-3 text-left text-sm transition-colors hover:border-line-strong hover:bg-surface-2"
                          >
                            {q}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                <div className="mx-auto max-w-3xl space-y-6">
                  {messages.map(m =>
                    m.role === 'user' ? (
                      <div key={m.id} className="flex justify-end">
                        <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-surface-2 px-4 py-2.5 text-[15px] leading-7">
                          {m.content}
                        </p>
                      </div>
                    ) : m.error ? (
                      <div key={m.id} role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
                        {m.content}
                      </div>
                    ) : (
                      <article key={m.id}>
                        <p className="mb-1 text-xs font-semibold text-muted">{portalInfo?.company_name || 'DocMind'} Assistant</p>
                        {m.insufficient && (
                          <p className="mb-2 inline-flex items-center gap-1 rounded-full bg-warn-soft px-2.5 py-0.5 text-xs font-medium text-warn">
                            Not found in accessible company docs
                          </p>
                        )}
                        <RichText content={m.content} citations={m.citations} onCite={setCitation} />
                        {m.citations.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-1.5 border-t border-line pt-2.5">
                            {m.citations.map(c => (
                              <button
                                key={c.citation_id || c.source_label}
                                type="button"
                                onClick={() => setCitation(c)}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-bg px-2.5 py-1 text-xs hover:bg-surface-2"
                              >
                                <span className="font-semibold">[{c.source_label.replace(/^S/i, '')}]</span>
                                <span className="max-w-[12rem] truncate">{c.filename}</span>
                                {c.page_start && <span className="text-muted">p.{c.page_start}</span>}
                              </button>
                            ))}
                          </div>
                        )}
                        {convId && ApiClient.isUUID(m.id) && (
                          <div className="mt-2.5 flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => void giveFeedback(m.id, 1)}
                              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs ${
                                m.user_feedback === 1 ? 'bg-ok-soft text-ok font-medium' : 'text-faint hover:bg-surface-2 hover:text-fg'
                              }`}
                            >
                              <Icon name="thumbUp" className="size-3.5" /> Helpful
                            </button>
                            <button
                              type="button"
                              onClick={() => void giveFeedback(m.id, -1)}
                              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs ${
                                m.user_feedback === -1 ? 'bg-danger-soft text-danger font-medium' : 'text-faint hover:bg-surface-2 hover:text-fg'
                              }`}
                            >
                              <Icon name="thumbDown" className="size-3.5" /> Needs info
                            </button>
                          </div>
                        )}
                      </article>
                    ),
                  )}
                  {sending && (
                    <div className="flex items-center gap-2 text-sm text-muted">
                      <Spinner className="size-4" /> Searching company documents&hellip;
                    </div>
                  )}
                  <div ref={endRef} />
                </div>
              )}
            </div>

            <div className="border-t border-line p-3 sm:px-5">
              <form
                onSubmit={e => {
                  e.preventDefault();
                  void sendQuestion();
                }}
                className="mx-auto flex max-w-3xl items-end gap-2"
              >
                <input
                  type="text"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  disabled={readyDocs.length === 0 || sending}
                  placeholder={readyDocs.length ? `Ask ${portalInfo?.company_name || 'your company'} knowledge base...` : 'No ready documents available'}
                  className={`${inputClass} flex-1`}
                />
                <Button type="submit" disabled={!input.trim() || sending || readyDocs.length === 0}>
                  {sending ? <Spinner /> : <Icon name="send" />}
                </Button>
              </form>
            </div>
          </section>
        </div>
      ) : (
        <main className="scroll-thin mx-auto w-full max-w-5xl flex-1 overflow-y-auto px-4 py-6 sm:px-6">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-xl font-semibold">Company Documents</h1>
              <p className="text-sm text-muted">Approved knowledge resources you have access to in {portalInfo?.company_name || session.workspaceName}.</p>
            </div>
            <input
              type="search"
              value={docSearch}
              onChange={e => setDocSearch(e.target.value)}
              placeholder="Search file name..."
              className={`${inputClass} sm:w-64`}
            />
          </div>

          <Panel className="overflow-hidden">
            {filteredDocs.length === 0 ? (
              <p className="px-5 py-12 text-center text-sm text-muted">No accessible company documents match your filter.</p>
            ) : (
              <ul className="divide-y divide-line">
                {filteredDocs.map(d => (
                  <li key={d.id} className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      <FileTypeIcon filename={d.filename} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{d.filename}</p>
                        <p className="text-xs text-muted">
                          {d.space_name ? `${d.space_name} • ` : ''}
                          {d.page_count ? `${d.page_count} pages • ` : ''}
                          {formatBytes(d.size_bytes)} &bull; {formatDate(d.created_at)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={d.status} />
                      {d.status === 'READY' && (
                        <>
                          <Button variant="secondary" size="sm" onClick={() => void openSummary(d)}>
                            Summary
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => {
                              setConvId(null);
                              setMessages([]);
                              setPortalTab('ask');
                              void sendQuestion(`Summarize key points from ${d.filename}`, [d.id]);
                            }}
                          >
                            Ask
                          </Button>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </main>
      )}

      <CitationDrawer
        citation={citation}
        onClose={() => setCitation(null)}
        onAskDocument={docId => {
          setPortalTab('ask');
          void sendQuestion('Summarize the key obligations and points from this document.', [docId]);
        }}
      />

      <Modal open={!!summaryFor} onClose={() => setSummaryFor(null)} title={summaryFor?.filename || 'Document Summary'}>
        {!summary && !summaryError && (
          <div className="flex items-center gap-3 py-8 text-sm text-muted">
            <Spinner /> Generating summary&hellip;
          </div>
        )}
        {summaryError && <p className="text-sm text-danger">{summaryError}</p>}
        {summary && (
          <div className="space-y-4">
            <p className="text-sm leading-6">{summary.overview}</p>
            {summary.key_points?.length > 0 && (
              <ul className="space-y-2 border-t border-line pt-3">
                {summary.key_points.map((kp, i) => (
                  <li key={i} className="text-sm">
                    <span className="font-semibold">{kp.point}: </span>
                    <span className="text-muted">{kp.explanation}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

export function EmployeePortal() {
  const router = useRouter();
  const raw = useSyncExternalStore<string | null>(subscribeStorage, readRawSession, () => null);
  const hasToken = raw !== null && !!ApiClient.getToken();

  const session = useMemo<UserSession | null>(() => {
    if (!raw || !hasToken) return null;
    try {
      return JSON.parse(raw) as UserSession;
    } catch {
      return null;
    }
  }, [raw, hasToken]);

  useEffect(() => {
    if (raw !== null && !session) {
      router.replace('/login/');
    }
  }, [raw, session, router]);

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="size-6 text-fg" />
      </div>
    );
  }

  return (
    <ToastProvider>
      <EmployeePortalInner session={session} />
    </ToastProvider>
  );
}
