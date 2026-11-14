'use client';

import React, { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ApiClient,
  ApiError,
  CompanyJoinRequestDTO,
  CompanyOverviewDTO,
  CompanySettingsDTO,
  DocumentDTO,
  KnowledgeGapDTO,
  KnowledgeSpaceDTO,
  PendingInviteDTO,
  ProvisionEmployeesResponse,
  UsageSummaryDTO,
  WorkspaceMemberDTO,
} from '../../lib/api';
import { formatBytes, formatDate, percent, timeAgo } from '../../lib/format';
import { clearSession, readRawSession, UserSession } from '../../lib/session';
import { Button, inputClass, Spinner } from '../ui/Button';
import { Icon, IconName } from '../ui/Icon';
import { Logo, LogoMark } from '../ui/Logo';
import { ThemeToggle } from '../ui/ThemeToggle';
import { ToastProvider, useToast } from '../ui/Toast';
import { EmployeePortalInner } from '../employee/EmployeePortal';
import { QuotaMetersPanel, WorkspaceApiKeysPanel, WorkspaceAuditLogsPanel } from '../workspace/GovernancePanels';
import { FileTypeIcon, Meter, Panel, StatusBadge } from '../workspace/parts';
import { UploadModal } from '../workspace/UploadModal';
import { WorkspaceContextValue, WorkspaceProvider } from '../workspace/WorkspaceContext';
import { LibraryView } from '../workspace/views/LibraryView';

type CompanyTab = 'overview' | 'ask' | 'documents' | 'employees' | 'spaces' | 'policy' | 'gaps' | 'governance';

function companyMonogram(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return `${words[0][0] || ''}${words[1][0] || ''}`.toUpperCase();
  return (name.trim().slice(0, 2) || 'CO').toUpperCase();
}

function generateBatchPassword(prefix?: string): string {
  const cleanPrefix = (prefix || 'DocM').replace(/[^A-Za-z]/g, '').slice(0, 4) || 'Corp';
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const symbols = '!@#$%';
  let suffix = '';
  if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
    const arr = new Uint32Array(7);
    window.crypto.getRandomValues(arr);
    for (let i = 0; i < 6; i += 1) suffix += chars[arr[i] % chars.length];
    suffix += symbols[arr[6] % symbols.length];
  } else {
    suffix = 'K8pN4x!';
  }
  return `${cleanPrefix}-${suffix}`;
}

const subscribeStorage = (cb: () => void) => {
  window.addEventListener('storage', cb);
  return () => window.removeEventListener('storage', cb);
};

function StatCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: IconName;
}) {
  return (
    <Panel className="p-4 transition-colors hover:border-line-strong sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</p>
        {icon && (
          <span className="inline-flex size-7 items-center justify-center rounded-lg bg-surface-2 text-muted">
            <Icon name={icon} className="size-3.5" />
          </span>
        )}
      </div>
      <p className="tabular mt-2.5 text-2xl font-semibold tracking-tight">{value}</p>
      {hint && <p className="mt-1 text-xs text-faint">{hint}</p>}
    </Panel>
  );
}

export function CompanyConsoleInner({
  session,
  portalSlug,
  onSignOut,
}: {
  session: UserSession;
  portalSlug?: string;
  onSignOut?: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const isAdmin = session.role === 'OWNER' || session.role === 'ADMIN';
  const activeSlug = portalSlug || (session.workspaceSlug && session.workspaceSlug !== 'personal' ? session.workspaceSlug : undefined);

  const [tab, setTab] = useState<CompanyTab>(isAdmin ? 'overview' : 'ask');
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<CompanyOverviewDTO | null>(null);
  const [settings, setSettings] = useState<CompanySettingsDTO | null>(null);
  const [usage, setUsage] = useState<UsageSummaryDTO | null>(null);
  const [joinRequests, setJoinRequests] = useState<CompanyJoinRequestDTO[]>([]);
  const [members, setMembers] = useState<WorkspaceMemberDTO[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInviteDTO[]>([]);
  const [spaces, setSpaces] = useState<KnowledgeSpaceDTO[]>([]);
  const [documents, setDocuments] = useState<DocumentDTO[]>([]);
  const [gaps, setGaps] = useState<KnowledgeGapDTO[]>([]);
  const [showGuide, setShowGuide] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Policy edit state
  const [companyName, setCompanyName] = useState('');
  const [domainsInput, setDomainsInput] = useState('');
  const [promptsInput, setPromptsInput] = useState('');
  const [logoUrl, setLogoUrl] = useState<string>('');
  const [savingPolicy, setSavingPolicy] = useState(false);

  // Employee provisioning & directory state
  const [provisionEmails, setProvisionEmails] = useState('');
  const [provisionPassword, setProvisionPassword] = useState('');
  const [showProvisionPassword, setShowProvisionPassword] = useState(true);
  const [provisionRole, setProvisionRole] = useState<'EMPLOYEE' | 'MEMBER' | 'ADMIN'>('EMPLOYEE');
  const [resetExistingPassword, setResetExistingPassword] = useState(false);
  const [provisioning, setProvisioning] = useState(false);
  const [provisionResult, setProvisionResult] = useState<ProvisionEmployeesResponse | null>(null);
  const [lastSentPassword, setLastSentPassword] = useState('');
  const [directorySearch, setDirectorySearch] = useState('');
  const [requestRoleMap, setRequestRoleMap] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  // Space creation
  const [spaceName, setSpaceName] = useState('');
  const [spaceDesc, setSpaceDesc] = useState('');
  const [spaceVis, setSpaceVis] = useState<'ALL_MEMBERS' | 'RESTRICTED'>('ALL_MEMBERS');
  const [spaceUserIds, setSpaceUserIds] = useState<string[]>([]);
  const [creatingSpace, setCreatingSpace] = useState(false);

  // Governance & Knowledge Gap resolution state
  const [govTab, setGovTab] = useState<'quotas' | 'apikeys' | 'audit'>('quotas');
  const [gapFilter, setGapFilter] = useState<'open' | 'resolved' | 'all'>('open');
  const [gapNoteMap, setGapNoteMap] = useState<Record<string, string>>({});
  const [resolvingGapId, setResolvingGapId] = useState<string | null>(null);

  const signOut = useCallback(async () => {
    await ApiClient.logout();
    clearSession();
    if (onSignOut) {
      onSignOut();
    } else if (activeSlug) {
      router.replace(`/${activeSlug}/`);
    } else {
      router.replace('/login/');
    }
  }, [activeSlug, onSignOut, router]);

  const handleErr = useCallback(
    (err: unknown, fallback: string) => {
      if (err instanceof ApiError && err.status === 401) {
        void signOut();
        return;
      }
      if (err instanceof ApiError && err.status === 403 && !isAdmin) {
        if (activeSlug) router.replace(`/${activeSlug}/`);
        return;
      }
      toast(err instanceof Error ? err.message : fallback, 'error');
    },
    [activeSlug, isAdmin, router, signOut, toast],
  );

  const loadAll = useCallback(async () => {
    if (!session.workspaceId) return;
    try {
      if (!isAdmin) {
        const [docs, usg, portal] = await Promise.all([
          ApiClient.listDocuments().catch(() => []),
          ApiClient.getUsage().catch(() => null),
          ApiClient.getEmployeePortalInfo().catch(() => null),
        ]);
        setDocuments(docs);
        setUsage(usg);
        setSpaces(portal?.spaces ?? []);
        setLoading(false);
        return;
      }
      const [ov, st, usg, jr, mems, invs, sp, docs, gp] = await Promise.all([
        ApiClient.getCompanyOverview(),
        ApiClient.getCompanySettings(),
        ApiClient.getUsage().catch(() => null),
        ApiClient.listCompanyJoinRequests(),
        ApiClient.getWorkspaceMembers(session.workspaceId),
        ApiClient.listPendingInvites(session.workspaceId).catch(() => []),
        ApiClient.listCompanySpaces(),
        ApiClient.listDocuments().catch(() => []),
        ApiClient.listCompanyKnowledgeGaps(50, true),
      ]);
      setOverview(ov);
      setSettings(st);
      setUsage(usg);
      setCompanyName(st.name);
      setDomainsInput((st.allowed_domains || []).join(', '));
      setPromptsInput((st.starter_prompts || []).join('\n'));
      setLogoUrl(st.logo_url || ov?.logo_url || '');
      setProvisionPassword(prev => prev || generateBatchPassword(st.name));
      setJoinRequests(jr);
      setMembers(mems);
      setPendingInvites(invs);
      setSpaces(sp);
      setDocuments(docs);
      setGaps(gp);
    } catch (err) {
      handleErr(err, 'Failed to load Company Console.');
    } finally {
      setLoading(false);
    }
  }, [handleErr, isAdmin, session.workspaceId]);

  useEffect(() => {
    const t = setTimeout(() => {
      void loadAll();
    }, 0);
    return () => clearTimeout(t);
  }, [loadAll]);

  const hasInFlightDocs = documents.some(d => ['UPLOADING', 'QUEUED', 'PROCESSING', 'DELETING'].includes(d.status));
  useEffect(() => {
    if (!hasInFlightDocs) return;
    const id = setInterval(() => {
      void loadAll();
    }, 4000);
    return () => clearInterval(id);
  }, [hasInFlightDocs, loadAll]);

  const pendingJoinReqs = useMemo(() => joinRequests.filter(r => r.status === 'PENDING'), [joinRequests]);

  const decideJoin = async (reqId: string, decision: 'APPROVE' | 'REJECT') => {
    setBusyId(reqId);
    try {
      const role = requestRoleMap[reqId] || 'EMPLOYEE';
      await ApiClient.decideJoinRequest(reqId, decision, role);
      toast(decision === 'APPROVE' ? `Approved employee (${role}).` : 'Request declined.', 'success');
      await loadAll();
    } catch (err) {
      handleErr(err, 'Could not process access request.');
    } finally {
      setBusyId(null);
    }
  };

  const createProvisionBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    const list = provisionEmails
      .split(/[\s,;]+/)
      .map(s => s.trim().toLowerCase())
      .filter(s => s.includes('@'));
    if (!list.length) return toast('Enter at least one valid employee email address.', 'error');
    if (provisionPassword.length < 8) {
      return toast('Set a password with at least 8 characters for this employee batch.', 'error');
    }
    setProvisioning(true);
    try {
      const res = await ApiClient.provisionCompanyEmployees({
        emails: list,
        password: provisionPassword,
        role: provisionRole,
        reset_existing_password: resetExistingPassword,
      });
      setProvisionResult(res);
      setLastSentPassword(provisionPassword);
      setProvisionEmails('');
      toast(
        `Processed ${res.results.length} email(s): ${res.created_count} created, ${res.emails_sent_count} credential email(s) sent.`,
        'success',
      );
      await loadAll();
    } catch (err) {
      handleErr(err, 'Could not provision employee accounts.');
    } finally {
      setProvisioning(false);
    }
  };

  const copyProvisionCredentials = async () => {
    if (!provisionResult) return;
    const activePass = lastSentPassword || provisionPassword;
    const summaryLines = [
      `${overview?.company_name || session.workspaceName} — DocMind Portal Login Details`,
      `Portal URL: ${shareUrl || `/${activeSlug || 'company'}/`}`,
      `Shared Batch Password: ${activePass}`,
      `Emails: ${provisionResult.results.map(r => r.email).join(', ')}`,
    ];
    try {
      await navigator.clipboard.writeText(summaryLines.join('\n'));
      toast('Copied portal link, email IDs, and shared password.', 'success');
    } catch {
      toast('Could not copy automatically — copy details directly from the card.', 'info');
    }
  };

  const changeMemberRole = async (userId: string, role: string) => {
    if (!session.workspaceId) return;
    setBusyId(userId);
    try {
      await ApiClient.updateMemberRole(session.workspaceId, userId, role);
      toast('Employee role updated.', 'success');
      await loadAll();
    } catch (err) {
      handleErr(err, 'Could not update role.');
    } finally {
      setBusyId(null);
    }
  };

  const removeMember = async (userId: string, email: string) => {
    if (!session.workspaceId) return;
    setBusyId(userId);
    try {
      await ApiClient.removeWorkspaceMember(session.workspaceId, userId);
      toast(`Removed ${email} from company.`, 'success');
      await loadAll();
    } catch (err) {
      handleErr(err, 'Could not remove member.');
    } finally {
      setBusyId(null);
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast('Company logo file size must be under 2MB.', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setLogoUrl(reader.result);
        toast('Logo selected. Click "Save Company Settings" to apply.', 'info');
      }
    };
    reader.readAsDataURL(file);
  };

  const savePolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPolicy(true);
    try {
      const domains = domainsInput
        .split(/[\s,;]+/)
        .map(d => d.trim().toLowerCase())
        .filter(Boolean);
      const prompts = promptsInput
        .split('\n')
        .map(p => p.trim())
        .filter(Boolean);
      const updated = await ApiClient.updateCompanySettings({
        name: companyName.trim() || undefined,
        allowed_domains: domains,
        join_policy: 'INVITE_ONLY',
        default_join_role: 'EMPLOYEE',
        starter_prompts: prompts,
        logo_url: logoUrl.trim() || null,
      });
      setSettings(updated);
      toast('Company settings and branding saved.', 'success');
      await loadAll();
    } catch (err) {
      handleErr(err, 'Failed to save settings.');
    } finally {
      setSavingPolicy(false);
    }
  };

  const createSpace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!spaceName.trim()) return;
    setCreatingSpace(true);
    try {
      await ApiClient.createCompanySpace({
        name: spaceName.trim(),
        description: spaceDesc.trim() || undefined,
        visibility: spaceVis,
        allowed_roles: spaceVis === 'ALL_MEMBERS' ? ['OWNER', 'ADMIN', 'MEMBER', 'EMPLOYEE', 'VIEWER'] : ['OWNER', 'ADMIN'],
        member_user_ids: spaceVis === 'RESTRICTED' ? spaceUserIds : [],
      });
      setSpaceName('');
      setSpaceDesc('');
      setSpaceUserIds([]);
      toast(`Created space "${spaceName.trim()}".`, 'success');
      await loadAll();
    } catch (err) {
      handleErr(err, 'Failed to create Knowledge Space.');
    } finally {
      setCreatingSpace(false);
    }
  };

  const deleteSpace = async (space: KnowledgeSpaceDTO) => {
    setBusyId(space.id);
    try {
      await ApiClient.deleteCompanySpace(space.id);
      toast(`Deleted space "${space.name}". Documents moved to General.`, 'success');
      await loadAll();
    } catch (err) {
      handleErr(err, 'Could not delete space.');
    } finally {
      setBusyId(null);
    }
  };

  const assignDocSpace = async (doc: DocumentDTO, nextSpaceId: string) => {
    setBusyId(doc.id);
    try {
      await ApiClient.updateDocument(doc.id, {
        ...(nextSpaceId ? { space_id: nextSpaceId, clear_space: false } : { clear_space: true }),
      });
      const targetName = nextSpaceId ? spaces.find(s => s.id === nextSpaceId)?.name || 'selected space' : 'General (All employees)';
      toast(`Moved "${doc.filename}" to ${targetName}.`, 'success');
      await loadAll();
    } catch (err) {
      handleErr(err, 'Could not reassign document space.');
    } finally {
      setBusyId(null);
    }
  };

  const browserOrigin = useSyncExternalStore(
    subscribeStorage,
    () => window.location.origin,
    () => '',
  );
  const shareSlug = activeSlug || settings?.slug || overview?.slug;
  const shareUrl = shareSlug ? (browserOrigin ? `${browserOrigin}/${shareSlug}/` : `/${shareSlug}/`) : '';

  const copyShareUrl = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedLink(true);
      toast(`Copied ${shareUrl} — share with admins & employees.`, 'success');
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      toast('Could not copy URL cleanly; copy it from the Share card.', 'info');
    }
  };

  const filteredMembers = useMemo(() => {
    const q = directorySearch.trim().toLowerCase();
    if (!q) return members;
    return members.filter(m => m.email.toLowerCase().includes(q) || m.role.toLowerCase().includes(q));
  }, [directorySearch, members]);

  const openGapsCount = useMemo(() => gaps.filter(g => !g.resolved).length, [gaps]);
  const filteredGaps = useMemo(() => {
    if (gapFilter === 'open') return gaps.filter(g => !g.resolved);
    if (gapFilter === 'resolved') return gaps.filter(g => !!g.resolved);
    return gaps;
  }, [gapFilter, gaps]);

  const resolveGap = async (gap: KnowledgeGapDTO, resolved: boolean) => {
    setResolvingGapId(gap.message_id);
    try {
      const note = (gapNoteMap[gap.message_id] || '').trim();
      await ApiClient.resolveKnowledgeGap(gap.message_id, resolved, resolved ? note || undefined : undefined);
      toast(resolved ? 'Knowledge gap marked as resolved.' : 'Knowledge gap reopened.', 'success');
      await loadAll();
    } catch (err) {
      handleErr(err, 'Could not update knowledge gap status.');
    } finally {
      setResolvingGapId(null);
    }
  };

  const docWorkspaceCtx = useMemo<WorkspaceContextValue>(
    () => ({
      session,
      usage,
      documents,
      documentsLoaded: !loading,
      conversations: [],
      spaces,
      starterPrompts: settings?.starter_prompts || [],
      loadError: null,
      refreshDocuments: loadAll,
      refreshUsage: loadAll,
      refreshConversations: async () => {},
      reloadAll: loadAll,
      tab: 'library',
      setTab: next => {
        if (next === 'chat') setTab('ask');
        else if (next === 'settings') setTab('policy');
        else if (next === 'library') setTab('documents');
        else setTab('overview');
      },
      chatScope: [],
      setChatScope: () => {},
      askDocuments: () => {
        setTab('ask');
      },
      openUpload: () => setUploadOpen(true),
      openCitation: () => {},
      handleApiError: err => {
        if (err instanceof ApiError && err.status === 401) {
          void signOut();
          return true;
        }
        return false;
      },
      updateWorkspaceTitle: () => {},
      signOut,
      role: session.role,
      canUpload: true,
      canAsk: true,
      canManageMembers: isAdmin,
      isOwner: session.role === 'OWNER',
    }),
    [documents, isAdmin, loadAll, loading, session, settings?.starter_prompts, signOut, spaces, usage],
  );

  const pdfDocs = useMemo(
    () => documents.filter(d => d.filename.toLowerCase().endsWith('.pdf') || d.mime_type === 'application/pdf'),
    [documents],
  );
  const docxDocs = useMemo(
    () =>
      documents.filter(
        d =>
          d.filename.toLowerCase().endsWith('.docx') ||
          d.filename.toLowerCase().endsWith('.doc') ||
          d.mime_type.includes('word'),
      ),
    [documents],
  );
  const txtDocs = useMemo(
    () =>
      documents.filter(
        d =>
          d.filename.toLowerCase().endsWith('.txt') ||
          d.filename.toLowerCase().endsWith('.md') ||
          d.mime_type.includes('text/plain'),
      ),
    [documents],
  );
  const otherDocs = documents.length - pdfDocs.length - docxDocs.length - txtDocs.length;
  const pdfPages = useMemo(() => pdfDocs.reduce((acc, d) => acc + (d.page_count || 0), 0), [pdfDocs]);
  const totalPages = useMemo(() => documents.reduce((acc, d) => acc + (d.page_count || 0), 0), [documents]);
  const readyDocs = useMemo(() => documents.filter(d => d.status === 'READY'), [documents]);
  const inProgressDocs = useMemo(
    () => documents.filter(d => ['UPLOADING', 'QUEUED', 'PROCESSING'].includes(d.status)),
    [documents],
  );
  const failedDocs = useMemo(() => documents.filter(d => d.status === 'FAILED'), [documents]);

  const storageUsed = overview?.storage_bytes ?? usage?.storage_bytes ?? 0;
  const storageLimit = usage?.storage_limit_bytes ?? 10737418240;
  const storagePercent = percent(storageUsed, storageLimit);

  const tabs: { id: CompanyTab; label: string; icon: IconName; badge?: number }[] = isAdmin
    ? [
        { id: 'overview', label: 'Dashboard', icon: 'grid' },
        { id: 'ask', label: 'Ask AI', icon: 'chat' },
        { id: 'documents', label: 'Documents', icon: 'file', badge: documents.length || undefined },
        { id: 'employees', label: 'Employees', icon: 'users', badge: pendingJoinReqs.length || undefined },
        { id: 'spaces', label: 'Departments', icon: 'folder', badge: spaces.length || undefined },
        { id: 'gaps', label: 'Knowledge Gaps', icon: 'alert', badge: openGapsCount || undefined },
        { id: 'governance', label: 'Audit & API', icon: 'shield' },
        { id: 'policy', label: 'Company Settings', icon: 'sliders' },
      ]
    : [
        { id: 'ask', label: 'Ask AI', icon: 'chat' },
        { id: 'documents', label: 'Documents', icon: 'file', badge: documents.length || undefined },
      ];

  const brandName = overview?.company_name || session.workspaceName || 'Company';
  const initials = companyMonogram(brandName);
  const brandLogo = settings?.logo_url || overview?.logo_url || logoUrl;

  return (
    <div className="flex h-screen overflow-hidden bg-bg text-fg">
      {/* Desktop Left Sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col justify-between border-r border-line bg-surface px-3 py-4 lg:flex">
        <div className="space-y-4">
          <Link href="/" className="block px-2.5" aria-label="DocMind Home">
            <Logo />
          </Link>

          {/* Company Brand Badge */}
          <div className="flex items-center gap-2.5 rounded-xl border border-line bg-bg p-2.5">
            {brandLogo ? (
              <div className="size-9 shrink-0 overflow-hidden rounded-lg border border-line bg-surface-2 p-0.5 flex items-center justify-center shadow-xs">
                <img src={brandLogo} alt={brandName} className="size-full object-contain" />
              </div>
            ) : (
              <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand text-xs font-bold tracking-tight text-brand-fg shadow-xs">
                {initials}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold">{brandName}</p>
              <div className="flex items-center gap-1.5">
                <span className="rounded bg-brand/10 px-1.5 py-0.5 text-[10px] font-semibold text-fg">
                  {isAdmin ? 'Admin Console' : 'Contributor'}
                </span>
                {activeSlug && (
                  <span className="truncate font-mono text-[10px] text-muted">
                    /{activeSlug}/
                  </span>
                )}
              </div>
            </div>
          </div>

          <div>
            <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-faint">
              Admin Menu
            </p>
            <nav className="space-y-0.5" aria-label="Company sections">
              {tabs.map(t => {
                const active = tab === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    aria-current={active ? 'page' : undefined}
                    className={`group relative flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
                      active ? 'bg-brand-soft text-brand-ink' : 'text-muted hover:bg-surface-2 hover:text-fg'
                    }`}
                  >
                    {active && (
                      <span className="absolute -left-3 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-brand" aria-hidden="true" />
                    )}
                    <Icon name={t.icon} className="size-[18px]" />
                    <span className="flex-1 truncate">{t.label}</span>
                    {typeof t.badge === 'number' && t.badge > 0 && (
                      <span
                        className={`tabular rounded-full px-1.5 py-0.5 text-[11px] font-semibold leading-none ${
                          t.id === 'gaps' || t.id === 'employees'
                            ? 'bg-warn-soft text-warn'
                            : active
                              ? 'bg-brand/15 text-brand-ink'
                              : 'bg-surface-2 text-faint'
                        }`}
                      >
                        {t.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          {session.isSuperAdmin && (
            <div className="pt-2 border-t border-line space-y-0.5">
              <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-wider text-faint">
                Super Admin
              </p>
              <Link
                href="/admin/"
                className="flex w-full items-center gap-3 rounded-lg px-3 py-1.5 text-xs font-medium text-amber-500 hover:bg-amber-500/10 transition-colors"
              >
                <Icon name="shield" className="size-4" />
                <span>Super Admin Console</span>
              </Link>
            </div>
          )}
        </div>

        {/* Sidebar Footer */}
        <div className="space-y-3 pt-3 border-t border-line">
          {shareUrl && (
            <button
              type="button"
              onClick={() => void copyShareUrl()}
              className="flex w-full items-center justify-between gap-2 rounded-lg border border-line bg-bg px-2.5 py-1.5 text-left text-xs font-medium text-muted hover:bg-surface-2 hover:text-fg transition-colors"
              title="Copy employee sign-in URL"
            >
              <div className="flex items-center gap-1.5 truncate">
                <Icon name={copiedLink ? 'check' : 'copy'} className="size-3.5 shrink-0 text-brand-ink" />
                <span className="truncate">{activeSlug ? `/${activeSlug}/` : 'Portal URL'}</span>
              </div>
              <span className="text-[10px] uppercase font-semibold text-faint">
                {copiedLink ? 'Copied' : 'Copy'}
              </span>
            </button>
          )}

          {usage && (
            <div className="space-y-2 rounded-xl border border-line bg-bg p-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-fg">{usage.tier_name || usage.tier || 'Enterprise'}</span>
                <span className="text-[11px] text-muted">{overview?.total_documents ?? documents.length} docs</span>
              </div>
              <Meter
                label="Storage"
                used={usage.storage_bytes}
                limit={usage.storage_limit_bytes}
                valueText={`${formatBytes(usage.storage_bytes)} / ${formatBytes(usage.storage_limit_bytes)}`}
              />
              <Meter
                label="Questions"
                used={usage.questions_used}
                limit={usage.questions_limit}
                valueText={`${usage.questions_used} / ${usage.questions_limit.toLocaleString('en-US')}`}
              />
            </div>
          )}

          <div className="rounded-xl border border-line bg-surface-2/40 p-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-xs font-semibold text-white shadow-xs">
                  {(session.fullName || session.email).charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-fg">{session.fullName || session.email}</p>
                  <p className="truncate text-[10px] text-muted">{isAdmin ? 'Company Administrator' : 'Contributor'}</p>
                </div>
              </div>
              <ThemeToggle />
            </div>
            <button
              type="button"
              onClick={() => void signOut()}
              className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1 text-xs font-medium text-muted hover:border-danger/30 hover:bg-danger-soft hover:text-danger transition-colors"
              title="Sign out of Admin Console"
            >
              <Icon name="logout" className="size-3.5" />
              <span>Sign out</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top Header Bar */}
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between border-b border-line bg-surface/80 px-4 backdrop-blur-xl sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(m => !m)}
              className="inline-flex size-8 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg lg:hidden"
              aria-label="Toggle navigation menu"
            >
              <Icon name="menu" className="size-4" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-sm font-semibold capitalize text-fg">
                  {tab === 'overview'
                    ? 'Admin Dashboard'
                    : tab === 'spaces'
                      ? 'Departments & Spaces'
                      : tab === 'gaps'
                        ? 'Knowledge Gaps'
                        : tab === 'policy'
                          ? 'Company Settings'
                          : tab === 'governance'
                            ? 'Audit Logs & API Keys'
                            : tab}
                </h1>
                {activeSlug && (
                  <span className="hidden rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-muted sm:inline-block">
                    /{activeSlug}/
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {shareUrl && (
              <Button variant="secondary" size="sm" onClick={() => void copyShareUrl()} className="hidden sm:inline-flex">
                <Icon name={copiedLink ? 'check' : 'copy'} className="size-3.5" />
                <span>{copiedLink ? 'Copied URL' : 'Copy Portal URL'}</span>
              </Button>
            )}
            {isAdmin && (
              <Button variant="secondary" size="sm" onClick={() => setTab('employees')} className="hidden md:inline-flex">
                <Icon name="userCheck" className="size-3.5" />
                <span>Add Employees</span>
              </Button>
            )}
            <Button size="sm" onClick={() => setUploadOpen(true)}>
              <Icon name="upload" className="size-3.5" />
              <span>Upload Docs</span>
            </Button>
            <div className="lg:hidden flex items-center gap-1">
              <ThemeToggle />
              <Button variant="ghost" size="sm" onClick={() => void signOut()} aria-label="Sign out">
                <Icon name="logout" className="size-4" />
              </Button>
            </div>
          </div>
        </header>

        {/* Scrollable View Area */}
        <main className="scroll-thin flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">
            {loading && !overview ? (
              <div className="flex items-center justify-center py-24">
                <Spinner className="size-6 text-fg" />
              </div>
            ) : (
              <>
                {tab === 'overview' && overview && (() => {
                  const needsOnboarding = overview.total_documents === 0 || overview.member_count <= 1;
                  const guideVisible = needsOnboarding || showGuide;
                  return (
                    <div className="space-y-6">
                      {/* Hero Card */}
                      <Panel className="relative overflow-hidden p-5 sm:p-6">
                        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                          <div className="flex items-start gap-4">
                            <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-brand text-lg font-bold tracking-tight text-brand-fg shadow-xs">
                              {initials}
                            </div>
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2 px-2.5 py-0.5 text-[11px] font-semibold text-fg">
                                  <Icon name="shield" className="size-3" /> Admin Control Center
                                </span>
                                <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-[11px] font-medium text-muted">
                                  Plan: <strong className="text-fg">{overview.tier}</strong>
                                </span>
                                {settings?.allowed_domains?.length ? (
                                  <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-[11px] font-medium text-muted">
                                    Domain: <strong className="text-fg">@{settings.allowed_domains.join(', @')}</strong>
                                  </span>
                                ) : null}
                              </div>
                              <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
                                {overview.company_name} Knowledge Hub
                              </h1>
                              <p className="mt-1 text-sm text-muted">
                                Complete visibility over uploaded company PDFs, departments, employee access, and citation-backed RAG intelligence.
                              </p>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            {!needsOnboarding && (
                              <Button variant="ghost" size="sm" onClick={() => setShowGuide(g => !g)}>
                                <Icon name="info" className="size-3.5" />
                                {showGuide ? 'Hide guide' : 'Setup guide'}
                              </Button>
                            )}
                            <Button variant="secondary" size="sm" onClick={() => setTab('employees')}>
                              <Icon name="userCheck" className="size-3.5" /> Add Staff
                            </Button>
                            <Button size="sm" onClick={() => setTab('ask')}>
                              <Icon name="sparkles" className="size-3.5" /> Ask AI
                            </Button>
                          </div>
                        </div>

                        {shareUrl && (
                          <div className="mt-5 flex flex-col gap-3 rounded-xl border border-line bg-surface-2/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                                Company Knowledge Portal Link (For Employees)
                              </p>
                              <p className="mt-0.5 truncate font-mono text-xs font-medium text-fg sm:text-sm">{shareUrl}</p>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              <span className="hidden rounded-md bg-surface px-2 py-1 text-[11px] text-muted sm:inline">
                                Self-signup disabled
                              </span>
                              <Button size="sm" variant="secondary" onClick={() => void copyShareUrl()}>
                                <Icon name={copiedLink ? 'check' : 'copy'} className="size-3.5" />
                                {copiedLink ? 'Copied Link!' : 'Copy Portal Link'}
                              </Button>
                            </div>
                          </div>
                        )}
                      </Panel>

                      {/* Top 4 KPI Metrics */}
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <Panel className="p-4 transition-colors hover:border-line-strong sm:p-5">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-semibold uppercase tracking-wider text-muted">Uploaded Documents</p>
                            <span className="inline-flex size-7 items-center justify-center rounded-lg bg-brand-soft text-brand-ink">
                              <Icon name="file" className="size-3.5" />
                            </span>
                          </div>
                          <div className="mt-2.5 flex items-baseline gap-2">
                            <span className="tabular text-2xl font-semibold tracking-tight">{overview.total_documents}</span>
                            <span className="rounded-md bg-rose-500/10 px-2 py-0.5 text-xs font-bold text-rose-500">
                              {pdfDocs.length} PDFs
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-faint">
                            {totalPages} pages indexed &bull; {readyDocs.length} ready
                          </p>
                        </Panel>

                        <Panel className="p-4 transition-colors hover:border-line-strong sm:p-5">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-semibold uppercase tracking-wider text-muted">Storage Utilization</p>
                            <span className="inline-flex size-7 items-center justify-center rounded-lg bg-surface-2 text-muted">
                              <Icon name="table" className="size-3.5" />
                            </span>
                          </div>
                          <p className="tabular mt-2.5 text-2xl font-semibold tracking-tight">
                            {formatBytes(overview.storage_bytes)}
                          </p>
                          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                            <div
                              className="h-full rounded-full bg-brand transition-all duration-500"
                              style={{ width: `${Math.min(storagePercent, 100)}%` }}
                            />
                          </div>
                          <p className="mt-1 text-xs text-faint">
                            {storagePercent}% of {formatBytes(storageLimit)} quota limit
                          </p>
                        </Panel>

                        <Panel className="p-4 transition-colors hover:border-line-strong sm:p-5">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-semibold uppercase tracking-wider text-muted">Active Workforce</p>
                            <span className="inline-flex size-7 items-center justify-center rounded-lg bg-surface-2 text-muted">
                              <Icon name="users" className="size-3.5" />
                            </span>
                          </div>
                          <div className="mt-2.5 flex items-baseline gap-2">
                            <span className="tabular text-2xl font-semibold tracking-tight">{overview.member_count}</span>
                            {pendingJoinReqs.length > 0 && (
                              <span className="rounded-md bg-warn-soft px-2 py-0.5 text-xs font-semibold text-warn">
                                {pendingJoinReqs.length} pending
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-xs text-faint">
                            {spaces.length} departments &bull; {pendingInvites.length} pending invites
                          </p>
                        </Panel>

                        <Panel className="p-4 transition-colors hover:border-line-strong sm:p-5">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-semibold uppercase tracking-wider text-muted">AI Activity &amp; Quality</p>
                            <span className="inline-flex size-7 items-center justify-center rounded-lg bg-surface-2 text-muted">
                              <Icon name="sparkles" className="size-3.5" />
                            </span>
                          </div>
                          <p className="tabular mt-2.5 text-2xl font-semibold tracking-tight">
                            {overview.monthly_questions}
                            <span className="text-sm font-normal text-muted"> / {overview.monthly_questions_limit}</span>
                          </p>
                          <p className="mt-1 text-xs text-faint">
                            {overview.helpful_rate_pct !== null && overview.helpful_rate_pct !== undefined ? `${overview.helpful_rate_pct}% helpful rating` : 'Active'} ({overview.total_feedback_count} ratings)
                          </p>
                        </Panel>
                      </div>

                      {/* Document Fleet & PDF Telemetry Card */}
                      <Panel className="p-5 sm:p-6">
                        <div className="flex flex-col gap-3 border-b border-line pb-4 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex items-center gap-3">
                            <span className="inline-flex size-10 items-center justify-center rounded-xl bg-brand-soft text-brand-ink">
                              <Icon name="file" className="size-5" />
                            </span>
                            <div>
                              <h2 className="text-base font-semibold">Document Fleet &amp; Format Telemetry</h2>
                              <p className="text-xs text-muted">
                                Complete breakdown of uploaded PDFs, Word docs, text handbooks, and ingestion pipeline health.
                              </p>
                            </div>
                          </div>
                          <Button variant="secondary" size="sm" onClick={() => setTab('documents')}>
                            Manage All Documents ({documents.length})
                          </Button>
                        </div>

                        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                          {/* PDF count card */}
                          <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-3.5">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold uppercase tracking-wider text-rose-500">PDF Files</span>
                              <span className="rounded bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-bold text-rose-500">PDF</span>
                            </div>
                            <p className="mt-1.5 text-2xl font-bold tracking-tight text-fg">{pdfDocs.length}</p>
                            <p className="mt-1 text-[11px] text-muted">
                              {pdfPages} pages ({Math.round(pdfDocs.length / (documents.length || 1) * 100)}% of library)
                            </p>
                          </div>

                          {/* Word count card */}
                          <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-3.5">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold uppercase tracking-wider text-blue-500">Word Docs</span>
                              <span className="rounded bg-blue-500/15 px-1.5 py-0.5 text-[10px] font-bold text-blue-500">DOCX</span>
                            </div>
                            <p className="mt-1.5 text-2xl font-bold tracking-tight text-fg">{docxDocs.length}</p>
                            <p className="mt-1 text-[11px] text-muted">Office policies &amp; contracts</p>
                          </div>

                          {/* Text & MD count card */}
                          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3.5">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold uppercase tracking-wider text-amber-500">Text &amp; Markdown</span>
                              <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-500">TXT/MD</span>
                            </div>
                            <p className="mt-1.5 text-2xl font-bold tracking-tight text-fg">{txtDocs.length}</p>
                            <p className="mt-1 text-[11px] text-muted">Documentation &amp; notes</p>
                          </div>

                          {/* Ingestion Health */}
                          <div className="rounded-xl border border-line bg-surface-2/40 p-3.5">
                            <span className="text-xs font-bold uppercase tracking-wider text-muted">Pipeline Health</span>
                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                              <span className="rounded-md bg-ok-soft px-2 py-0.5 text-xs font-semibold text-ok">
                                {readyDocs.length} Ready
                              </span>
                              {inProgressDocs.length > 0 && (
                                <span className="flex items-center gap-1 rounded-md bg-warn-soft px-2 py-0.5 text-xs font-semibold text-warn">
                                  <Spinner className="size-2.5" /> {inProgressDocs.length} In-flight
                                </span>
                              )}
                              {failedDocs.length > 0 && (
                                <span className="rounded-md bg-danger-soft px-2 py-0.5 text-xs font-semibold text-danger">
                                  {failedDocs.length} Failed
                                </span>
                              )}
                            </div>
                            <p className="mt-1 text-[11px] text-muted">OCR &amp; Vector Index Status</p>
                          </div>
                        </div>

                        {/* Format distribution bar */}
                        {documents.length > 0 && (
                          <div className="mt-4 space-y-1.5">
                            <div className="flex items-center justify-between text-xs text-muted">
                              <span>Format Distribution</span>
                              <span>{documents.length} Total Files Uploaded</span>
                            </div>
                            <div className="flex h-2 w-full overflow-hidden rounded-full bg-surface-2">
                              <div
                                className="bg-rose-500 transition-all duration-500"
                                style={{ width: `${(pdfDocs.length / documents.length) * 100}%` }}
                                title={`PDFs: ${pdfDocs.length}`}
                              />
                              <div
                                className="bg-blue-500 transition-all duration-500"
                                style={{ width: `${(docxDocs.length / documents.length) * 100}%` }}
                                title={`Word Docs: ${docxDocs.length}`}
                              />
                              <div
                                className="bg-amber-500 transition-all duration-500"
                                style={{ width: `${(txtDocs.length / documents.length) * 100}%` }}
                                title={`Text & Markdown: ${txtDocs.length}`}
                              />
                              {otherDocs > 0 && (
                                <div
                                  className="bg-purple-500 transition-all duration-500"
                                  style={{ width: `${(otherDocs / documents.length) * 100}%` }}
                                  title={`Other: ${otherDocs}`}
                                />
                              )}
                            </div>
                          </div>
                        )}
                      </Panel>

                      {/* Actionable Alerts (Pending join requests) */}
                      {pendingJoinReqs.length > 0 && (
                        <Panel className="border-warn/40 bg-warn-soft/20 p-5 sm:p-6">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                              <span className="inline-flex size-8 items-center justify-center rounded-lg bg-warn-soft text-warn">
                                <Icon name="alert" className="size-4" />
                              </span>
                              <div>
                                <h2 className="text-base font-semibold">
                                  Pending Employee Access Requests ({pendingJoinReqs.length})
                                </h2>
                                <p className="text-xs text-muted">Staff waiting for account approval</p>
                              </div>
                            </div>
                            <Button variant="secondary" size="sm" onClick={() => setTab('employees')}>
                              View All in Employees
                            </Button>
                          </div>
                          <ul className="mt-4 divide-y divide-line">
                            {pendingJoinReqs.slice(0, 3).map(r => (
                              <li key={r.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                  <p className="text-sm font-semibold">{r.email}</p>
                                  <p className="text-xs text-muted">Requested {timeAgo(r.created_at)}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Button size="sm" onClick={() => void decideJoin(r.id, 'APPROVE')} disabled={busyId === r.id}>
                                    Approve
                                  </Button>
                                  <Button variant="ghost" size="sm" onClick={() => void decideJoin(r.id, 'REJECT')} disabled={busyId === r.id}>
                                    Reject
                                  </Button>
                                </div>
                              </li>
                            ))}
                          </ul>
                        </Panel>
                      )}

                      {/* Quick Admin Actions Launchpad */}
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <button
                          type="button"
                          onClick={() => setUploadOpen(true)}
                          className="group flex flex-col items-start rounded-xl border border-line bg-surface p-4 text-left transition hover:border-brand hover:shadow-xs"
                        >
                          <span className="inline-flex size-9 items-center justify-center rounded-lg bg-brand-soft text-brand-ink transition group-hover:scale-105">
                            <Icon name="upload" className="size-4" />
                          </span>
                          <p className="mt-3 text-sm font-semibold">Upload New Documents</p>
                          <p className="mt-0.5 text-xs text-muted">Add company handbooks, PDF policies or spreadsheets.</p>
                        </button>

                        <button
                          type="button"
                          onClick={() => setTab('employees')}
                          className="group flex flex-col items-start rounded-xl border border-line bg-surface p-4 text-left transition hover:border-brand hover:shadow-xs"
                        >
                          <span className="inline-flex size-9 items-center justify-center rounded-lg bg-surface-2 text-muted transition group-hover:scale-105">
                            <Icon name="userCheck" className="size-4" />
                          </span>
                          <p className="mt-3 text-sm font-semibold">Add Employee Accounts</p>
                          <p className="mt-0.5 text-xs text-muted">Provision staff credentials and email login links.</p>
                        </button>

                        <button
                          type="button"
                          onClick={() => setTab('spaces')}
                          className="group flex flex-col items-start rounded-xl border border-line bg-surface p-4 text-left transition hover:border-brand hover:shadow-xs"
                        >
                          <span className="inline-flex size-9 items-center justify-center rounded-lg bg-surface-2 text-muted transition group-hover:scale-105">
                            <Icon name="folder" className="size-4" />
                          </span>
                          <p className="mt-3 text-sm font-semibold">Create Department Space</p>
                          <p className="mt-0.5 text-xs text-muted">Group documents for HR, Legal, or Engineering.</p>
                        </button>

                        <button
                          type="button"
                          onClick={() => setTab('ask')}
                          className="group flex flex-col items-start rounded-xl border border-line bg-surface p-4 text-left transition hover:border-brand hover:shadow-xs"
                        >
                          <span className="inline-flex size-9 items-center justify-center rounded-lg bg-surface-2 text-muted transition group-hover:scale-105">
                            <Icon name="sparkles" className="size-4" />
                          </span>
                          <p className="mt-3 text-sm font-semibold">Test Portal Ask AI</p>
                          <p className="mt-0.5 text-xs text-muted">Experience citation-grounded answers as an employee.</p>
                        </button>
                      </div>

                      {/* Recent Documents Table */}
                      <Panel className="overflow-hidden">
                        <div className="flex flex-col gap-3 border-b border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <h2 className="text-base font-semibold">
                              Recent Company Uploads ({documents.length})
                            </h2>
                            <p className="text-xs text-muted">
                              Documents available for citations. Assign to <strong>General (All employees)</strong> or a Department Space.
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Button variant="secondary" size="sm" onClick={() => setTab('documents')}>
                              Manage All in Documents ({documents.length})
                            </Button>
                            <Button size="sm" onClick={() => setUploadOpen(true)}>
                              <Icon name="upload" className="size-3.5" /> Upload Doc
                            </Button>
                          </div>
                        </div>

                        {inProgressDocs.length > 0 && (
                          <div className="flex items-center gap-2 border-b border-line bg-warn-soft/50 px-5 py-2.5 text-xs text-warn">
                            <Spinner className="size-3.5" />
                            <span>
                              {inProgressDocs.length} document{inProgressDocs.length === 1 ? ' is' : 's are'} currently queued or processing. Once status becomes <strong>Ready</strong>, employees can query it.
                            </span>
                          </div>
                        )}

                        {documents.length === 0 ? (
                          <div className="px-5 py-10 text-center">
                            <p className="text-sm font-medium">No company documents uploaded yet</p>
                            <p className="mt-1 text-xs text-muted">
                              Upload your first policy, handbook, or guide so employees can search and ask questions.
                            </p>
                            <Button className="mt-4" size="sm" onClick={() => setUploadOpen(true)}>
                              <Icon name="upload" className="size-3.5" /> Upload your first company doc
                            </Button>
                          </div>
                        ) : (
                          <ul className="divide-y divide-line">
                            {documents.slice(0, 6).map(d => (
                              <li key={d.id} className="flex flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex min-w-0 items-center gap-3">
                                  <FileTypeIcon filename={d.filename} />
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                      <p className="truncate text-sm font-medium">{d.filename}</p>
                                      {d.filename.toLowerCase().endsWith('.pdf') && (
                                        <span className="rounded bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-bold text-rose-500">
                                          PDF
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-xs text-muted">
                                      {d.page_count ? `${d.page_count} pages • ` : ''}
                                      {formatBytes(d.size_bytes)} &bull; {timeAgo(d.created_at)}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex flex-wrap items-center gap-2.5">
                                  <StatusBadge status={d.status} />
                                  <select
                                    aria-label={`Department visibility for ${d.filename}`}
                                    value={d.space_id || ''}
                                    disabled={busyId === d.id}
                                    onChange={e => void assignDocSpace(d, e.target.value)}
                                    className="h-8 rounded-lg border border-line-strong bg-surface px-2.5 text-xs font-medium"
                                  >
                                    <option value="">General (All employees)</option>
                                    {spaces.map(sp => (
                                      <option key={sp.id} value={sp.id}>
                                        {sp.name} ({sp.visibility === 'RESTRICTED' ? 'Restricted' : 'All Company'})
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </Panel>

                      {/* Quotas & Open Gaps */}
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">
                            Plan Quotas &amp; Usage
                          </h2>
                          <Button variant="ghost" size="sm" onClick={() => setTab('governance')}>
                            <Icon name="shield" className="size-3.5" /> API Keys &amp; Audit Logs <Icon name="arrowRight" className="size-3" />
                          </Button>
                        </div>
                        <QuotaMetersPanel usage={usage} memberCount={overview.member_count} />
                      </div>

                      <Panel className="p-5 sm:p-6">
                        <div className="flex items-center justify-between">
                          <div>
                            <h2 className="text-base font-semibold">Recent Open Knowledge Gaps</h2>
                            <p className="text-sm text-muted">Questions employees flagged with 👎 or where company docs lacked coverage.</p>
                          </div>
                          {gaps.length > 0 && (
                            <Button variant="secondary" size="sm" onClick={() => setTab('gaps')}>
                              Manage gaps ({openGapsCount} open)
                            </Button>
                          )}
                        </div>
                        {overview.recent_gaps.length === 0 ? (
                          <p className="mt-4 text-sm text-muted">No unanswered or downvoted employee questions yet.</p>
                        ) : (
                          <ul className="mt-4 divide-y divide-line">
                            {overview.recent_gaps.slice(0, 5).map(g => (
                              <li key={g.id} className="py-3">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="text-sm font-medium">{g.question}</p>
                                    <p className="mt-0.5 text-xs text-muted">
                                      Asked by {g.user_email} &bull; {timeAgo(g.created_at)}
                                      {g.comment ? ` • "${g.comment}"` : ''}
                                    </p>
                                  </div>
                                  <span className="shrink-0 rounded-full bg-warn-soft px-2.5 py-0.5 text-[11px] font-medium text-warn">
                                    {g.reason === 'NEGATIVE_FEEDBACK' ? '👎 Flagged' : 'Missing Info'}
                                  </span>
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </Panel>
                    </div>
                  );
                })()}

            {tab === 'ask' && (
              <EmployeePortalInner
                session={session}
                embedded
                portalSlug={activeSlug}
                onOpenUpload={() => setUploadOpen(true)}
              />
            )}

            {tab === 'documents' && (
              <WorkspaceProvider value={docWorkspaceCtx}>
                <LibraryView />
              </WorkspaceProvider>
            )}

            {tab === 'employees' && (
              <div className="space-y-6">
                {shareUrl && (
                  <Panel className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                    <div className="min-w-0">
                      <h2 className="text-sm font-semibold">Shareable Employee Sign-In Link</h2>
                      <p className="mt-0.5 truncate font-mono text-xs text-muted">{shareUrl}</p>
                    </div>
                    <Button size="sm" variant="secondary" onClick={() => void copyShareUrl()}>
                      <Icon name={copiedLink ? 'check' : 'copy'} className="size-3.5" />
                      {copiedLink ? 'Copied!' : 'Copy Link'}
                    </Button>
                  </Panel>
                )}
                {pendingJoinReqs.length > 0 && (
                  <Panel className="border-ok/40 p-5 sm:p-6">
                    <h2 className="text-base font-semibold">Pending Company Email Access Requests ({pendingJoinReqs.length})</h2>
                    <p className="mt-1 text-sm text-muted">Employees who signed in using your verified corporate email domain.</p>
                    <ul className="mt-4 divide-y divide-line">
                      {pendingJoinReqs.map(r => (
                        <li key={r.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-sm font-semibold">{r.email}</p>
                            <p className="text-xs text-muted">
                              Requested {timeAgo(r.created_at)}
                              {r.department_note ? ` • Team: ${r.department_note}` : ''}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <select
                              aria-label={`Role for ${r.email}`}
                              value={requestRoleMap[r.id] || 'EMPLOYEE'}
                              onChange={e => setRequestRoleMap(prev => ({ ...prev, [r.id]: e.target.value }))}
                              className="h-9 rounded-lg border border-line-strong bg-surface px-2.5 text-xs font-medium"
                            >
                              <option value="EMPLOYEE">Employee (Ask &amp; Read)</option>
                              <option value="MEMBER">Contributor (Ask + Upload)</option>
                              <option value="ADMIN">Company Admin</option>
                              <option value="VIEWER">Viewer (Read Only)</option>
                            </select>
                            <Button size="sm" onClick={() => void decideJoin(r.id, 'APPROVE')} disabled={busyId === r.id}>
                              Approve
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => void decideJoin(r.id, 'REJECT')} disabled={busyId === r.id}>
                              Reject
                            </Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </Panel>
                )}

                <Panel className="overflow-hidden p-5 sm:p-6">
                  <div className="flex flex-col gap-2 border-b border-line pb-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted">
                        <Icon name="mail" className="size-3.5 text-fg" />
                        <span>Admin-Managed Account Provisioning</span>
                      </div>
                      <h2 className="mt-1 text-lg font-semibold tracking-tight">Add Employee Accounts &amp; Email Credentials</h2>
                      <p className="mt-1 text-sm text-muted">
                        Create employee accounts directly with a dynamic batch password. Every added employee receives an email with your portal URL, their email ID, and this password.
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full border border-line bg-surface-2 px-3 py-1 text-xs font-medium text-muted">
                      Self-signup disabled on portal
                    </span>
                  </div>

                  <form onSubmit={createProvisionBatch} className="mt-5 space-y-4">
                    <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
                      <div>
                        <div className="mb-1.5 flex items-center justify-between">
                          <label htmlFor="prov-emails" className="text-xs font-semibold uppercase tracking-wide text-muted">
                            Employee Email Addresses
                          </label>
                          <span className="text-[11px] text-muted">
                            {provisionEmails
                              .split(/[\s,;]+/)
                              .map(s => s.trim())
                              .filter(s => s.includes('@')).length}{' '}
                            email(s) detected
                          </span>
                        </div>
                        <textarea
                          id="prov-emails"
                          rows={5}
                          value={provisionEmails}
                          onChange={e => setProvisionEmails(e.target.value)}
                          placeholder={'rahul@infosys.com\nanita@infosys.com\npriya@infosys.com'}
                          className="w-full rounded-xl border border-line-strong bg-bg px-3.5 py-2.5 font-mono text-xs sm:text-sm placeholder:text-faint focus:border-fg focus:outline-none"
                        />
                        <p className="mt-1.5 text-xs text-muted">
                          Separate multiple emails using commas, spaces, or new lines (up to 50 per batch).
                        </p>
                      </div>

                      <div className="space-y-3.5 rounded-xl border border-line bg-surface-2/40 p-4">
                        <div>
                          <div className="mb-1.5 flex items-center justify-between gap-2">
                            <label htmlFor="prov-pass" className="text-xs font-semibold uppercase tracking-wide text-muted">
                              Shared Employee Password
                            </label>
                            <button
                              type="button"
                              onClick={() => setProvisionPassword(generateBatchPassword(overview?.company_name || session.workspaceName))}
                              className="inline-flex items-center gap-1 rounded-md border border-line bg-surface px-2 py-0.5 text-[11px] font-semibold text-fg hover:bg-surface-2"
                            >
                              <Icon name="retry" className="size-3" /> Regenerate
                            </button>
                          </div>
                          <div className="relative">
                            <input
                              id="prov-pass"
                              type={showProvisionPassword ? 'text' : 'password'}
                              required
                              minLength={8}
                              value={provisionPassword}
                              onChange={e => setProvisionPassword(e.target.value)}
                              placeholder="Min 8 characters"
                              className={`${inputClass} pr-10 font-mono text-xs sm:text-sm`}
                            />
                            <button
                              type="button"
                              onClick={() => setShowProvisionPassword(s => !s)}
                              aria-label={showProvisionPassword ? 'Hide password' : 'Show password'}
                              className="absolute inset-y-0 right-1.5 my-auto inline-flex size-8 items-center justify-center rounded-lg text-muted hover:text-fg"
                            >
                              <Icon name={showProvisionPassword ? 'eyeOff' : 'eye'} className="size-4" />
                            </button>
                          </div>
                          <p className="mt-1 text-[11px] text-muted">
                            This password is assigned to all new employees in this batch and emailed to them. Employees can change it later inside their portal.
                          </p>
                        </div>

                        <div>
                          <label htmlFor="prov-role" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">
                            Assigned Portal Role
                          </label>
                          <select
                            id="prov-role"
                            value={provisionRole}
                            onChange={e => setProvisionRole(e.target.value as 'EMPLOYEE' | 'MEMBER' | 'ADMIN')}
                            className={inputClass}
                          >
                            <option value="EMPLOYEE">Employee (Ask AI &amp; Read Company Docs)</option>
                            <option value="MEMBER">Contributor (Ask AI + Upload Docs)</option>
                            <option value="ADMIN">Company Admin (Full Control Center)</option>
                          </select>
                        </div>

                        <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-line bg-surface p-2.5 text-xs">
                          <input
                            type="checkbox"
                            checked={resetExistingPassword}
                            onChange={e => setResetExistingPassword(e.target.checked)}
                            className="mt-0.5 size-3.5 rounded border-line-strong"
                          />
                          <span className="text-muted">
                            Also update password &amp; re-email existing single-company members if included above
                          </span>
                        </label>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                      <p className="text-xs text-muted">
                        Each employee signs in at <span className="font-mono text-fg">/{activeSlug || 'company'}/</span> using their company email &amp; password.
                      </p>
                      <Button type="submit" disabled={provisioning || !provisionEmails.trim() || provisionPassword.length < 8}>
                        {provisioning ? <Spinner /> : <Icon name="mail" className="size-4" />}
                        <span>Create Accounts &amp; Send Email</span>
                      </Button>
                    </div>
                  </form>

                  {provisionResult && (
                    <div className="mt-6 rounded-xl border border-ok/35 bg-ok-soft/40 p-4">
                      <div className="flex flex-col gap-3 border-b border-line pb-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <h3 className="text-sm font-semibold text-fg">Provisioning Batch Receipt</h3>
                          <p className="text-xs text-muted">
                            {provisionResult.created_count} created &bull; {provisionResult.emails_sent_count} credential email(s) sent &bull; {provisionResult.skipped_count} skipped
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-lg border border-line bg-surface px-2.5 py-1 font-mono text-xs text-fg">
                            Batch Password: <strong>{lastSentPassword}</strong>
                          </span>
                          <Button type="button" size="sm" variant="secondary" onClick={() => void copyProvisionCredentials()}>
                            <Icon name="copy" className="size-3.5" /> Copy Login Details
                          </Button>
                        </div>
                      </div>
                      <ul className="mt-3 divide-y divide-line">
                        {provisionResult.results.map(item => (
                          <li key={item.email} className="flex flex-col gap-1.5 py-2 text-xs sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <span className="font-mono font-semibold text-fg">{item.email}</span>
                              <span className="ml-2 text-muted">{item.detail}</span>
                            </div>
                            <div className="flex shrink-0 items-center gap-1.5">
                              <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-medium capitalize text-fg">
                                {item.status.replace('_', ' ')}
                              </span>
                              <span
                                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                  item.email_sent ? 'bg-ok-soft text-ok' : 'bg-warn-soft text-warn'
                                }`}
                              >
                                {item.email_sent ? 'Email Sent' : 'Share Manually'}
                              </span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </Panel>

                <Panel className="overflow-hidden">
                  <div className="flex flex-col gap-3 border-b border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="text-base font-semibold">Employee Directory ({members.length})</h2>
                      <p className="text-xs text-muted">Active provisioned accounts with access to {overview?.company_name || session.workspaceName}.</p>
                    </div>
                    <div className="relative w-full sm:w-64">
                      <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
                      <input
                        type="search"
                        value={directorySearch}
                        onChange={e => setDirectorySearch(e.target.value)}
                        placeholder="Search by email or role..."
                        className="h-9 w-full rounded-lg border border-line-strong bg-bg pl-8 pr-3 text-xs focus:border-fg focus:outline-none"
                      />
                    </div>
                  </div>
                  <ul className="divide-y divide-line">
                    {filteredMembers.length === 0 ? (
                      <li className="px-5 py-8 text-center text-sm text-muted">No matching members found.</li>
                    ) : (
                      filteredMembers.map(m => (
                        <li key={m.user_id} className="flex flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex min-w-0 items-center gap-3">
                            <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs font-bold uppercase text-fg">
                              {m.email.slice(0, 2)}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">{m.email}</p>
                              <p className="text-xs text-muted">Added {formatDate(m.joined_at)}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {m.role === 'OWNER' ? (
                              <span className="rounded-md bg-brand/10 px-2.5 py-1 text-xs font-semibold">Owner</span>
                            ) : (
                              <>
                                <select
                                  aria-label={`Role for ${m.email}`}
                                  value={m.role}
                                  disabled={busyId === m.user_id}
                                  onChange={e => void changeMemberRole(m.user_id, e.target.value)}
                                  className="h-8 rounded-lg border border-line-strong bg-surface px-2.5 text-xs font-medium"
                                >
                                  <option value="ADMIN">Admin</option>
                                  <option value="MEMBER">Contributor</option>
                                  <option value="EMPLOYEE">Employee</option>
                                  <option value="VIEWER">Viewer</option>
                                </select>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={busyId === m.user_id}
                                  onClick={() => void removeMember(m.user_id, m.email)}
                                  aria-label={`Remove ${m.email}`}
                                >
                                  <Icon name="trash" className="size-4 text-danger" />
                                </Button>
                              </>
                            )}
                          </div>
                        </li>
                      ))
                    )}
                  </ul>
                </Panel>

                {pendingInvites.length > 0 && (
                  <Panel className="overflow-hidden">
                    <div className="border-b border-line px-5 py-4">
                      <h2 className="text-base font-semibold">Pending Email Invitations ({pendingInvites.length})</h2>
                    </div>
                    <ul className="divide-y divide-line">
                      {pendingInvites.map(inv => (
                        <li key={inv.id} className="flex items-center justify-between px-5 py-3 text-sm">
                          <div>
                            <p className="font-medium">{inv.email}</p>
                            <p className="text-xs text-muted">Role: {inv.role} &bull; Expires {formatDate(inv.expires_at)}</p>
                          </div>
                          <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs text-muted">Pending</span>
                        </li>
                      ))}
                    </ul>
                  </Panel>
                )}
              </div>
            )}

            {tab === 'spaces' && (
              <div className="space-y-6">
                <div className="flex items-start gap-2.5 rounded-xl border border-brand/25 bg-brand/5 px-4 py-3 text-sm">
                  <Icon name="info" className="mt-0.5 size-4 shrink-0 text-fg" />
                  <p className="text-xs leading-5 text-muted">
                    <strong className="text-fg">How Department Spaces work:</strong> Docs without a space sit in <strong>General</strong> and are visible to all employees. Assign docs to a space in{' '}
                    <button type="button" onClick={() => setTab('overview')} className="font-semibold text-fg underline underline-offset-2">
                      Overview
                    </button>{' '}
                    or{' '}
                    <button type="button" onClick={() => setTab('documents')} className="font-semibold text-fg underline underline-offset-2">
                      Documents
                    </button>
                    . Restricted spaces stay hidden in the Employee Portal unless an employee is checked below.
                  </p>
                </div>

                <Panel className="p-5 sm:p-6">
                  <h2 className="text-base font-semibold">Create Department / Knowledge Space</h2>
                  <p className="mt-1 text-sm text-muted">
                    Organize company documents by department. Restricted spaces stay hidden from general employees unless explicitly granted.
                  </p>
                  <form onSubmit={createSpace} className="mt-4 space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label htmlFor="sp-name" className="mb-1 block text-xs font-medium text-muted">Space name</label>
                        <input
                          id="sp-name"
                          type="text"
                          required
                          placeholder="e.g. HR Policies, Engineering, Legal"
                          value={spaceName}
                          onChange={e => setSpaceName(e.target.value)}
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label htmlFor="sp-vis" className="mb-1 block text-xs font-medium text-muted">Access level</label>
                        <select
                          id="sp-vis"
                          value={spaceVis}
                          onChange={e => setSpaceVis(e.target.value as 'ALL_MEMBERS' | 'RESTRICTED')}
                          className={inputClass}
                        >
                          <option value="ALL_MEMBERS">All company members</option>
                          <option value="RESTRICTED">Restricted (Admins + selected employees)</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label htmlFor="sp-desc" className="mb-1 block text-xs font-medium text-muted">Description (optional)</label>
                      <input
                        id="sp-desc"
                        type="text"
                        placeholder="What documents belong in this department space?"
                        value={spaceDesc}
                        onChange={e => setSpaceDesc(e.target.value)}
                        className={inputClass}
                      />
                    </div>
                    {spaceVis === 'RESTRICTED' && members.filter(m => m.role !== 'OWNER' && m.role !== 'ADMIN').length > 0 && (
                      <div>
                        <p className="mb-1.5 text-xs font-medium text-muted">Grant access to specific employees:</p>
                        <div className="flex flex-wrap gap-2">
                          {members
                            .filter(m => m.role !== 'OWNER' && m.role !== 'ADMIN')
                            .map(m => {
                              const checked = spaceUserIds.includes(m.user_id);
                              return (
                                <label key={m.user_id} className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-line px-2.5 py-1 text-xs">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() =>
                                      setSpaceUserIds(prev => (checked ? prev.filter(x => x !== m.user_id) : [...prev, m.user_id]))
                                    }
                                  />
                                  <span>{m.email}</span>
                                </label>
                              );
                            })}
                        </div>
                      </div>
                    )}
                    <Button type="submit" disabled={creatingSpace || !spaceName.trim()}>
                      {creatingSpace && <Spinner />} Create Knowledge Space
                    </Button>
                  </form>
                </Panel>

                <Panel className="overflow-hidden">
                  <div className="border-b border-line px-5 py-4">
                    <h2 className="text-base font-semibold">Department Spaces ({spaces.length})</h2>
                  </div>
                  {spaces.length === 0 ? (
                    <p className="px-5 py-8 text-center text-sm text-muted">
                      No spaces created yet. All documents currently sit in General Company Access.
                    </p>
                  ) : (
                    <ul className="divide-y divide-line">
                      {spaces.map(sp => {
                        const spaceDocs = documents.filter(d => d.space_id === sp.id);
                        const grantedEmails = members
                          .filter(m => sp.member_user_ids.includes(m.user_id))
                          .map(m => m.email);
                        return (
                        <li key={sp.id} className="flex items-start justify-between gap-3 px-5 py-4">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <Icon name="folder" className="size-4 text-muted" />
                              <span className="text-sm font-semibold">{sp.name}</span>
                              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${sp.visibility === 'RESTRICTED' ? 'bg-warn-soft text-warn' : 'bg-surface-2 text-muted'}`}>
                                {sp.visibility === 'RESTRICTED' ? 'Restricted' : 'All Company'}
                              </span>
                            </div>
                            {sp.description && <p className="mt-1 text-xs text-muted">{sp.description}</p>}
                            <p className="mt-1.5 text-xs text-muted">
                              <span className="font-medium text-fg">Access:</span>{' '}
                              {sp.visibility === 'ALL_MEMBERS'
                                ? 'All company employees'
                                : grantedEmails.length > 0
                                  ? `Admins + ${grantedEmails.join(', ')}`
                                  : 'Admins only (no specific employees selected)'}
                            </p>
                            <div className="mt-1.5 text-xs text-faint">
                              {spaceDocs.length === 0 ? (
                                <span>
                                  0 documents assigned &mdash; assign in{' '}
                                  <button type="button" onClick={() => setTab('overview')} className="text-fg underline underline-offset-2">
                                    Overview
                                  </button>{' '}
                                  or{' '}
                                  <button type="button" onClick={() => setTab('documents')} className="text-fg underline underline-offset-2">
                                    Documents
                                  </button>
                                </span>
                              ) : (
                                <span className="flex flex-wrap items-center gap-1.5">
                                  <span className="text-muted">{sp.document_count} doc(s):</span>
                                  {spaceDocs.slice(0, 3).map(d => (
                                    <span key={d.id} className="rounded bg-surface-2 px-1.5 py-0.5 text-[11px] text-fg">
                                      {d.filename}
                                    </span>
                                  ))}
                                  {spaceDocs.length > 3 && <span>+{spaceDocs.length - 3} more</span>}
                                </span>
                              )}
                            </div>
                          </div>
                          <Button variant="ghost" size="sm" disabled={busyId === sp.id} onClick={() => void deleteSpace(sp)}>
                            <Icon name="trash" className="size-4 text-danger" />
                          </Button>
                        </li>
                        );
                      })}
                    </ul>
                  )}
                </Panel>
              </div>
            )}

            {tab === 'policy' && (
              <Panel className="p-5 sm:p-6">
                <div className="flex flex-col gap-2 border-b border-line pb-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-base font-semibold">Company Portal Identity &amp; Prompt Settings</h2>
                    <p className="mt-1 text-sm text-muted">
                      Customize your displayed organization name, corporate email domain hints, and starter AI questions.
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1 text-xs font-medium text-muted">
                    <Icon name="lock" className="size-3.5 text-fg" />
                    Admin-Managed Sign In Only
                  </span>
                </div>

                <form onSubmit={savePolicy} className="mt-5 space-y-5">
                  {/* Company Logo & Branding */}
                  <div className="rounded-xl border border-line bg-surface-2/40 p-4">
                    <label className="mb-1 block text-sm font-medium">Company Logo &amp; Branding</label>
                    <p className="mb-3 text-xs text-muted">
                      Upload your company&apos;s official logo (PNG, SVG, JPEG, or WebP under 2MB). It appears on the employee login portal (/{activeSlug || 'company'}/), employee portal header, and this admin console.
                    </p>
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                      <div className="flex size-20 shrink-0 items-center justify-center rounded-xl border border-line bg-surface p-2 shadow-xs">
                        {logoUrl ? (
                          <img src={logoUrl} alt="Company logo preview" className="size-full object-contain" />
                        ) : (
                          <span className="inline-flex size-14 items-center justify-center rounded-xl bg-brand text-lg font-bold text-brand-fg">
                            {initials}
                          </span>
                        )}
                      </div>
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-fg hover:bg-surface-2 transition-colors">
                            <Icon name="upload" className="size-3.5" />
                            <span>Upload Logo Image</span>
                            <input
                              type="file"
                              accept="image/png,image/jpeg,image/svg+xml,image/webp"
                              onChange={handleLogoUpload}
                              className="sr-only"
                            />
                          </label>
                          {logoUrl && (
                            <button
                              type="button"
                              onClick={() => {
                                setLogoUrl('');
                                toast('Logo removed. Click "Save Company Settings" to apply.', 'info');
                              }}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-danger/30 bg-danger-soft px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger-soft/80 transition-colors"
                            >
                              <Icon name="trash" className="size-3.5" />
                              <span>Remove Logo</span>
                            </button>
                          )}
                        </div>
                        <p className="text-[11px] text-faint">
                          Square or landscape SVG or PNG with transparent background recommended.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="pol-name" className="mb-1.5 block text-sm font-medium">Company name</label>
                    <input id="pol-name" type="text" required value={companyName} onChange={e => setCompanyName(e.target.value)} className={inputClass} />
                  </div>

                  <div>
                    <label htmlFor="pol-domains" className="mb-1.5 block text-sm font-medium">Associated corporate email domain(s)</label>
                    <input
                      id="pol-domains"
                      type="text"
                      placeholder="infosys.com, infosys.co.in"
                      value={domainsInput}
                      onChange={e => setDomainsInput(e.target.value)}
                      className={inputClass}
                    />
                    <p className="mt-1 text-xs text-faint">Public webmail domains like gmail.com or yahoo.com are ignored. Domain lookup only redirects staff to /{activeSlug || 'company'}/.</p>
                  </div>

                  <div>
                    <label htmlFor="pol-prompts" className="mb-1.5 block text-sm font-medium">
                      Suggested questions on Employee Portal (one per line)
                    </label>
                    <textarea
                      id="pol-prompts"
                      rows={4}
                      placeholder={'What is our annual leave and WFH policy?\nHow do I submit travel expenses?\nSummarize our vendor NDA requirements.'}
                      value={promptsInput}
                      onChange={e => setPromptsInput(e.target.value)}
                      className="w-full rounded-xl border border-line-strong bg-bg px-3.5 py-2.5 text-sm placeholder:text-faint focus:border-fg focus:outline-none"
                    />
                  </div>

                  <Button type="submit" disabled={savingPolicy}>
                    {savingPolicy && <Spinner />} Save Company Settings
                  </Button>
                </form>
              </Panel>
            )}

            {tab === 'gaps' && (
              <Panel className="overflow-hidden">
                <div className="flex flex-col gap-3 border-b border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-base font-semibold">Knowledge Gaps &amp; Employee Feedback</h2>
                    <p className="mt-0.5 text-sm text-muted">
                      Upload missing policies or handbooks, then mark gaps as resolved to keep your knowledge base accurate.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex rounded-lg border border-line bg-surface-2 p-0.5 text-xs font-medium">
                      <button
                        type="button"
                        onClick={() => setGapFilter('open')}
                        className={`rounded-md px-2.5 py-1 transition-colors ${gapFilter === 'open' ? 'bg-surface text-fg shadow-xs' : 'text-muted hover:text-fg'}`}
                      >
                        Open ({openGapsCount})
                      </button>
                      <button
                        type="button"
                        onClick={() => setGapFilter('resolved')}
                        className={`rounded-md px-2.5 py-1 transition-colors ${gapFilter === 'resolved' ? 'bg-surface text-fg shadow-xs' : 'text-muted hover:text-fg'}`}
                      >
                        Resolved ({gaps.length - openGapsCount})
                      </button>
                      <button
                        type="button"
                        onClick={() => setGapFilter('all')}
                        className={`rounded-md px-2.5 py-1 transition-colors ${gapFilter === 'all' ? 'bg-surface text-fg shadow-xs' : 'text-muted hover:text-fg'}`}
                      >
                        All ({gaps.length})
                      </button>
                    </div>
                    <Button size="sm" variant="secondary" onClick={() => setUploadOpen(true)}>
                      <Icon name="upload" className="size-3.5" /> Upload Doc
                    </Button>
                  </div>
                </div>
                {filteredGaps.length === 0 ? (
                  <p className="px-5 py-12 text-center text-sm text-muted">
                    {gapFilter === 'open'
                      ? 'All caught up! No open knowledge gaps right now.'
                      : gapFilter === 'resolved'
                        ? 'No resolved knowledge gaps yet.'
                        : 'No gaps or negative ratings reported yet.'}
                  </p>
                ) : (
                  <ul className="divide-y divide-line">
                    {filteredGaps.map(g => (
                      <li key={g.id} className="space-y-2.5 px-5 py-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <p className="text-sm font-semibold">{g.question}</p>
                          <div className="flex shrink-0 items-center gap-1.5">
                            <span className="rounded-full bg-warn-soft px-2.5 py-0.5 text-[11px] font-medium text-warn">
                              {g.reason === 'NEGATIVE_FEEDBACK' ? '👎 Needs better info' : 'Not found in docs'}
                            </span>
                            {g.resolved && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-ok-soft px-2.5 py-0.5 text-[11px] font-semibold text-ok">
                                <Icon name="check" className="size-3" /> Resolved
                              </span>
                            )}
                          </div>
                        </div>
                        <p className="text-xs text-muted">{g.answer_excerpt}</p>
                        {g.comment && <p className="text-xs text-fg">Employee note: &ldquo;{g.comment}&rdquo;</p>}
                        <p className="text-[11px] text-faint">
                          {g.user_email} &bull; {formatDate(g.created_at)}
                        </p>

                        {g.resolved ? (
                          <div className="flex flex-col gap-2 rounded-xl border border-ok/25 bg-ok-soft/40 p-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="text-xs text-fg">
                              <span className="font-semibold">
                                Resolved{g.resolved_by_email ? ` by ${g.resolved_by_email}` : ''}
                              </span>
                              {g.resolved_at ? ` • ${formatDate(g.resolved_at)}` : ''}
                              {g.resolution_note && <p className="mt-0.5 text-muted">Note: {g.resolution_note}</p>}
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={resolvingGapId === g.message_id}
                              onClick={() => void resolveGap(g, false)}
                            >
                              {resolvingGapId === g.message_id ? <Spinner className="size-3.5" /> : <Icon name="retry" className="size-3.5" />}
                              Reopen
                            </Button>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:items-center">
                            <input
                              type="text"
                              value={gapNoteMap[g.message_id] || ''}
                              onChange={e => setGapNoteMap(prev => ({ ...prev, [g.message_id]: e.target.value }))}
                              placeholder="Optional resolution note (e.g. Uploaded FY27 Leave Policy PDF)..."
                              className="h-9 flex-1 rounded-lg border border-line-strong bg-bg px-3 text-xs focus:border-fg focus:outline-none"
                            />
                            <Button
                              size="sm"
                              disabled={resolvingGapId === g.message_id}
                              onClick={() => void resolveGap(g, true)}
                            >
                              {resolvingGapId === g.message_id ? <Spinner className="size-3.5" /> : <Icon name="check" className="size-3.5" />}
                              Mark Resolved
                            </Button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            )}

            {tab === 'governance' && (
              <div className="space-y-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold tracking-tight">Governance, Quotas &amp; Developer API</h2>
                    <p className="text-sm text-muted">
                      Monitor plan capacity, issue workspace API keys, and inspect or export compliance audit trails.
                    </p>
                  </div>
                  <div className="flex rounded-xl border border-line bg-surface p-1 text-xs font-medium">
                    <button
                      type="button"
                      onClick={() => setGovTab('quotas')}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-colors ${govTab === 'quotas' ? 'bg-brand text-brand-fg shadow-xs' : 'text-muted hover:text-fg'}`}
                    >
                      <Icon name="layers" className="size-3.5" /> Quotas &amp; Plan
                    </button>
                    <button
                      type="button"
                      onClick={() => setGovTab('apikeys')}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-colors ${govTab === 'apikeys' ? 'bg-brand text-brand-fg shadow-xs' : 'text-muted hover:text-fg'}`}
                    >
                      <Icon name="key" className="size-3.5" /> API Keys
                    </button>
                    <button
                      type="button"
                      onClick={() => setGovTab('audit')}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-colors ${govTab === 'audit' ? 'bg-brand text-brand-fg shadow-xs' : 'text-muted hover:text-fg'}`}
                    >
                      <Icon name="history" className="size-3.5" /> Audit Logs
                    </button>
                  </div>
                </div>

                {govTab === 'quotas' && (
                  <QuotaMetersPanel usage={usage} memberCount={overview?.member_count ?? members.length} showTierComparison />
                )}
                {govTab === 'apikeys' && (
                  <WorkspaceApiKeysPanel
                    workspaceId={session.workspaceId}
                    canManage={isAdmin}
                    onAuthError={docWorkspaceCtx.handleApiError}
                  />
                )}
                {govTab === 'audit' && (
                  <WorkspaceAuditLogsPanel
                    workspaceId={session.workspaceId}
                    workspaceSlug={activeSlug || session.workspaceSlug}
                    canManage={isAdmin}
                    onAuthError={docWorkspaceCtx.handleApiError}
                  />
                )}
              </div>
            )}
          </>
        )}
          </div>
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" aria-label="Mobile navigation">
        {[
          { id: 'overview' as const, label: 'Dashboard', icon: 'grid' as const },
          { id: 'ask' as const, label: 'Ask AI', icon: 'chat' as const },
          { id: 'documents' as const, label: 'Docs', icon: 'file' as const, badge: documents.length },
          { id: 'employees' as const, label: 'Staff', icon: 'users' as const, badge: pendingJoinReqs.length },
          { id: 'spaces' as const, label: 'Spaces', icon: 'folder' as const, badge: spaces.length },
        ].map(item => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setTab(item.id);
                setMobileMenuOpen(false);
              }}
              className={`flex flex-col items-center gap-1 py-2 text-[10px] font-medium ${active ? 'text-brand-ink' : 'text-faint'}`}
            >
              <span className={`relative inline-flex h-6 w-10 items-center justify-center rounded-full transition-colors ${active ? 'bg-brand-soft text-brand-ink' : ''}`}>
                <Icon name={item.icon} className="size-4" />
                {typeof item.badge === 'number' && item.badge > 0 && (
                  <span className="absolute -top-1 -right-1 size-3.5 rounded-full bg-warn text-[9px] font-bold text-white flex items-center justify-center">
                    {item.badge}
                  </span>
                )}
              </span>
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Mobile Slide-Over Drawer for full navigation */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-xs" onClick={() => setMobileMenuOpen(false)} />
          <div className="relative flex w-72 max-w-xs flex-1 flex-col bg-surface p-4 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-line">
              <Logo />
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-lg p-1 text-muted hover:bg-surface-2"
              >
                <Icon name="x" className="size-5" />
              </button>
            </div>
            <div className="mt-4 flex-1 space-y-1 overflow-y-auto">
              {tabs.map(t => {
                const active = tab === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setTab(t.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium ${
                      active ? 'bg-brand-soft text-brand-ink' : 'text-muted hover:bg-surface-2'
                    }`}
                  >
                    <Icon name={t.icon} className="size-4" />
                    <span className="flex-1">{t.label}</span>
                    {typeof t.badge === 'number' && t.badge > 0 && (
                      <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-xs font-semibold">
                        {t.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="pt-3 border-t border-line">
              <Button variant="ghost" size="sm" onClick={() => void signOut()} className="w-full justify-start">
                <Icon name="logout" className="size-4" />
                <span>Sign Out</span>
              </Button>
            </div>
          </div>
        </div>
      )}

      <UploadModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onUploaded={() => {
          void loadAll();
        }}
        maxFileMb={usage?.max_file_mb ?? 25}
        spaces={spaces}
      />
    </div>
  );
}

export function CompanyConsole() {
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
    } else if (session && session.role !== 'OWNER' && session.role !== 'ADMIN' && session.role !== 'MEMBER') {
      router.replace('/employee/');
    }
  }, [raw, session, router]);

  if (!session || (session.role !== 'OWNER' && session.role !== 'ADMIN' && session.role !== 'MEMBER')) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="size-6 text-fg" />
      </div>
    );
  }

  return (
    <ToastProvider>
      <CompanyConsoleInner session={session} />
    </ToastProvider>
  );
}
