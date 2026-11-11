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

function companyMonogram(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return `${words[0][0] || ''}${words[1][0] || ''}`.toUpperCase();
  return (name.trim().slice(0, 2) || 'CO').toUpperCase();
}

export function PendingApprovalScreen({
  companyName,
  email,
  onSignOut,
  onRefresh,
  alternateHref,
  alternateLabel,
}: {
  companyName: string;
  email: string;
  onSignOut: () => void;
  onRefresh: () => void;
  alternateHref?: string;
  alternateLabel?: string;
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
          {alternateHref && alternateLabel && (
            <Link
              href={alternateHref}
              className="inline-flex h-10 w-full items-center justify-center rounded-xl border border-line bg-surface px-4 text-sm font-medium hover:bg-surface-2"
            >
              {alternateLabel}
            </Link>
          )}
          <Button variant="ghost" className="w-full" onClick={onSignOut}>
            Sign out
          </Button>
        </div>
      </Panel>
    </div>
  );
}

export function EmployeePortalInner({
  session,
  embedded = false,
  portalSlug,
  onSignOut,
  onOpenUpload,
}: {
  session: UserSession;
  embedded?: boolean;
  portalSlug?: string;
  onSignOut?: () => void;
  onOpenUpload?: () => void;
}) {
  const router = useRouter();
  const toast = useToast();

  const [portalTab, setPortalTab] = useState<'ask' | 'docs'>('ask');
  const [portalInfo, setPortalInfo] = useState<EmployeePortalInfoDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedSpaceId, setSelectedSpaceId] = useState<string>('');
  const [documents, setDocuments] = useState<DocumentDTO[]>([]);
  const [totalDocsCount, setTotalDocsCount] = useState<number>(0);
  const [conversations, setConversations] = useState<ConversationDTO[]>([]);

  // Chat state
  const [convId, setConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [focusedDoc, setFocusedDoc] = useState<{ id: string; filename: string } | null>(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingConv, setLoadingConv] = useState(false);
  const [citation, setCitation] = useState<CitationDTO | null>(null);
  const [openingDocId, setOpeningDocId] = useState<string | null>(null);

  // Docs search + summary
  const [docSearch, setDocSearch] = useState('');
  const [summaryFor, setSummaryFor] = useState<DocumentDTO | null>(null);
  const [summary, setSummary] = useState<DocumentSummaryResponse | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  // Change password modal
  const [pwdOpen, setPwdOpen] = useState(false);
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [savingPwd, setSavingPwd] = useState(false);
  const [pwdError, setPwdError] = useState<string | null>(null);

  const endRef = useRef<HTMLDivElement>(null);
  const idCounter = useRef(0);

  const signOut = useCallback(async () => {
    await ApiClient.logout();
    clearSession();
    if (onSignOut) {
      onSignOut();
    } else if (portalSlug) {
      router.replace(`/${portalSlug}/`);
    } else {
      router.replace('/login/');
    }
  }, [onSignOut, portalSlug, router]);

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
      if (!selectedSpaceId) {
        setTotalDocsCount(docs.length);
      }
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

  const readyDocs = documents.filter(d => d.status === 'READY');
  const inProgressDocs = documents.filter(d => ['UPLOADING', 'QUEUED', 'PROCESSING'].includes(d.status));

  useEffect(() => {
    if (inProgressDocs.length === 0) return;
    const id = setInterval(() => {
      void loadPortal();
    }, 4000);
    return () => clearInterval(id);
  }, [inProgressDocs.length, loadPortal]);

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

  const selectedSpace = portalInfo?.spaces.find(s => s.id === selectedSpaceId) ?? null;
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
    const effectiveDocIds = docIdsOverride ?? (focusedDoc ? [focusedDoc.id] : undefined);
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
      const res = await ApiClient.sendMessage(
        id,
        question,
        effectiveDocIds,
        effectiveDocIds ? undefined : selectedSpaceId || undefined,
      );
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

  const openDocumentFile = async (doc: DocumentDTO) => {
    setOpeningDocId(doc.id);
    try {
      const { download_url } = await ApiClient.getDownloadUrl(doc.id);
      window.open(download_url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      handleErr(err, 'Could not open this document.');
    } finally {
      setOpeningDocId(null);
    }
  };

  const askAboutSingleDoc = (doc: DocumentDTO, prompt?: string) => {
    setConvId(null);
    setMessages([]);
    setFocusedDoc({ id: doc.id, filename: doc.filename });
    setPortalTab('ask');
    void sendQuestion(prompt || `Summarize key points from ${doc.filename}`, [doc.id]);
  };

  const filteredDocs = documents.filter(
    d =>
      !docSearch ||
      d.filename.toLowerCase().includes(docSearch.toLowerCase()) ||
      (d.space_name || '').toLowerCase().includes(docSearch.toLowerCase()),
  );

  const activeSlug = portalSlug || portalInfo?.slug || (session.workspaceSlug !== 'personal' ? session.workspaceSlug : undefined);
  const roleLabel = portalInfo?.role === 'VIEWER' ? 'Read-Only Portal' : 'Employee Portal';
  const companyBrand = portalInfo?.company_name || session.workspaceName || 'Company';
  const companyInitials = companyMonogram(companyBrand);

  const submitPasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdError(null);
    if (newPwd.length < 8) {
      setPwdError('New password must be at least 8 characters.');
      return;
    }
    if (newPwd !== confirmPwd) {
      setPwdError('New password and confirmation do not match.');
      return;
    }
    setSavingPwd(true);
    try {
      await ApiClient.changePassword(currentPwd, newPwd);
      setPwdOpen(false);
      setCurrentPwd('');
      setNewPwd('');
      setConfirmPwd('');
      toast('Password updated! Sign in with your new password.', 'success');
      await signOut();
    } catch (err) {
      setPwdError(err instanceof Error ? err.message : 'Could not update password. Verify your current password.');
    } finally {
      setSavingPwd(false);
    }
  };

  return (
    <div className={embedded ? 'flex h-[calc(100vh-13rem)] min-h-[34rem] flex-col overflow-hidden rounded-2xl border border-line bg-bg text-fg' : 'flex h-screen flex-col overflow-hidden bg-bg text-fg'}>
      {!embedded ? (
        <header className="shrink-0 border-b border-line bg-bg/95 px-4 backdrop-blur sm:px-6">
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <Logo />
              <span className="hidden h-5 w-px bg-line sm:inline-block" />
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand text-xs font-bold tracking-tight text-brand-fg shadow-xs">
                  {companyInitials}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold text-fg">{companyBrand}</span>
                    <span className="hidden rounded-md bg-brand/10 px-2 py-0.5 text-[11px] font-semibold text-fg sm:inline-block">
                      {roleLabel}
                    </span>
                  </div>
                  <p className="hidden truncate text-[11px] text-muted sm:block">{session.email}</p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex rounded-xl border border-line bg-surface p-0.5">
                <button
                  type="button"
                  onClick={() => setPortalTab('ask')}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${portalTab === 'ask' ? 'bg-brand text-brand-fg shadow-xs' : 'text-muted hover:text-fg'}`}
                >
                  <Icon name="chat" className="size-3.5" />
                  Ask AI
                </button>
                <button
                  type="button"
                  onClick={() => setPortalTab('docs')}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${portalTab === 'docs' ? 'bg-brand text-brand-fg shadow-xs' : 'text-muted hover:text-fg'}`}
                >
                  <Icon name="book" className="size-3.5" />
                  Docs ({documents.length})
                </button>
              </div>
              {isCompanyAdmin && (
                <Link href={activeSlug ? `/${activeSlug}/` : '/company/'} className="hidden h-8 items-center gap-1 rounded-lg border border-line bg-surface px-2.5 text-xs font-medium hover:bg-surface-2 sm:inline-flex">
                  <Icon name="building" className="size-3.5 text-muted" /> Console
                </Link>
              )}
              {canContributorWorkspace && (
                <Link href="/app/" className="hidden h-8 items-center gap-1 rounded-lg border border-line bg-surface px-2.5 text-xs font-medium hover:bg-surface-2 lg:inline-flex">
                  Workspace
                </Link>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setPwdError(null);
                  setPwdOpen(true);
                }}
                title="Change your password"
              >
                <Icon name="key" className="size-3.5" />
                <span className="hidden md:inline">Password</span>
              </Button>
              <ThemeToggle />
              <Button variant="ghost" size="sm" onClick={() => void signOut()} aria-label="Sign out">
                <Icon name="logout" className="size-4" />
              </Button>
            </div>
          </div>
        </header>
      ) : (
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line bg-surface px-4 py-2.5">
          <div className="flex items-center gap-2">
            <Icon name="sparkles" className="size-4 text-fg" />
            <span className="text-xs font-semibold text-fg">{companyBrand} Knowledge Assistant</span>
            <span className="hidden text-xs text-muted sm:inline">&bull; Private Q&amp;A across company documents</span>
          </div>
          <div className="flex rounded-lg border border-line bg-bg p-0.5">
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
              Browse Docs ({documents.length})
            </button>
          </div>
        </div>
      )}

      {/* Sticky space-filter pill row */}
      {(portalInfo?.spaces?.length ?? 0) > 0 && (
        <div className="shrink-0 border-b border-line bg-bg/95 px-4 backdrop-blur sm:px-6">
          <div className="mx-auto flex max-w-6xl items-center gap-2 overflow-x-auto py-2">
            <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wider text-faint">Spaces:</span>
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                setFocusedDoc(null);
                setSelectedSpaceId('');
              }}
              className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition-colors ${selectedSpaceId === '' ? 'bg-brand text-brand-fg' : 'border border-line bg-surface text-muted hover:bg-surface-2'}`}
            >
              All Accessible ({totalDocsCount || documents.length})
            </button>
            {portalInfo?.spaces.map(sp => (
              <button
                key={sp.id}
                type="button"
                onClick={() => {
                  setLoading(true);
                  setFocusedDoc(null);
                  setSelectedSpaceId(sp.id);
                }}
                className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition-colors ${selectedSpaceId === sp.id ? 'bg-brand text-brand-fg' : 'border border-line bg-surface text-muted hover:bg-surface-2'}`}
              >
                {sp.name} ({sp.document_count})
              </button>
            ))}
          </div>
        </div>
      )}

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
                setFocusedDoc(null);
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
                    onClick={() => {
                      setFocusedDoc(null);
                      void openConversation(c.id);
                    }}
                    className={`w-full rounded-lg px-2.5 py-2 text-left transition-colors ${c.id === convId ? 'bg-surface-2' : 'hover:bg-surface-2/70'}`}
                  >
                    <span className="block truncate text-sm font-medium">{c.title || 'Company Q&A'}</span>
                    <span className="block text-xs text-faint">{timeAgo(c.updated_at || c.created_at)}</span>
                  </button>
                </li>
              ))}
            </ul>

            {readyDocs.length > 0 && (
              <div className="mt-3 border-t border-line pt-3">
                <div className="mb-1.5 flex items-center justify-between px-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                    Quick Docs ({readyDocs.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => setPortalTab('docs')}
                    className="text-[11px] font-medium text-fg underline underline-offset-2 hover:no-underline"
                  >
                    See all
                  </button>
                </div>
                <ul className="space-y-1">
                  {readyDocs.slice(0, 5).map(d => (
                    <li key={d.id}>
                      <button
                        type="button"
                        onClick={() => askAboutSingleDoc(d)}
                        className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors ${
                          focusedDoc?.id === d.id ? 'bg-brand/10 font-semibold text-fg' : 'text-muted hover:bg-surface-2 hover:text-fg'
                        }`}
                        title={`Ask AI about ${d.filename}`}
                      >
                        <Icon name="file" className="size-3.5 shrink-0" />
                        <span className="truncate">{d.filename}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </aside>

          {/* Chat body */}
          <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-line bg-surface">
            {/* Persistent Scope Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface-2/50 px-4 py-2 text-xs">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                {focusedDoc ? (
                  <>
                    <span className="inline-flex items-center gap-1.5 rounded-md bg-brand/10 px-2 py-0.5 font-medium text-fg">
                      <Icon name="file" className="size-3.5 shrink-0" />
                      <span className="max-w-[16rem] truncate">Focused doc: {focusedDoc.filename}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setFocusedDoc(null)}
                      className="text-muted underline underline-offset-2 hover:text-fg"
                    >
                      Ask all docs instead
                    </button>
                  </>
                ) : selectedSpace ? (
                  <>
                    <span className="inline-flex items-center gap-1.5 rounded-md bg-brand/10 px-2 py-0.5 font-medium text-fg">
                      <Icon name="folder" className="size-3.5 shrink-0" />
                      <span>{selectedSpace.name} &mdash; {readyDocs.length} ready doc{readyDocs.length === 1 ? '' : 's'}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setLoading(true);
                        setSelectedSpaceId('');
                      }}
                      className="text-muted underline underline-offset-2 hover:text-fg"
                    >
                      Clear filter
                    </button>
                  </>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-muted">
                    <Icon name="globe" className="size-3.5 shrink-0" />
                    <span>
                      Searching <strong className="text-fg">{readyDocs.length}</strong> accessible doc{readyDocs.length === 1 ? '' : 's'}
                      {inProgressDocs.length > 0 ? ` (${inProgressDocs.length} indexing)` : ''}
                    </span>
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {messages.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setConvId(null);
                      setMessages([]);
                      setFocusedDoc(null);
                    }}
                    className="inline-flex items-center gap-1 rounded-md border border-line bg-surface px-2 py-1 font-medium text-fg hover:bg-surface-2 md:hidden"
                  >
                    <Icon name="plus" className="size-3" /> New
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setPortalTab('docs')}
                  className="inline-flex items-center gap-1 font-medium text-muted hover:text-fg"
                >
                  <Icon name="book" className="size-3.5" />
                  Browse Docs ({documents.length})
                </button>
              </div>
            </div>

            <div className="scroll-thin flex-1 overflow-y-auto px-4 py-6 sm:px-8">
              {loading || loadingConv ? (
                <div className="flex justify-center py-20">
                  <Spinner className="size-5 text-muted" />
                </div>
              ) : messages.length === 0 ? (
                <div className="mx-auto flex h-full max-w-xl flex-col justify-center py-6">
                  {readyDocs.length === 0 ? (
                    <>
                      {/* No ready docs yet — guided empty state */}
                      <div className="mb-5 flex flex-col items-center text-center">
                        <div className="mb-4 inline-flex size-14 items-center justify-center rounded-full bg-surface-2 text-muted">
                          {inProgressDocs.length > 0 ? <Spinner className="size-6" /> : <Icon name="file" className="size-7" />}
                        </div>
                        <h1 className="text-xl font-semibold tracking-tight">
                          {inProgressDocs.length > 0
                            ? `${inProgressDocs.length} document${inProgressDocs.length === 1 ? ' is' : 's are'} being indexed`
                            : selectedSpace
                              ? `No ready documents in ${selectedSpace.name}`
                              : 'No company documents uploaded yet'}
                        </h1>
                        <p className="mt-2 max-w-md text-sm leading-6 text-muted">
                          {inProgressDocs.length > 0
                            ? 'DocMind is reading and indexing recently uploaded company files. They will become searchable here automatically in a moment.'
                            : selectedSpace
                              ? `No processed documents are inside the "${selectedSpace.name}" space yet. Switch back to all accessible docs or ask your Company Admin to assign documents here.`
                              : 'Once your Company Admin uploads handbooks, policies, or guides to your company workspace, you can browse them and ask questions with exact page citations.'}
                        </p>
                        <div className="mt-4 flex flex-wrap justify-center gap-2">
                          {selectedSpace && (
                            <Button size="sm" variant="secondary" onClick={() => { setLoading(true); setSelectedSpaceId(''); }}>
                              View all company docs
                            </Button>
                          )}
                          {inProgressDocs.length > 0 && (
                            <Button size="sm" variant="secondary" onClick={() => setPortalTab('docs')}>
                              Check indexing status
                            </Button>
                          )}
                          {isCompanyAdmin && (
                            onOpenUpload ? (
                              <Button size="sm" onClick={onOpenUpload}>
                                <Icon name="upload" className="size-3.5" /> Upload company docs
                              </Button>
                            ) : (
                              <Link
                                href="/app/?upload=1#library"
                                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand px-3 text-xs font-medium text-brand-fg hover:opacity-90"
                              >
                                <Icon name="upload" className="size-3.5" /> Upload company docs
                              </Link>
                            )
                          )}
                        </div>
                      </div>
                      {/* How it works steps */}
                      <p className="mb-3 text-center text-xs font-semibold uppercase tracking-wider text-muted">How it works</p>
                      <div className="grid gap-3 sm:grid-cols-3">
                        {[
                          { icon: 'upload' as const, title: '1. Admin uploads docs', desc: 'Company Admin uploads handbooks, policies & guides to the Workspace Library.' },
                          { icon: 'search' as const, title: '2. DocMind indexes', desc: 'Files are processed and organized into General or Department Spaces.' },
                          { icon: 'chat' as const, title: '3. Employees ask AI', desc: 'Ask in natural language and get answers citing exact source pages.' },
                        ].map((step, i) => (
                          <div key={i} className="rounded-xl border border-line bg-bg p-3.5 text-center">
                            <div className="mx-auto inline-flex size-8 items-center justify-center rounded-lg bg-surface-2 text-fg">
                              <Icon name={step.icon} className="size-4" />
                            </div>
                            <p className="mt-2.5 text-xs font-semibold">{step.title}</p>
                            <p className="mt-1 text-[11px] leading-4 text-muted">{step.desc}</p>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Has docs — knowledge assistant prompt starter */}
                      <div className="mb-3 flex items-center gap-2.5">
                        <span className="inline-flex size-9 items-center justify-center rounded-xl bg-brand text-xs font-bold tracking-tight text-brand-fg shadow-xs">
                          {companyInitials}
                        </span>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                            {companyBrand} Knowledge Assistant
                          </p>
                          <p className="text-[11px] text-faint">Isolated company workspace &bull; Grounded page citations</p>
                        </div>
                      </div>
                      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                        Ask anything across {readyDocs.length} company document{readyDocs.length === 1 ? '' : 's'}
                      </h1>
                      <p className="mt-1.5 text-sm text-muted">
                        Pick a suggested prompt, type a question below, or click any file in Quick Docs or Browse Docs to focus on a single guide.
                      </p>
                      {selectedSpace && (
                        <span className="mt-3 inline-flex items-center gap-1.5 self-start rounded-full bg-brand/10 px-3 py-1 text-xs font-medium text-fg">
                          <Icon name="folder" className="size-3.5" />
                          Asking in {selectedSpace.name} &mdash; {readyDocs.length} doc{readyDocs.length === 1 ? '' : 's'}
                        </span>
                      )}
                      <ul className="mt-6 space-y-2">
                        {starterPrompts.map(q => (
                          <li key={q}>
                            <button
                              type="button"
                              onClick={() => void sendQuestion(q)}
                              className="flex w-full items-center justify-between rounded-xl border border-line bg-bg/60 px-4 py-3 text-left text-sm transition-colors hover:border-line-strong hover:bg-surface-2"
                            >
                              <span>{q}</span>
                              <Icon name="arrowRight" className="ml-3 size-4 shrink-0 text-muted" />
                            </button>
                          </li>
                        ))}
                      </ul>
                      <div className="mt-5 flex flex-wrap items-center justify-center gap-3 text-xs text-muted">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 font-medium text-fg underline underline-offset-2 hover:no-underline"
                          onClick={() => setPortalTab('docs')}
                        >
                          <Icon name="book" className="size-3.5" /> Browse Company Docs ({documents.length})
                        </button>
                        <span>&bull;</span>
                        <span>Answers cite exact source pages</span>
                      </div>
                    </>
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
                  placeholder={
                    readyDocs.length === 0
                      ? 'No ready documents available'
                      : focusedDoc
                        ? `Ask a follow-up about ${focusedDoc.filename}...`
                        : selectedSpace
                          ? `Ask across ${selectedSpace.name} documents...`
                          : `Ask ${portalInfo?.company_name || 'your company'} knowledge base...`
                  }
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
              <p className="text-sm text-muted">Approved knowledge resources shared with you in {portalInfo?.company_name || session.workspaceName}.</p>
            </div>
            <input
              type="search"
              value={docSearch}
              onChange={e => setDocSearch(e.target.value)}
              placeholder="Search file name..."
              className={`${inputClass} sm:w-64`}
            />
          </div>

          <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-brand/25 bg-brand/5 px-4 py-3 text-sm">
            <Icon name="info" className="mt-0.5 size-4 shrink-0 text-fg" />
            <p className="text-xs leading-5 text-muted">
              <strong className="text-fg">How to explore company docs:</strong> Click <strong>Open</strong> to view the original file, <strong>Summary</strong> for an AI brief, or <strong>Ask AI</strong> to start a focused Q&amp;A about that document. Restricted department docs appear automatically once a Company Admin grants you access.
            </p>
          </div>

          <Panel className="overflow-hidden">
            {filteredDocs.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <p className="text-sm font-medium text-fg">
                  {documents.length === 0 ? 'No company documents available yet' : 'No accessible company documents match your filter'}
                </p>
                <p className="mt-1 text-xs text-muted">
                  {documents.length === 0
                    ? 'Company Admins upload handbooks, policies, and guides from the Workspace Library.'
                    : 'Try clearing your search box or switching Department Space pills above.'}
                </p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {selectedSpaceId && (
                    <Button size="sm" variant="secondary" onClick={() => { setLoading(true); setSelectedSpaceId(''); }}>
                      Show all spaces
                    </Button>
                  )}
                  {isCompanyAdmin && (
                    onOpenUpload ? (
                      <Button size="sm" onClick={onOpenUpload}>
                        <Icon name="upload" className="size-3.5" /> Upload company docs
                      </Button>
                    ) : (
                      <Link
                        href="/app/?upload=1#library"
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand px-3 text-xs font-medium text-brand-fg hover:opacity-90"
                      >
                        <Icon name="upload" className="size-3.5" /> Upload company docs
                      </Link>
                    )
                  )}
                </div>
              </div>
            ) : (
              <div className="grid gap-3 p-4 sm:grid-cols-2">
                {filteredDocs.map(d => (
                  <div key={d.id} className="flex flex-col justify-between gap-4 rounded-xl border border-line bg-bg p-4 transition-colors hover:border-line-strong">
                    <div className="flex items-start gap-3">
                      <FileTypeIcon filename={d.filename} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="truncate text-sm font-semibold text-fg" title={d.filename}>{d.filename}</p>
                          <StatusBadge status={d.status} />
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                          <span className="inline-flex items-center gap-1 rounded bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-fg">
                            <Icon name={d.space_name ? 'folder' : 'globe'} className="size-3 text-muted" />
                            {d.space_name || 'General Company'}
                          </span>
                          {d.page_count ? <span>&bull; {d.page_count} pages</span> : null}
                          <span>&bull; {formatBytes(d.size_bytes)}</span>
                        </div>
                        <p className="mt-1 text-[11px] text-faint">Added {formatDate(d.created_at)}</p>
                      </div>
                    </div>

                    {d.status === 'READY' && (
                      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-3">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={openingDocId === d.id}
                          onClick={() => void openDocumentFile(d)}
                        >
                          {openingDocId === d.id ? <Spinner className="size-3.5" /> : <Icon name="external" className="size-3.5" />}
                          Open
                        </Button>
                        <Button variant="secondary" size="sm" onClick={() => void openSummary(d)}>
                          Summary
                        </Button>
                        <Button size="sm" onClick={() => askAboutSingleDoc(d)}>
                          Ask AI
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </main>
      )}

      <CitationDrawer
        citation={citation}
        onClose={() => setCitation(null)}
        onAskDocument={docId => {
          const target = documents.find(d => d.id === docId);
          if (target) {
            askAboutSingleDoc(target, 'Summarize the key obligations and points from this document.');
          } else {
            setConvId(null);
            setMessages([]);
            setFocusedDoc({ id: docId, filename: 'Selected document' });
            setPortalTab('ask');
            void sendQuestion('Summarize the key obligations and points from this document.', [docId]);
          }
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

      <Modal open={pwdOpen} onClose={() => setPwdOpen(false)} title="Change Your Portal Password">
        <form onSubmit={submitPasswordChange} className="space-y-4">
          <p className="text-xs leading-relaxed text-muted">
            Replace the admin-issued batch password (or your existing password) with your own private password. You will sign back in after updating.
          </p>
          {pwdError && (
            <div role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">
              {pwdError}
            </div>
          )}
          <div>
            <label htmlFor="emp-curr-pwd" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
              Current Password
            </label>
            <input
              id="emp-curr-pwd"
              type="password"
              required
              autoComplete="current-password"
              value={currentPwd}
              onChange={e => setCurrentPwd(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="emp-new-pwd" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
              New Password (min 8 chars)
            </label>
            <input
              id="emp-new-pwd"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={newPwd}
              onChange={e => setNewPwd(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="emp-conf-pwd" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
              Confirm New Password
            </label>
            <input
              id="emp-conf-pwd"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={confirmPwd}
              onChange={e => setConfirmPwd(e.target.value)}
              className={inputClass}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setPwdOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={savingPwd}>
              {savingPwd && <Spinner />} Save New Password
            </Button>
          </div>
        </form>
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
    } else if (session && session.isCompany && session.workspaceSlug && session.workspaceSlug !== 'personal') {
      router.replace(`/${session.workspaceSlug}/`);
    } else if (session && !session.workspaceId && session.pendingJoinCompany?.companySlug) {
      router.replace(`/${session.pendingJoinCompany.companySlug}/`);
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
