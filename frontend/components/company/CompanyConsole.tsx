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
  KnowledgeGapDTO,
  KnowledgeSpaceDTO,
  PendingInviteDTO,
  WorkspaceMemberDTO,
} from '../../lib/api';
import { formatBytes, formatDate, timeAgo } from '../../lib/format';
import { clearSession, readRawSession, UserSession } from '../../lib/session';
import { Button, inputClass, Spinner } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { Logo } from '../ui/Logo';
import { ThemeToggle } from '../ui/ThemeToggle';
import { ToastProvider, useToast } from '../ui/Toast';
import { Meter, Panel } from '../workspace/parts';

type CompanyTab = 'overview' | 'employees' | 'spaces' | 'policy' | 'gaps';

const subscribeStorage = (cb: () => void) => {
  window.addEventListener('storage', cb);
  return () => window.removeEventListener('storage', cb);
};

function StatCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <Panel className="p-4 sm:p-5">
      <p className="text-xs font-medium uppercase tracking-wider text-muted">{label}</p>
      <p className="tabular mt-2 text-2xl font-semibold tracking-tight">{value}</p>
      {hint && <p className="mt-1 text-xs text-faint">{hint}</p>}
    </Panel>
  );
}

function CompanyConsoleInner({ session }: { session: UserSession }) {
  const router = useRouter();
  const toast = useToast();

  const [tab, setTab] = useState<CompanyTab>('overview');
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<CompanyOverviewDTO | null>(null);
  const [settings, setSettings] = useState<CompanySettingsDTO | null>(null);
  const [joinRequests, setJoinRequests] = useState<CompanyJoinRequestDTO[]>([]);
  const [members, setMembers] = useState<WorkspaceMemberDTO[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInviteDTO[]>([]);
  const [spaces, setSpaces] = useState<KnowledgeSpaceDTO[]>([]);
  const [gaps, setGaps] = useState<KnowledgeGapDTO[]>([]);

  // Policy edit state
  const [companyName, setCompanyName] = useState('');
  const [domainsInput, setDomainsInput] = useState('');
  const [joinPolicy, setJoinPolicy] = useState<'INVITE_ONLY' | 'DOMAIN_APPROVAL' | 'DOMAIN_AUTO_JOIN'>('INVITE_ONLY');
  const [defaultRole, setDefaultRole] = useState<'EMPLOYEE' | 'MEMBER' | 'VIEWER'>('EMPLOYEE');
  const [promptsInput, setPromptsInput] = useState('');
  const [savingPolicy, setSavingPolicy] = useState(false);

  // Employee actions
  const [bulkEmails, setBulkEmails] = useState('');
  const [bulkRole, setBulkRole] = useState<'EMPLOYEE' | 'MEMBER' | 'ADMIN'>('EMPLOYEE');
  const [inviting, setInviting] = useState(false);
  const [requestRoleMap, setRequestRoleMap] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  // Space creation
  const [spaceName, setSpaceName] = useState('');
  const [spaceDesc, setSpaceDesc] = useState('');
  const [spaceVis, setSpaceVis] = useState<'ALL_MEMBERS' | 'RESTRICTED'>('ALL_MEMBERS');
  const [spaceUserIds, setSpaceUserIds] = useState<string[]>([]);
  const [creatingSpace, setCreatingSpace] = useState(false);

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
      if (err instanceof ApiError && err.status === 403) {
        router.replace('/employee/');
        return;
      }
      toast(err instanceof Error ? err.message : fallback, 'error');
    },
    [router, signOut, toast],
  );

  const loadAll = useCallback(async () => {
    if (!session.workspaceId) return;
    try {
      const [ov, st, jr, mems, invs, sp, gp] = await Promise.all([
        ApiClient.getCompanyOverview(),
        ApiClient.getCompanySettings(),
        ApiClient.listCompanyJoinRequests(),
        ApiClient.getWorkspaceMembers(session.workspaceId),
        ApiClient.listPendingInvites(session.workspaceId).catch(() => []),
        ApiClient.listCompanySpaces(),
        ApiClient.listCompanyKnowledgeGaps(50),
      ]);
      setOverview(ov);
      setSettings(st);
      setCompanyName(st.name);
      setDomainsInput((st.allowed_domains || []).join(', '));
      setJoinPolicy(st.join_policy);
      setDefaultRole(st.default_join_role);
      setPromptsInput((st.starter_prompts || []).join('\n'));
      setJoinRequests(jr);
      setMembers(mems);
      setPendingInvites(invs);
      setSpaces(sp);
      setGaps(gp);
    } catch (err) {
      handleErr(err, 'Failed to load Company Console.');
    } finally {
      setLoading(false);
    }
  }, [handleErr, session.workspaceId]);

  useEffect(() => {
    const t = setTimeout(() => {
      void loadAll();
    }, 0);
    return () => clearTimeout(t);
  }, [loadAll]);

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

  const sendBulkInvites = async (e: React.FormEvent) => {
    e.preventDefault();
    const list = bulkEmails
      .split(/[\s,;]+/)
      .map(s => s.trim())
      .filter(s => s.includes('@'));
    if (!list.length) return toast('Enter at least one valid email address.', 'error');
    setInviting(true);
    try {
      const res = await ApiClient.bulkInviteEmployees(list, bulkRole);
      toast(`Processed: ${res.added_count} added, ${res.invited_count} invited, ${res.skipped_count} skipped.`, 'success');
      setBulkEmails('');
      await loadAll();
    } catch (err) {
      handleErr(err, 'Could not invite employees.');
    } finally {
      setInviting(false);
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
        join_policy: joinPolicy,
        default_join_role: defaultRole,
        starter_prompts: prompts,
      });
      setSettings(updated);
      toast('Company domain & onboarding policy saved.', 'success');
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

  const tabs: { id: CompanyTab; label: string; badge?: number }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'employees', label: 'Employees', badge: pendingJoinReqs.length || undefined },
    { id: 'spaces', label: 'Departments' },
    { id: 'policy', label: 'Domain & Policy' },
    { id: 'gaps', label: 'Knowledge Gaps', badge: gaps.length || undefined },
  ];

  return (
    <div className="min-h-screen bg-bg text-fg">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-line bg-bg/90 px-4 backdrop-blur sm:px-6">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/app/" aria-label="DocMind">
              <Logo />
            </Link>
            <span className="hidden h-4 w-px bg-line sm:inline-block" />
            <div className="hidden min-w-0 items-center gap-2 sm:flex">
              <span className="truncate text-sm font-semibold">{overview?.company_name || session.workspaceName}</span>
              <span className="rounded-md bg-brand/10 px-2 py-0.5 text-[11px] font-semibold text-fg">Company Console</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/employee/"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 text-xs font-medium hover:bg-surface-2"
            >
              <Icon name="userCheck" className="size-3.5 text-muted" />
              <span className="hidden sm:inline">Employee Portal</span>
            </Link>
            <Link
              href="/app/#library"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand px-3 text-xs font-medium text-brand-fg hover:opacity-90"
            >
              <Icon name="upload" className="size-3.5" />
              <span>Docs &amp; Upload</span>
            </Link>
            {session.isSuperAdmin && (
              <Link
                href="/admin/"
                className="hidden h-8 items-center gap-1 rounded-lg border border-amber-500/30 px-2.5 text-xs font-medium text-amber-500 hover:bg-amber-500/10 md:inline-flex"
              >
                <Icon name="shield" className="size-3.5" /> Super Admin
              </Link>
            )}
            <ThemeToggle />
            <Button variant="ghost" size="sm" onClick={() => void signOut()}>
              <Icon name="logout" className="size-4" />
            </Button>
          </div>
        </div>

        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto pb-2" aria-label="Company sections">
          {tabs.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                tab === t.id ? 'bg-brand text-brand-fg' : 'text-muted hover:bg-surface-2 hover:text-fg'
              }`}
            >
              <span>{t.label}</span>
              {t.badge !== undefined && t.badge > 0 && (
                <span className={`tabular rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${tab === t.id ? 'bg-white/20 text-white' : 'bg-warn-soft text-warn'}`}>
                  {t.badge}
                </span>
              )}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        {loading && !overview ? (
          <div className="flex items-center justify-center py-24">
            <Spinner className="size-6 text-fg" />
          </div>
        ) : (
          <>
            {tab === 'overview' && overview && (
              <div className="space-y-6">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h1 className="text-2xl font-semibold tracking-tight">{overview.company_name} Control Center</h1>
                    <p className="text-sm text-muted">
                      Plan: <strong>{overview.tier}</strong> &bull; Verified Domains:{' '}
                      <strong>{settings?.allowed_domains?.length ? settings.allowed_domains.join(', ') : 'None claimed yet'}</strong>
                    </p>
                  </div>
                  {pendingJoinReqs.length > 0 && (
                    <Button size="sm" onClick={() => setTab('employees')}>
                      Review {pendingJoinReqs.length} pending employee request{pendingJoinReqs.length === 1 ? '' : 's'}
                    </Button>
                  )}
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <StatCard label="Employees" value={overview.member_count} hint={`${pendingJoinReqs.length} awaiting approval`} />
                  <StatCard label="Company Docs" value={`${overview.ready_documents} / ${overview.total_documents}`} hint={formatBytes(overview.storage_bytes)} />
                  <StatCard label="Departments" value={overview.spaces_count} hint="Knowledge spaces" />
                  <StatCard
                    label="Answer Quality"
                    value={overview.helpful_rate_pct !== null && overview.helpful_rate_pct !== undefined ? `${overview.helpful_rate_pct}%` : '—'}
                    hint={`${overview.total_feedback_count} employee ratings`}
                  />
                </div>

                <Panel className="p-5 sm:p-6">
                  <h2 className="text-base font-semibold">Monthly AI Question Capacity</h2>
                  <div className="mt-4">
                    <Meter
                      label="Questions asked across company this month"
                      used={overview.monthly_questions}
                      limit={overview.monthly_questions_limit}
                      valueText={`${overview.monthly_questions.toLocaleString()} of ${overview.monthly_questions_limit.toLocaleString()}`}
                    />
                  </div>
                </Panel>

                <Panel className="p-5 sm:p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-base font-semibold">Recent Employee Knowledge Gaps</h2>
                      <p className="text-sm text-muted">Questions employees flagged with 👎 or where company docs lacked coverage.</p>
                    </div>
                    {gaps.length > 0 && (
                      <Button variant="secondary" size="sm" onClick={() => setTab('gaps')}>
                        View all ({gaps.length})
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
            )}

            {tab === 'employees' && (
              <div className="space-y-6">
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

                <Panel className="p-5 sm:p-6">
                  <h2 className="text-base font-semibold">Invite Employees</h2>
                  <p className="mt-1 text-sm text-muted">Paste one or more employee emails (comma or newline separated).</p>
                  <form onSubmit={sendBulkInvites} className="mt-4 space-y-3">
                    <textarea
                      rows={3}
                      value={bulkEmails}
                      onChange={e => setBulkEmails(e.target.value)}
                      placeholder="rahul@company.com, priya@company.com"
                      className="w-full rounded-xl border border-line-strong bg-bg px-3.5 py-2.5 text-sm placeholder:text-faint focus:border-fg focus:outline-none"
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={bulkRole}
                        onChange={e => setBulkRole(e.target.value as 'EMPLOYEE' | 'MEMBER' | 'ADMIN')}
                        aria-label="Invited employee role"
                        className="h-9 rounded-lg border border-line-strong bg-surface px-3 text-sm"
                      >
                        <option value="EMPLOYEE">Employee Portal (Ask AI &amp; Read Docs)</option>
                        <option value="MEMBER">Contributor (Upload + Ask)</option>
                        <option value="ADMIN">Company Admin</option>
                      </select>
                      <Button type="submit" disabled={inviting || !bulkEmails.trim()}>
                        {inviting && <Spinner />} Send Invitations
                      </Button>
                    </div>
                  </form>
                </Panel>

                <Panel className="overflow-hidden">
                  <div className="border-b border-line px-5 py-4">
                    <h2 className="text-base font-semibold">Employee Directory ({members.length})</h2>
                  </div>
                  <ul className="divide-y divide-line">
                    {members.map(m => (
                      <li key={m.user_id} className="flex flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm font-medium">{m.email}</p>
                          <p className="text-xs text-muted">Joined {formatDate(m.joined_at)}</p>
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
                    ))}
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
                      {spaces.map(sp => (
                        <li key={sp.id} className="flex items-center justify-between gap-3 px-5 py-4">
                          <div>
                            <div className="flex items-center gap-2">
                              <Icon name="folder" className="size-4 text-muted" />
                              <span className="text-sm font-semibold">{sp.name}</span>
                              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${sp.visibility === 'RESTRICTED' ? 'bg-warn-soft text-warn' : 'bg-surface-2 text-muted'}`}>
                                {sp.visibility === 'RESTRICTED' ? 'Restricted' : 'All Company'}
                              </span>
                            </div>
                            {sp.description && <p className="mt-1 text-xs text-muted">{sp.description}</p>}
                            <p className="mt-1 text-xs text-faint">{sp.document_count} document(s)</p>
                          </div>
                          <Button variant="ghost" size="sm" disabled={busyId === sp.id} onClick={() => void deleteSpace(sp)}>
                            <Icon name="trash" className="size-4 text-danger" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </Panel>
              </div>
            )}

            {tab === 'policy' && (
              <Panel className="p-5 sm:p-6">
                <h2 className="text-base font-semibold">Corporate Domain &amp; Employee Onboarding Policy</h2>
                <p className="mt-1 text-sm text-muted">
                  Control how employees signing in with your corporate email domain join this company workspace.
                </p>
                <form onSubmit={savePolicy} className="mt-5 space-y-5">
                  <div>
                    <label htmlFor="pol-name" className="mb-1.5 block text-sm font-medium">Company name</label>
                    <input id="pol-name" type="text" required value={companyName} onChange={e => setCompanyName(e.target.value)} className={inputClass} />
                  </div>

                  <div>
                    <label htmlFor="pol-domains" className="mb-1.5 block text-sm font-medium">Claimed corporate email domain(s)</label>
                    <input
                      id="pol-domains"
                      type="text"
                      placeholder="infosys.com, infosys.co.in"
                      value={domainsInput}
                      onChange={e => setDomainsInput(e.target.value)}
                      className={inputClass}
                    />
                    <p className="mt-1 text-xs text-faint">Public webmail domains like gmail.com or yahoo.com are blocked automatically.</p>
                  </div>

                  <div>
                    <p className="mb-2 text-sm font-medium">Employee sign-up join policy</p>
                    <div className="grid gap-2.5 sm:grid-cols-3">
                      {(
                        [
                          { id: 'INVITE_ONLY', title: 'Invite Only', desc: 'Only explicitly invited emails can join.' },
                          { id: 'DOMAIN_APPROVAL', title: 'Admin Approval', desc: 'Employees with @domain wait in approval queue.' },
                          { id: 'DOMAIN_AUTO_JOIN', title: 'Auto-Join Domain', desc: 'Verified @domain employees join instantly.' },
                        ] as const
                      ).map(p => (
                        <label
                          key={p.id}
                          className={`cursor-pointer rounded-xl border p-3.5 text-sm ${
                            joinPolicy === p.id ? 'border-fg bg-surface-2 ring-1 ring-fg' : 'border-line bg-bg hover:bg-surface-2'
                          }`}
                        >
                          <input
                            type="radio"
                            name="join-policy"
                            value={p.id}
                            checked={joinPolicy === p.id}
                            onChange={() => setJoinPolicy(p.id)}
                            className="sr-only"
                          />
                          <span className="block font-semibold">{p.title}</span>
                          <span className="mt-1 block text-xs text-muted">{p.desc}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label htmlFor="pol-role" className="mb-1.5 block text-sm font-medium">Default role for domain joiners</label>
                    <select
                      id="pol-role"
                      value={defaultRole}
                      onChange={e => setDefaultRole(e.target.value as 'EMPLOYEE' | 'MEMBER' | 'VIEWER')}
                      className={inputClass}
                    >
                      <option value="EMPLOYEE">Employee (Ask AI &amp; Read permitted docs — recommended)</option>
                      <option value="MEMBER">Contributor (Ask AI + Upload docs)</option>
                      <option value="VIEWER">Viewer (Read-only)</option>
                    </select>
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
                    {savingPolicy && <Spinner />} Save Policy
                  </Button>
                </form>
              </Panel>
            )}

            {tab === 'gaps' && (
              <Panel className="overflow-hidden">
                <div className="border-b border-line px-5 py-4">
                  <h2 className="text-base font-semibold">Knowledge Gaps &amp; Employee Feedback ({gaps.length})</h2>
                  <p className="mt-0.5 text-sm text-muted">
                    Use these insights to upload missing policies, SOPs, or technical docs.
                  </p>
                </div>
                {gaps.length === 0 ? (
                  <p className="px-5 py-12 text-center text-sm text-muted">No gaps or negative ratings reported yet.</p>
                ) : (
                  <ul className="divide-y divide-line">
                    {gaps.map(g => (
                      <li key={g.id} className="space-y-1.5 px-5 py-4">
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm font-semibold">{g.question}</p>
                          <span className="shrink-0 rounded-full bg-warn-soft px-2.5 py-0.5 text-[11px] font-medium text-warn">
                            {g.reason === 'NEGATIVE_FEEDBACK' ? '👎 Needs better info' : 'Not found in docs'}
                          </span>
                        </div>
                        <p className="text-xs text-muted">{g.answer_excerpt}</p>
                        {g.comment && <p className="text-xs text-fg">Employee note: &ldquo;{g.comment}&rdquo;</p>}
                        <p className="text-[11px] text-faint">
                          {g.user_email} &bull; {formatDate(g.created_at)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            )}
          </>
        )}
      </main>
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
    } else if (session && session.role !== 'OWNER' && session.role !== 'ADMIN') {
      router.replace('/employee/');
    }
  }, [raw, session, router]);

  if (!session || (session.role !== 'OWNER' && session.role !== 'ADMIN')) {
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
