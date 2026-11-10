'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import {
  ApiClient,
  ApiError,
  CitationDTO,
  ConversationDTO,
  DocumentDTO,
  UsageSummaryDTO,
  WorkspaceDetailDTO,
} from '../../lib/api';
import { clearSession, loadSession, readRawSession, saveSession, UserSession } from '../../lib/session';
import { Spinner } from '../ui/Button';
import { ToastProvider, useToast } from '../ui/Toast';
import { MobileNav, Sidebar, TopBar } from './Chrome';
import { CitationDrawer } from './CitationDrawer';
import { GlobalSearchModal } from './GlobalSearchModal';
import { UploadModal } from './UploadModal';
import { TabId, WorkspaceProvider } from './WorkspaceContext';
import { ErrorBanner } from './parts';
import { DashboardView } from './views/DashboardView';
import { LibraryView } from './views/LibraryView';
import { ChatView } from './views/ChatView';
import { CompareView } from './views/CompareView';
import { SettingsView } from './views/SettingsView';
import { AdminConsole } from '../AdminConsole';

const TABS: TabId[] = ['dashboard', 'library', 'chat', 'compare', 'settings', 'admin'];

function parseTab(hash: string): TabId {
  const h = hash.replace('#', '') as TabId;
  return TABS.includes(h) ? h : 'dashboard';
}

function subscribeHash(cb: () => void) {
  window.addEventListener('hashchange', cb);
  window.addEventListener('popstate', cb);
  return () => {
    window.removeEventListener('hashchange', cb);
    window.removeEventListener('popstate', cb);
  };
}

function Shell({ session: initialSession }: { session: UserSession }) {
  const router = useRouter();
  const toast = useToast();

  const [session, setSession] = useState<UserSession>(initialSession);
  const [workspaceKey, setWorkspaceKey] = useState(0);
  const tab = parseTab(useSyncExternalStore(subscribeHash, () => window.location.hash, () => ''));
  const [usage, setUsage] = useState<UsageSummaryDTO | null>(null);
  const [documents, setDocuments] = useState<DocumentDTO[]>([]);
  const [documentsLoaded, setDocumentsLoaded] = useState(false);
  const [conversations, setConversations] = useState<ConversationDTO[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [chatScope, setChatScope] = useState<string[]>([]);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [citation, setCitation] = useState<CitationDTO | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const expiredHandled = useRef(false);
  const mainRef = useRef<HTMLElement>(null);

  /* ---- tab <-> URL hash (back button and deep links work) ---- */
  const setTab = useCallback((next: TabId) => {
    window.history.pushState(null, '', `#${next}`);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    mainRef.current?.scrollTo({ top: 0 });
  }, []);

  /* ---- sign out / expired session ---- */
  const signOut = useCallback(async () => {
    await ApiClient.logout();
    clearSession();
    router.replace('/login/');
  }, [router]);

  /** Returns true if the error was handled here (session expired). */
  const handleApiError = useCallback(
    (err: unknown): boolean => {
      if (err instanceof ApiError && err.status === 401) {
        if (!expiredHandled.current) {
          expiredHandled.current = true;
          toast('Your session has expired. Sign in again to continue.', 'error');
          void signOut();
        }
        return true;
      }
      return false;
    },
    [signOut, toast],
  );

  /* ---- data loading ---- */
  const refreshUsage = useCallback(async () => {
    try {
      setUsage(await ApiClient.getUsage());
    } catch (err) {
      handleApiError(err);
    }
  }, [handleApiError]);

  const refreshDocuments = useCallback(async () => {
    try {
      setDocuments(await ApiClient.listDocuments());
      setDocumentsLoaded(true);
      setLoadError(null);
    } catch (err) {
      if (!handleApiError(err)) {
        setLoadError(err instanceof Error && !(err instanceof TypeError) ? err.message : 'Cannot reach the DocMind server.');
      }
      setDocumentsLoaded(true);
    }
  }, [handleApiError]);

  const refreshConversations = useCallback(async () => {
    try {
      setConversations(await ApiClient.listConversations());
    } catch (err) {
      handleApiError(err);
    }
  }, [handleApiError]);

  const reloadAll = useCallback(async () => {
    try {
      const dash = await ApiClient.getDashboard(50);
      setUsage(dash.usage);
      setDocuments(dash.recent_documents);
      setConversations(dash.recent_conversations);
      setDocumentsLoaded(true);
      setLoadError(null);

      if (typeof dash.is_superadmin === 'boolean') {
        const flag = dash.is_superadmin;
        setSession(prev => (Boolean(prev.isSuperAdmin) === flag ? prev : { ...prev, isSuperAdmin: flag }));
        const stored = loadSession();
        if (stored && Boolean(stored.isSuperAdmin) !== flag) {
          saveSession({ ...stored, isSuperAdmin: flag });
        }
      }
    } catch (err) {
      if (!handleApiError(err)) {
        setLoadError(err instanceof Error && !(err instanceof TypeError) ? err.message : 'Cannot reach the DocMind server.');
      }
      setDocumentsLoaded(true);
    }
  }, [handleApiError]);

  useEffect(() => {
    if (tab === 'admin' && !session.isSuperAdmin) {
      setTab('dashboard');
      return;
    }
    if (session.isSuperAdmin) {
      const explicitWs = typeof window !== 'undefined' && window.location.search.includes('view=workspace');
      if (tab === 'admin' || (!explicitWs && tab === 'dashboard')) {
        router.replace('/admin/');
      }
    }
  }, [tab, session.isSuperAdmin, setTab, router]);

  useEffect(() => {
    // Fetch on mount and whenever the workspace changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reloadAll();
  }, [reloadAll, workspaceKey]);

  // Poll while any document is still being ingested.
  const hasInFlight = documents.some(d => ['UPLOADING', 'QUEUED', 'PROCESSING', 'DELETING'].includes(d.status));
  useEffect(() => {
    if (!hasInFlight) return;
    const id = setInterval(() => {
      void refreshDocuments();
    }, 4000);
    return () => clearInterval(id);
  }, [hasInFlight, refreshDocuments]);

  // Refresh usage whenever the number of ready documents changes (a finished ingestion changes storage).
  const readyCount = documents.filter(d => d.status === 'READY').length;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (documentsLoaded) void refreshUsage();
  }, [readyCount, documentsLoaded, refreshUsage]);

  /* ---- workspace switching ---- */
  const switchWorkspace = (ws: WorkspaceDetailDTO) => {
    ApiClient.setActiveWorkspaceId(ws.id);
    const next: UserSession = {
      ...session,
      workspaceId: ws.id,
      workspaceName: ws.name,
      workspaceSlug: ws.slug,
      isCompany: !/personal/i.test(ws.name),
      role: ws.role as UserSession['role'],
    };
    saveSession(next);
    setSession(next);
    setDocuments([]);
    setDocumentsLoaded(false);
    setConversations([]);
    setUsage(null);
    setChatScope([]);
    setWorkspaceKey(k => k + 1);
    toast(`Switched to ${ws.name}.`, 'success');
  };

  /* ---- permissions ---- */
  const role = session.role;
  const canUpload = role !== 'VIEWER';
  const canAsk = role !== 'VIEWER';
  const canManageMembers = role === 'OWNER' || role === 'ADMIN';
  const isOwner = role === 'OWNER';

  const ctx = useMemo(
    () => ({
      session,
      usage,
      documents,
      documentsLoaded,
      conversations,
      loadError,
      refreshDocuments,
      refreshUsage,
      refreshConversations,
      reloadAll,
      tab,
      setTab,
      chatScope,
      setChatScope,
      askDocuments: (ids: string[]) => {
        setChatScope(ids);
        setTab('chat');
      },
      openUpload: () => setUploadOpen(true),
      openCitation: (c: CitationDTO) => setCitation(c),
      handleApiError,
      updateWorkspaceTitle: (name: string) => {
        setSession(prev => {
          const next = { ...prev, workspaceName: name };
          saveSession(next);
          return next;
        });
      },
      signOut,
      role,
      canUpload,
      canAsk,
      canManageMembers,
      isOwner,
    }),
    [
      session, usage, documents, documentsLoaded, conversations, loadError, refreshDocuments, refreshUsage,
      refreshConversations, reloadAll, tab, setTab, chatScope, handleApiError, signOut, role, canUpload, canAsk,
      canManageMembers, isOwner,
    ],
  );

  if (tab === 'admin' && session.isSuperAdmin) {
    return (
      <WorkspaceProvider value={ctx}>
        <AdminConsole
          adminEmail={session.email}
          onBackToApp={() => router.push('/app/?view=workspace#dashboard')}
          onSignOut={signOut}
        />
      </WorkspaceProvider>
    );
  }

  return (
    <WorkspaceProvider value={ctx}>
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar onSwitchWorkspace={switchWorkspace} onSignOut={signOut} onOpenSearch={() => setSearchOpen(true)} />
          <main ref={mainRef} className="scroll-thin flex-1 overflow-y-auto px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-10" key={workspaceKey}>
            <div className={`mx-auto min-w-0 ${tab === 'chat' ? 'h-full max-w-6xl' : 'max-w-5xl'}`}>
              {loadError && tab !== 'chat' && <ErrorBanner message={loadError} onRetry={() => void reloadAll()} />}
              {tab === 'dashboard' && <DashboardView />}
              {tab === 'library' && <LibraryView />}
              {tab === 'chat' && <ChatView />}
              {tab === 'compare' && <CompareView />}
              {tab === 'settings' && <SettingsView />}
            </div>
          </main>
        </div>
        <MobileNav />
      </div>

      <UploadModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onUploaded={() => {
          void refreshDocuments();
          void refreshUsage();
        }}
        maxFileMb={usage?.max_file_mb ?? 20}
      />
      <GlobalSearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
      <CitationDrawer
        citation={citation}
        onClose={() => setCitation(null)}
        onAskDocument={id => {
          setChatScope([id]);
          setTab('chat');
        }}
      />
    </WorkspaceProvider>
  );
}

const subscribeStorage = (cb: () => void) => {
  window.addEventListener('storage', cb);
  return () => window.removeEventListener('storage', cb);
};

export function WorkspaceApp() {
  const router = useRouter();
  // null while hydrating, '' when nobody is signed in
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
    if (raw !== null && !session) router.replace('/login/');
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
      <Shell session={session} />
    </ToastProvider>
  );
}
