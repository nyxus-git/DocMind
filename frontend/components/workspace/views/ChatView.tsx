'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ApiClient, ApiError, CitationDTO, MessageDTO } from '../../../lib/api';
import { timeAgo } from '../../../lib/format';
import { Button, Spinner } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { useToast } from '../../ui/Toast';
import { RichText } from '../RichText';
import { useWorkspace } from '../WorkspaceContext';

interface ChatMessage extends MessageDTO {
  insufficient?: boolean;
  followups?: string[];
  error?: boolean;
}

const SUGGESTIONS = [
  'Summarize the main obligations and deadlines.',
  'What are the termination and renewal terms?',
  'List any numbers, limits or caps and where they appear.',
];

function SourceList({ citations, onOpen }: { citations: CitationDTO[]; onOpen: (c: CitationDTO) => void }) {
  if (!citations.length) return null;
  return (
    <div className="mt-4 border-t border-line pt-3">
      <p className="mb-2 text-[13px] font-medium text-muted">Sources</p>
      <ul className="space-y-1">
        {citations.map(c => (
          <li key={c.citation_id || c.source_label}>
            <button
              type="button"
              onClick={() => onOpen(c)}
              className="group flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-surface-2"
            >
              <span className="inline-flex min-w-[1.3rem] justify-center rounded-[5px] bg-brand px-1 text-[11px] font-semibold leading-[1.3rem] text-brand-fg group-hover:bg-mark group-hover:text-[#1a1400]">
                {c.source_label.replace(/^S/i, '')}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm">{c.filename}</span>
              {c.page_start && <span className="tabular shrink-0 text-[13px] text-muted">p. {c.page_start}</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ChatView() {
  const { documents, conversations, starterPrompts, refreshConversations, refreshUsage, chatScope, setChatScope, openCitation, canAsk, usage, handleApiError } =
    useWorkspace();
  const toast = useToast();

  const [convId, setConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingConv, setLoadingConv] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const idCounter = useRef(0);

  const ready = documents.filter(d => d.status === 'READY');
  const limitReached = !!usage && usage.questions_used >= usage.questions_limit;
  const activeSuggestions = starterPrompts.length > 0 ? starterPrompts : SUGGESTIONS;

  const giveFeedback = async (msgId: string, rating: 1 | -1) => {
    if (!convId) return;
    setMessages(prev => prev.map(m => (m.id === msgId ? { ...m, user_feedback: rating } : m)));
    try {
      await ApiClient.submitMessageFeedback(convId, msgId, rating);
      toast(rating === 1 ? 'Marked as helpful.' : 'Feedback recorded for company admins.', 'success');
    } catch (err) {
      if (!handleApiError(err)) toast('Could not save feedback.', 'error');
    }
  };

  const openConversation = useCallback(
    async (id: string) => {
      setLoadingConv(true);
      try {
        const conv = await ApiClient.getConversation(id);
        setConvId(conv.id);
        setMessages((conv.messages ?? []) as ChatMessage[]);
      } catch (err) {
        if (!handleApiError(err)) toast(err instanceof Error ? err.message : 'Could not open that conversation.', 'error');
      } finally {
        setLoadingConv(false);
      }
    },
    [handleApiError, toast],
  );

  // Open a conversation chosen on the overview page.
  useEffect(() => {
    try {
      const pending = window.sessionStorage.getItem('docmind_open_conv');
      if (pending) {
        window.sessionStorage.removeItem('docmind_open_conv');
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void openConversation(pending);
      }
    } catch {
      // ignore
    }
  }, [openConversation]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, sending]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  const newChat = () => {
    setConvId(null);
    setMessages([]);
    setInput('');
    inputRef.current?.focus();
  };

  const send = async (text?: string) => {
    const question = (text ?? input).trim();
    if (!question || sending || !canAsk) return;
    setInput('');
    setSending(true);

    const now = new Date().toISOString();
    const tempId = `u-${++idCounter.current}`;
    setMessages(prev => [
      ...prev,
      { id: tempId, conversation_id: convId ?? '', role: 'user', content: question, status: 'completed', citations: [], created_at: now },
    ]);

    try {
      let id = convId;
      if (!id) {
        const conv = await ApiClient.createConversation(question.length > 60 ? `${question.slice(0, 57)}...` : question);
        id = conv.id;
        setConvId(id);
      }
      const res = await ApiClient.sendMessage(id, question, chatScope.length ? chatScope : undefined);
      setMessages(prev => [
        ...prev,
        {
          id: res.message_id,
          conversation_id: id as string,
          role: 'assistant',
          content: res.content,
          status: 'completed',
          citations: res.citations ?? [],
          created_at: res.created_at,
          insufficient: res.insufficient_evidence,
          followups: res.suggested_followups,
        },
      ]);
      void refreshConversations();
      void refreshUsage();
    } catch (err) {
      if (handleApiError(err)) return;
      let message = err instanceof Error ? err.message : 'Something went wrong.';
      if (err instanceof ApiError && (err.status === 402 || err.status === 429)) {
        message = `${err.message} You can upgrade your plan in Settings.`;
      }
      setMessages(prev => [
        ...prev,
        { id: `e-${++idCounter.current}`, conversation_id: convId ?? '', role: 'assistant', content: message, status: 'failed', citations: [], created_at: new Date().toISOString(), error: true },
      ]);
    } finally {
      setSending(false);
    }
  };

  const exportMarkdown = () => {
    const md = messages.map(m => `### ${m.role === 'user' ? 'You' : 'DocMind'}\n\n${m.content}\n`).join('\n');
    const url = URL.createObjectURL(new Blob([md], { type: 'text/markdown' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'docmind-conversation.md';
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleScope = (id: string) => setChatScope(chatScope.includes(id) ? chatScope.filter(x => x !== id) : [...chatScope, id]);

  return (
    <div className="flex h-[calc(100vh-9.5rem)] min-h-[28rem] gap-6 lg:h-[calc(100vh-6.5rem)]">
      {/* History rail */}
      <aside className="hidden w-60 shrink-0 flex-col md:flex" aria-label="Conversations">
        <Button variant="secondary" onClick={newChat} className="w-full justify-start">
          <Icon name="plus" /> New conversation
        </Button>
        <p className="mb-1.5 mt-5 px-1 text-[13px] font-medium text-muted">History</p>
        <ul className="scroll-thin -mx-1 flex-1 space-y-0.5 overflow-y-auto px-1">
          {conversations.length === 0 && <li className="px-2 py-2 text-sm text-faint">Your conversations will appear here.</li>}
          {conversations.map(c => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => openConversation(c.id)}
                aria-current={c.id === convId ? 'true' : undefined}
                className={`w-full rounded-lg px-2.5 py-2 text-left transition-colors ${c.id === convId ? 'bg-surface-2' : 'hover:bg-surface-2/70'}`}
              >
                <span className="block truncate text-sm font-medium">{c.title || 'Untitled conversation'}</span>
                <span className="block text-xs text-faint">{timeAgo(c.updated_at || c.created_at)}</span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {/* Conversation */}
      <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-line bg-surface" aria-label="Conversation">
        {/* Scope + actions */}
        <div className="flex items-center gap-2 border-b border-line px-3 py-2.5 sm:px-4">
          <div className="scroll-thin flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto" role="group" aria-label="Documents to search">
            <button
              type="button"
              onClick={() => setChatScope([])}
              aria-pressed={chatScope.length === 0}
              className={`whitespace-nowrap rounded-full px-3 py-1 text-[13px] font-medium transition-colors ${
                chatScope.length === 0 ? 'bg-brand text-brand-fg' : 'bg-surface-2 text-muted hover:text-fg'
              }`}
            >
              All documents ({ready.length})
            </button>
            {ready.map(d => (
              <button
                key={d.id}
                type="button"
                onClick={() => toggleScope(d.id)}
                aria-pressed={chatScope.includes(d.id)}
                title={d.filename}
                className={`max-w-[12rem] truncate whitespace-nowrap rounded-full px-3 py-1 text-[13px] font-medium transition-colors ${
                  chatScope.includes(d.id) ? 'bg-brand text-brand-fg' : 'bg-surface-2 text-muted hover:text-fg'
                }`}
              >
                {d.filename}
              </button>
            ))}
          </div>
          <div className="flex shrink-0 items-center">
            <button
              type="button"
              onClick={newChat}
              aria-label="New conversation"
              title="New conversation"
              className="inline-flex size-8 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg md:hidden"
            >
              <Icon name="plus" />
            </button>
            {messages.length > 0 && (
              <button
                type="button"
                onClick={exportMarkdown}
                aria-label="Export conversation as Markdown"
                title="Export as Markdown"
                className="inline-flex size-8 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg"
              >
                <Icon name="download" />
              </button>
            )}
          </div>
        </div>

        {/* Messages */}
        <div className="scroll-thin flex-1 overflow-y-auto px-4 py-6 sm:px-8">
          {loadingConv && (
            <div className="flex justify-center py-16">
              <Spinner className="size-5 text-muted" />
            </div>
          )}

          {!loadingConv && messages.length === 0 && (
            <div className="mx-auto flex h-full max-w-xl flex-col justify-center">
              <h2 className="text-2xl font-semibold tracking-[-0.02em]">
                {ready.length === 0 ? 'Upload a document to start' : 'Ask your documents'}
              </h2>
              <p className="mt-2 text-[15px] leading-7 text-muted">
                {ready.length === 0
                  ? 'Once a document is Ready, you can ask questions and every answer will cite its page.'
                  : chatScope.length
                    ? `Searching ${chatScope.length} selected ${chatScope.length === 1 ? 'document' : 'documents'}.`
                    : `Searching all ${ready.length} ready ${ready.length === 1 ? 'document' : 'documents'}. Pick documents above to narrow the search.`}
              </p>
              {ready.length > 0 && canAsk && (
                <ul className="mt-6 space-y-2">
                  {activeSuggestions.map(s => (
                    <li key={s}>
                      <button
                        type="button"
                        onClick={() => void send(s)}
                        disabled={limitReached}
                        className="w-full rounded-xl border border-line px-4 py-3 text-left text-[15px] transition-colors hover:border-line-strong hover:bg-surface-2 disabled:opacity-50"
                      >
                        {s}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="mx-auto max-w-3xl space-y-7">
            {messages.map(m =>
              m.role === 'user' ? (
                <div key={m.id} className="flex justify-end">
                  <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-surface-2 px-4 py-2.5 text-[15px] leading-7">{m.content}</p>
                </div>
              ) : m.error ? (
                <div key={m.id} role="alert" className="flex items-start gap-2.5 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
                  <Icon name="alert" className="mt-0.5 size-4" />
                  <span>{m.content}</span>
                </div>
              ) : (
                <article key={m.id}>
                  <p className="mb-1.5 text-[13px] font-semibold text-muted">DocMind</p>
                  {m.insufficient && (
                    <p className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-warn-soft px-2.5 py-0.5 text-xs font-medium text-warn">
                      <Icon name="alert" className="size-3.5" /> Not found in your documents
                    </p>
                  )}
                  <RichText content={m.content} citations={m.citations} onCite={openCitation} />
                  <SourceList citations={m.citations} onOpen={openCitation} />
                  {convId && ApiClient.isUUID(m.id) && canAsk && (
                    <div className="mt-3 flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => void giveFeedback(m.id, 1)}
                        aria-label="Helpful answer"
                        aria-pressed={m.user_feedback === 1}
                        className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors ${
                          m.user_feedback === 1 ? 'bg-ok-soft text-ok font-medium' : 'text-faint hover:bg-surface-2 hover:text-fg'
                        }`}
                      >
                        <Icon name="thumbUp" className="size-3.5" /> Helpful
                      </button>
                      <button
                        type="button"
                        onClick={() => void giveFeedback(m.id, -1)}
                        aria-label="Not helpful"
                        aria-pressed={m.user_feedback === -1}
                        className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors ${
                          m.user_feedback === -1 ? 'bg-danger-soft text-danger font-medium' : 'text-faint hover:bg-surface-2 hover:text-fg'
                        }`}
                      >
                        <Icon name="thumbDown" className="size-3.5" /> Needs info
                      </button>
                    </div>
                  )}
                  {m.followups && m.followups.length > 0 && m.id === messages[messages.length - 1]?.id && canAsk && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {m.followups.slice(0, 3).map(f => (
                        <button
                          key={f}
                          type="button"
                          onClick={() => void send(f)}
                          disabled={sending || limitReached}
                          className="rounded-full border border-line px-3 py-1.5 text-left text-[13px] text-muted transition-colors hover:border-line-strong hover:text-fg disabled:opacity-50"
                        >
                          {f}
                        </button>
                      ))}
                    </div>
                  )}
                </article>
              ),
            )}

            {sending && (
              <div className="flex items-center gap-2.5 text-sm text-muted" role="status">
                <Spinner className="size-4" /> Finding passages and writing a cited answer&hellip;
              </div>
            )}
            <div ref={endRef} />
          </div>
        </div>

        {/* Composer */}
        <div className="border-t border-line px-3 py-3 sm:px-5">
          {!canAsk ? (
            <p className="py-2 text-center text-sm text-muted">Viewers can read conversations but cannot ask new questions.</p>
          ) : limitReached ? (
            <p className="py-2 text-center text-sm text-warn">You have used all {usage?.questions_limit.toLocaleString('en-US')} questions for this month. Upgrade in Settings or wait for the reset.</p>
          ) : (
            <form
              onSubmit={e => {
                e.preventDefault();
                void send();
              }}
              className="mx-auto flex max-w-3xl items-end gap-2"
            >
              <label htmlFor="chat-input" className="sr-only">
                Ask a question about your documents
              </label>
              <textarea
                id="chat-input"
                ref={inputRef}
                rows={1}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                placeholder={ready.length ? 'Ask a question about your documents' : 'Upload a document first'}
                disabled={ready.length === 0}
                className="max-h-40 min-h-[2.75rem] flex-1 resize-none rounded-xl border border-line-strong bg-bg px-4 py-2.5 text-[15px] leading-6 placeholder:text-faint focus:border-fg focus:outline-none focus:ring-2 focus:ring-fg/15 disabled:opacity-60"
              />
              <Button type="submit" size="md" className="h-11 w-11 shrink-0 px-0" disabled={!input.trim() || sending || ready.length === 0} aria-label="Send question">
                {sending ? <Spinner /> : <Icon name="send" className="size-[18px]" />}
              </Button>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}
