'use client';

import React, { useEffect, useState } from 'react';
import {
  AdminDocumentSummaryDTO,
  AdminJobSummaryDTO,
  AdminOverviewDTO,
  AdminSystemDiagnosticsDTO,
  AdminUserSummaryDTO,
  AdminWorkspaceSummaryDTO,
  ApiClient,
  AuditEventDTO,
} from '../lib/api';

interface AdminConsoleProps {
  onBackToApp: () => void;
  onSignOut?: () => void;
  adminEmail?: string;
}

async function fetchAllAdminData() {
  const [ov, ws, usr, docs, jobs, logs, diag] = await Promise.allSettled([
    ApiClient.getAdminOverview(),
    ApiClient.getAdminWorkspaces(),
    ApiClient.getAdminUsers(),
    ApiClient.getAdminDocuments(),
    ApiClient.getAdminJobs(),
    ApiClient.getAdminAuditLogs(100),
    ApiClient.getAdminSystemDiagnostics(),
  ]);
  return { ov, ws, usr, docs, jobs, logs, diag };
}

export const AdminConsole: React.FC<AdminConsoleProps> = ({ onBackToApp, onSignOut, adminEmail }) => {
  const [activeAdminTab, setActiveAdminTab] = useState<'workspaces' | 'users' | 'jobs' | 'overview' | 'documents' | 'audit' | 'system'>('workspaces');

  const [refreshing, setRefreshing] = useState(true);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [overview, setOverview] = useState<AdminOverviewDTO | null>(null);
  const [workspaces, setWorkspaces] = useState<AdminWorkspaceSummaryDTO[]>([]);
  const [users, setUsers] = useState<AdminUserSummaryDTO[]>([]);
  const [documents, setDocuments] = useState<AdminDocumentSummaryDTO[]>([]);
  const [jobs, setJobs] = useState<AdminJobSummaryDTO[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditEventDTO[]>([]);
  const [diagnostics, setDiagnostics] = useState<AdminSystemDiagnosticsDTO | null>(null);

  // Filter, provision & confirmation states
  const [workspaceSearch, setWorkspaceSearch] = useState('');
  const [workspaceTierFilter, setWorkspaceTierFilter] = useState('ALL');
  const [userSearch, setUserSearch] = useState('');
  const [userStatusFilter, setUserStatusFilter] = useState('ALL');
  const [jobStatusFilter, setJobStatusFilter] = useState('ALL');
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [confirmDeleteWsId, setConfirmDeleteWsId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [showProvisionModal, setShowProvisionModal] = useState(false);
  const [provName, setProvName] = useState('');
  const [provEmail, setProvEmail] = useState('');
  const [provPassword, setProvPassword] = useState('');
  const [provTier, setProvTier] = useState('PRO');
  const [provisioning, setProvisioning] = useState(false);

  const applyResults = (res: Awaited<ReturnType<typeof fetchAllAdminData>>) => {
    const { ov, ws, usr, docs, jobs: jobsRes, logs, diag } = res;
    const failures: string[] = [];
    if (ov.status === 'fulfilled') setOverview(ov.value);
    else failures.push(ov.reason?.message || 'Failed to load platform overview');

    if (ws.status === 'fulfilled') setWorkspaces(ws.value);
    else failures.push(ws.reason?.message || 'Failed to load workspaces');

    if (usr.status === 'fulfilled') setUsers(usr.value);
    else failures.push(usr.reason?.message || 'Failed to load users');

    if (docs.status === 'fulfilled') setDocuments(docs.value);
    if (jobsRes.status === 'fulfilled') setJobs(jobsRes.value);
    if (logs.status === 'fulfilled') setAuditLogs(logs.value);
    if (diag.status === 'fulfilled') setDiagnostics(diag.value);

    if (failures.length > 0 && ov.status === 'rejected' && ws.status === 'rejected') {
      setErrorBanner(failures[0]);
    } else {
      setErrorBanner(null);
    }
  };

  const loadData = async () => {
    setRefreshing(true);
    try {
      const res = await fetchAllAdminData();
      applyResults(res);
    } catch (err: unknown) {
      setErrorBanner(err instanceof Error ? err.message : 'Unable to reach DocMind Admin API.');
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    fetchAllAdminData()
      .then(res => {
        if (!cancelled) applyResults(res);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setErrorBanner(err instanceof Error ? err.message : 'Unable to reach DocMind Admin API.');
        }
      })
      .finally(() => {
        if (!cancelled) setRefreshing(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const showNotice = (msg: string) => {
    setActionNotice(msg);
    setTimeout(() => setActionNotice(null), 5000);
  };

  const handleSetTier = async (workspaceId: string, newTier: string) => {
    setBusyId(workspaceId);
    setErrorBanner(null);
    try {
      const updated = await ApiClient.updateAdminWorkspaceTier(workspaceId, newTier);
      setWorkspaces(prev => prev.map(w => (w.id === workspaceId ? updated : w)));
      showNotice(`Updated "${updated.name}" tier to ${updated.tier}.`);
      // Refresh overview stats in background
      ApiClient.getAdminOverview().then(setOverview).catch(() => {});
    } catch (err: unknown) {
      setErrorBanner(err instanceof Error ? err.message : 'Failed to update workspace tier.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteWorkspace = async (workspaceId: string, name: string) => {
    setBusyId(workspaceId);
    setErrorBanner(null);
    try {
      await ApiClient.deleteAdminWorkspace(workspaceId);
      setWorkspaces(prev => prev.filter(w => w.id !== workspaceId));
      setConfirmDeleteWsId(null);
      showNotice(`Deleted workspace "${name}" and its associated data.`);
      void loadData();
    } catch (err: unknown) {
      setErrorBanner(err instanceof Error ? err.message : 'Failed to delete workspace.');
      setConfirmDeleteWsId(null);
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleUserStatus = async (user: AdminUserSummaryDTO) => {
    const targetStatus = user.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED';
    setBusyId(user.id);
    setErrorBanner(null);
    try {
      const updated = await ApiClient.updateAdminUserStatus(user.id, targetStatus);
      setUsers(prev => prev.map(u => (u.id === user.id ? updated : u)));
      showNotice(`Updated ${updated.email} status to ${updated.status}.`);
    } catch (err: unknown) {
      setErrorBanner(err instanceof Error ? err.message : 'Failed to update user status.');
    } finally {
      setBusyId(null);
    }
  };

  const handleProvisionWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    setProvisioning(true);
    setErrorBanner(null);
    try {
      const created = await ApiClient.createAdminWorkspace({
        name: provName.trim(),
        owner_email: provEmail.trim(),
        owner_password: provPassword || undefined,
        tier: provTier,
      });
      setWorkspaces(prev => [created, ...prev]);
      setShowProvisionModal(false);
      setProvName('');
      setProvEmail('');
      setProvPassword('');
      showNotice(`Provisioned "${created.name}" (${created.tier}) for ${created.owner_email}.`);
      void loadData();
    } catch (err: unknown) {
      setErrorBanner(err instanceof Error ? err.message : 'Failed to provision workspace.');
    } finally {
      setProvisioning(false);
    }
  };

  const handleRetryJob = async (jobId: string) => {
    setBusyId(jobId);
    setErrorBanner(null);
    try {
      const updated = await ApiClient.retryAdminJob(jobId);
      setJobs(prev => prev.map(j => (j.id === jobId ? updated : j)));
      showNotice(`Requeued background job ${jobId.slice(0, 8)}...`);
    } catch (err: unknown) {
      setErrorBanner(err instanceof Error ? err.message : 'Failed to retry job.');
    } finally {
      setBusyId(null);
    }
  };

  const handleExportPlatformCsv = async () => {
    try {
      const blob = await ApiClient.exportAdminAuditLogsCsv();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'docmind_platform_audit.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      setErrorBanner(err instanceof Error ? err.message : 'Failed to export audit CSV.');
    }
  };

  const handleRetryDoc = async (documentId: string, filename: string) => {
    setBusyId(documentId);
    setErrorBanner(null);
    try {
      await ApiClient.retryAdminDocument(documentId);
      setDocuments(prev =>
        prev.map(d => (d.id === documentId ? { ...d, status: 'QUEUED', error_code: undefined, error_message: undefined } : d))
      );
      showNotice(`Requeued document "${filename}" for OCR and ingestion.`);
    } catch (err: unknown) {
      setErrorBanner(err instanceof Error ? err.message : `Failed to retry document "${filename}".`);
    } finally {
      setBusyId(null);
    }
  };

  const filteredWorkspaces = workspaces.filter(w => {
    const q = workspaceSearch.toLowerCase();
    const matchesSearch =
      w.name.toLowerCase().includes(q) ||
      w.slug.toLowerCase().includes(q) ||
      (w.owner_email && w.owner_email.toLowerCase().includes(q));
    const matchesTier = workspaceTierFilter === 'ALL' || w.tier === workspaceTierFilter;
    return matchesSearch && matchesTier;
  });

  const filteredUsers = users.filter(u => {
    const q = userSearch.toLowerCase();
    const matchesSearch = u.email.toLowerCase().includes(q) || u.id.toLowerCase().includes(q);
    const matchesStatus = userStatusFilter === 'ALL' || u.status === userStatusFilter;
    return matchesSearch && matchesStatus;
  });

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Header Bar */}
      <header className="h-16 border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-xl px-6 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-amber-500 to-rose-500 flex items-center justify-center text-sm font-bold text-slate-950 shadow-md shadow-amber-500/20">
            ⚡
          </div>
          <div>
            <h1 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
              DocMind Super-Admin Control Center
              <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30">
                Global Platform Admin
              </span>
            </h1>
            <p className="text-[11px] text-slate-400">
              {adminEmail ? `Signed in as ${adminEmail} • ` : ''}Live Database Governance — All Companies, Users & Infrastructure
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={loadData}
            disabled={refreshing}
            className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-white px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 transition-colors disabled:opacity-50"
          >
            <span className={refreshing ? 'animate-spin inline-block' : ''}>↻</span>
            <span>{refreshing ? 'Syncing DB...' : 'Refresh Database'}</span>
          </button>
          <button
            onClick={onBackToApp}
            className="hidden sm:flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-white px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 transition-colors"
            title="Switch to DocMind HQ Document Workspace"
          >
            <span>HQ Workspace</span>
            <span>&rarr;</span>
          </button>
          {onSignOut && (
            <button
              onClick={onSignOut}
              className="text-xs font-semibold text-rose-300 hover:text-white px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/30 border border-rose-500/30 transition-colors"
            >
              Sign out
            </button>
          )}
        </div>
      </header>

      {/* Error / Action Notification Banners */}
      {errorBanner && (
        <div className="bg-rose-500/15 border-b border-rose-500/40 px-6 py-2.5 text-xs text-rose-200 flex items-center justify-between">
          <span className="flex items-center gap-2 font-medium">
            <span>⚠️</span> {errorBanner}
          </span>
          <button onClick={() => setErrorBanner(null)} className="text-rose-300 hover:text-white">✕</button>
        </div>
      )}

      {actionNotice && (
        <div className="bg-gradient-to-r from-cyan-500/20 via-teal-500/20 to-cyan-500/20 border-b border-cyan-500/40 px-6 py-2.5 text-xs text-cyan-200 flex items-center justify-between">
          <span className="flex items-center gap-2">
            <span>✓</span> {actionNotice}
          </span>
          <button onClick={() => setActionNotice(null)} className="text-cyan-400 hover:text-white">✕</button>
        </div>
      )}

      {/* Navigation Sub-Tabs */}
      <div className="px-6 border-b border-slate-800/80 bg-slate-900/30">
        <div className="flex gap-2 py-3 overflow-x-auto">
          {(
            [
              { id: 'workspaces', label: `Companies & Workspaces (${workspaces.length})`, icon: '🏢' },
              { id: 'users', label: `Registered Users (${users.length})`, icon: '👥' },
              { id: 'jobs', label: `Worker Queue (${jobs.length})`, icon: '⚙️' },
              { id: 'overview', label: 'Platform Telemetry', icon: '📊' },
              { id: 'documents', label: `Document Fleet (${documents.length})`, icon: '📄' },
              { id: 'audit', label: 'Global Audit Trail', icon: '🛡️' },
              { id: 'system', label: 'System Config', icon: '🔧' },
            ] as const
          ).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveAdminTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
                activeAdminTab === tab.id
                  ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60 border border-transparent'
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 p-6 max-w-7xl w-full mx-auto space-y-6">
        {/* Global Platform KPI Strip */}
        {overview && (activeAdminTab === 'workspaces' || activeAdminTab === 'users') && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Total Companies / Workspaces</div>
              <div className="text-2xl font-extrabold text-white mt-1">{overview.total_workspaces}</div>
              <div className="text-[11px] text-slate-400 mt-1">
                {overview.active_tiers.ENTERPRISE || 0} Ent • {overview.active_tiers.PRO || 0} Pro • {overview.active_tiers.STARTER || 0} Starter
              </div>
            </div>
            <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Registered Accounts</div>
              <div className="text-2xl font-extrabold text-cyan-400 mt-1">{overview.total_users}</div>
              <div className="text-[11px] text-slate-400 mt-1">All Platform Users</div>
            </div>
            <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Total Documents</div>
              <div className="text-2xl font-extrabold text-white mt-1">{overview.total_documents}</div>
              <div className="text-[11px] text-slate-400 mt-1">{overview.total_chunks} vector chunks</div>
            </div>
            <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Storage &amp; Monthly AI Cost</div>
              <div className="text-2xl font-extrabold text-white mt-1">
                {formatBytes(overview.total_storage_bytes)}
                <span className="text-sm font-semibold text-emerald-400 ml-2">
                  (${(overview.monthly_ai_cost_usd ?? 0).toFixed(3)} mo)
                </span>
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                {overview.total_questions} Q&amp;A • {overview.pending_jobs ?? 0} queued • {overview.failed_jobs ?? 0} failed jobs
              </div>
            </div>
          </div>
        )}

        {/* TAB 1: COMPANIES & WORKSPACES */}
        {activeAdminTab === 'workspaces' && (
          <div className="space-y-4">
            {/* Search & Filter Header */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 rounded-2xl bg-slate-900/60 border border-slate-800">
              <div className="w-full sm:w-96 relative">
                <input
                  type="text"
                  placeholder="Search company name, slug, or owner email..."
                  value={workspaceSearch}
                  onChange={e => setWorkspaceSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500"
                />
                <span className="absolute left-3 top-2.5 text-xs text-slate-500">🔍</span>
              </div>

              <div className="flex flex-wrap items-center gap-2 self-end sm:self-auto">
                <span className="text-xs text-slate-400">Tier:</span>
                {['ALL', 'STARTER', 'PRO', 'ENTERPRISE'].map(tier => (
                  <button
                    key={tier}
                    onClick={() => setWorkspaceTierFilter(tier)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      workspaceTierFilter === tier
                        ? 'bg-cyan-500 text-slate-950'
                        : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {tier}
                  </button>
                ))}
                <button
                  onClick={() => setShowProvisionModal(true)}
                  className="ml-2 px-3.5 py-1.5 rounded-lg text-xs font-bold bg-gradient-to-r from-amber-500 to-rose-500 text-slate-950 hover:from-amber-400 hover:to-rose-400 transition-all"
                >
                  + Provision Company
                </button>
              </div>
            </div>

            {showProvisionModal && (
              <form onSubmit={handleProvisionWorkspace} className="p-5 rounded-2xl bg-slate-900 border border-amber-500/40 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white">Provision New Customer Company</h3>
                  <button type="button" onClick={() => setShowProvisionModal(false)} className="text-slate-400 hover:text-white text-xs">✕</button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <input
                    type="text"
                    required
                    minLength={2}
                    placeholder="Company name (e.g. Wipro)"
                    value={provName}
                    onChange={e => setProvName(e.target.value)}
                    className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
                  />
                  <input
                    type="email"
                    required
                    placeholder="Owner email"
                    value={provEmail}
                    onChange={e => setProvEmail(e.target.value)}
                    className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
                  />
                  <input
                    type="password"
                    minLength={8}
                    placeholder="Initial password (if new user)"
                    value={provPassword}
                    onChange={e => setProvPassword(e.target.value)}
                    className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
                  />
                  <select
                    value={provTier}
                    onChange={e => setProvTier(e.target.value)}
                    className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
                  >
                    <option value="STARTER">STARTER</option>
                    <option value="PRO">PRO</option>
                    <option value="ENTERPRISE">ENTERPRISE</option>
                  </select>
                </div>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setShowProvisionModal(false)} className="px-3 py-1.5 rounded-lg bg-slate-800 text-xs text-slate-300">Cancel</button>
                  <button type="submit" disabled={provisioning} className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs">
                    {provisioning ? 'Provisioning...' : 'Create Company Workspace'}
                  </button>
                </div>
              </form>
            )}

            {/* Workspaces Table */}
            <div className="rounded-2xl bg-slate-900/60 border border-slate-800 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950/80 text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-4">Company / Workspace</th>
                      <th className="py-3 px-4">Subscription Tier</th>
                      <th className="py-3 px-4">Owner Email</th>
                      <th className="py-3 px-4">Members</th>
                      <th className="py-3 px-4">Documents</th>
                      <th className="py-3 px-4">Storage Used</th>
                      <th className="py-3 px-4">Monthly AI Cost</th>
                      <th className="py-3 px-4">Created</th>
                      <th className="py-3 px-4 text-right">Manage Workspace</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredWorkspaces.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-10 text-center text-slate-400">
                          {refreshing ? 'Loading registered companies from PostgreSQL...' : 'No workspaces match your search.'}
                        </td>
                      </tr>
                    ) : (
                      filteredWorkspaces.map(ws => {
                        const isHQ = ws.name === 'DocMind Platform HQ' || ws.slug.startsWith('docmind-hq');
                        return (
                          <tr key={ws.id} className="hover:bg-slate-800/30 transition-colors">
                            <td className="py-3.5 px-4">
                              <div className="font-bold text-white text-sm flex items-center gap-2">
                                {ws.name}
                                {isHQ && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30">
                                    HQ
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-500 font-mono">/{ws.slug}</div>
                            </td>
                            <td className="py-3.5 px-4">
                              <select
                                value={ws.tier}
                                disabled={busyId === ws.id}
                                onChange={e => handleSetTier(ws.id, e.target.value)}
                                className={`px-2 py-1 rounded-md font-semibold text-[11px] uppercase border bg-slate-950 focus:outline-none focus:border-cyan-500 ${
                                  ws.tier === 'ENTERPRISE'
                                    ? 'text-amber-400 border-amber-500/40'
                                    : ws.tier === 'PRO'
                                    ? 'text-cyan-400 border-cyan-500/40'
                                    : 'text-slate-300 border-slate-700'
                                }`}
                              >
                                <option value="STARTER">STARTER</option>
                                <option value="PRO">PRO</option>
                                <option value="ENTERPRISE">ENTERPRISE</option>
                              </select>
                            </td>
                            <td className="py-3.5 px-4 text-slate-300 font-mono text-[11px]">{ws.owner_email || '—'}</td>
                            <td className="py-3.5 px-4 font-semibold text-white">{ws.member_count}</td>
                            <td className="py-3.5 px-4 font-semibold text-white">{ws.document_count}</td>
                            <td className="py-3.5 px-4 text-cyan-300 font-mono">{formatBytes(ws.storage_bytes)}</td>
                            <td className="py-3.5 px-4 text-emerald-400 font-mono text-[11px]">
                              ${(ws.monthly_ai_cost_usd ?? 0).toFixed(4)}
                            </td>
                            <td className="py-3.5 px-4 text-slate-400 whitespace-nowrap">
                              {new Date(ws.created_at).toLocaleDateString()}
                            </td>
                            <td className="py-3.5 px-4 text-right space-x-2">
                              {!isHQ && (
                                confirmDeleteWsId === ws.id ? (
                                  <span className="inline-flex items-center gap-1.5">
                                    <button
                                      disabled={busyId === ws.id}
                                      onClick={() => handleDeleteWorkspace(ws.id, ws.name)}
                                      className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-semibold"
                                    >
                                      Confirm Delete
                                    </button>
                                    <button
                                      onClick={() => setConfirmDeleteWsId(null)}
                                      className="px-2 py-1 rounded-lg bg-slate-800 text-slate-300 text-[11px]"
                                    >
                                      Cancel
                                    </button>
                                  </span>
                                ) : (
                                  <button
                                    disabled={busyId === ws.id}
                                    onClick={() => setConfirmDeleteWsId(ws.id)}
                                    className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 hover:text-rose-300 text-slate-400 text-[11px] font-semibold transition-all border border-slate-700 hover:border-rose-500/40"
                                  >
                                    Delete
                                  </button>
                                )
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: REGISTERED USERS */}
        {activeAdminTab === 'users' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 rounded-2xl bg-slate-900/60 border border-slate-800">
              <div className="w-full sm:w-96 relative">
                <input
                  type="text"
                  placeholder="Search user email or ID..."
                  value={userSearch}
                  onChange={e => setUserSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500"
                />
                <span className="absolute left-3 top-2.5 text-xs text-slate-500">🔍</span>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-auto">
                <span className="text-xs text-slate-400">Status:</span>
                {['ALL', 'ACTIVE', 'UNVERIFIED', 'SUSPENDED'].map(st => (
                  <button
                    key={st}
                    onClick={() => setUserStatusFilter(st)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      userStatusFilter === st
                        ? 'bg-cyan-500 text-slate-950'
                        : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-2xl bg-slate-900/60 border border-slate-800 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950/80 text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-4">User Email</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Verified</th>
                      <th className="py-3 px-4">Workspaces</th>
                      <th className="py-3 px-4">Joined</th>
                      <th className="py-3 px-4 text-right">Account Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredUsers.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-10 text-center text-slate-400">
                          {refreshing ? 'Loading registered users...' : 'No users found.'}
                        </td>
                      </tr>
                    ) : (
                      filteredUsers.map(u => (
                        <tr key={u.id} className="hover:bg-slate-800/30 transition-colors">
                          <td className="py-3.5 px-4 font-semibold text-white">
                            <div className="flex items-center gap-2">
                              <span>{u.email}</span>
                              {u.is_superadmin && (
                                <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
                                  Platform Admin
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3.5 px-4">
                            <span
                              className={`px-2 py-0.5 rounded-full font-semibold text-[10px] uppercase border ${
                                u.status === 'ACTIVE'
                                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                  : u.status === 'SUSPENDED'
                                  ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                                  : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                              }`}
                            >
                              {u.status}
                            </span>
                          </td>
                          <td className="py-3.5 px-4">{u.verified ? 'Yes ✓' : 'Pending'}</td>
                          <td className="py-3.5 px-4 font-semibold text-white">{u.workspace_count}</td>
                          <td className="py-3.5 px-4 text-slate-400 whitespace-nowrap">
                            {new Date(u.created_at).toLocaleDateString()}
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            {u.is_superadmin ? (
                              <span className="text-[11px] text-slate-500">Protected</span>
                            ) : (
                              <button
                                disabled={busyId === u.id}
                                onClick={() => handleToggleUserStatus(u)}
                                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all border ${
                                  u.status === 'SUSPENDED'
                                    ? 'bg-emerald-500/15 hover:bg-emerald-500 text-emerald-300 hover:text-slate-950 border-emerald-500/40'
                                    : 'bg-slate-800 hover:bg-rose-500/20 text-slate-300 hover:text-rose-300 border-slate-700 hover:border-rose-500/40'
                                }`}
                              >
                                {u.status === 'SUSPENDED' ? 'Activate Account' : 'Suspend Account'}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: OVERVIEW TELEMETRY */}
        {activeAdminTab === 'overview' && (
          <div className="space-y-6">
            {overview ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800">
                    <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
                      <span>Registered Companies</span>
                      <span>🏢</span>
                    </div>
                    <div className="text-3xl font-extrabold text-white">{overview.total_workspaces}</div>
                    <div className="text-[11px] text-slate-400 mt-2">
                      <span className="text-cyan-400 font-semibold">{overview.active_tiers.ENTERPRISE || 0}</span> Enterprise •{' '}
                      <span className="text-teal-400 font-semibold">{overview.active_tiers.PRO || 0}</span> Pro •{' '}
                      <span className="text-slate-400">{overview.active_tiers.STARTER || 0}</span> Starter
                    </div>
                  </div>

                  <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800">
                    <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
                      <span>Total Users</span>
                      <span>👥</span>
                    </div>
                    <div className="text-3xl font-extrabold text-cyan-400">{overview.total_users}</div>
                    <div className="text-[11px] text-slate-400 mt-2">
                      Storage: <span className="text-white font-semibold">{formatBytes(overview.total_storage_bytes)}</span>
                    </div>
                  </div>

                  <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800">
                    <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
                      <span>Documents & Vector Chunks</span>
                      <span>🧠</span>
                    </div>
                    <div className="text-3xl font-extrabold text-white">{overview.total_documents}</div>
                    <div className="text-[11px] text-slate-400 mt-2">
                      <span className="text-cyan-400 font-semibold">{overview.total_chunks} chunks</span> indexed
                    </div>
                  </div>

                  <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800">
                    <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
                      <span>AI Questions Answered</span>
                      <span>💬</span>
                    </div>
                    <div className="text-3xl font-extrabold text-white">{overview.total_questions}</div>
                    <div className="text-[11px] text-slate-400 mt-2">Grounded RAG Queries</div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <span>🛰️</span> Real-Time Service Status
                    </h3>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800/80 text-xs">
                        <span className="font-medium text-slate-200">Object Storage</span>
                        <span className="font-mono text-cyan-300 text-[11px]">{overview.cloudflare_r2_status}</span>
                      </div>
                      <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800/80 text-xs">
                        <span className="font-medium text-slate-200">Google Gemini LLM</span>
                        <span className="font-mono text-cyan-300 text-[11px]">{overview.gemini_api_status}</span>
                      </div>
                      <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800/80 text-xs">
                        <span className="font-medium text-slate-200">SMTP Relay</span>
                        <span className="font-mono text-cyan-300 text-[11px]">{overview.smtp_status}</span>
                      </div>
                      <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800/80 text-xs">
                        <span className="font-medium text-slate-200">Worker Fleet</span>
                        <span className="font-mono text-cyan-300 text-[11px]">{overview.worker_health}</span>
                      </div>
                    </div>
                  </div>

                  <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <span>📄</span> Document Processing Breakdown
                    </h3>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="p-4 rounded-xl bg-slate-950 border border-emerald-500/20 text-center">
                        <div className="text-2xl font-extrabold text-emerald-400">
                          {overview.document_status_breakdown.READY || 0}
                        </div>
                        <div className="text-xs text-slate-400 mt-1">Ready</div>
                      </div>
                      <div className="p-4 rounded-xl bg-slate-950 border border-cyan-500/20 text-center">
                        <div className="text-2xl font-extrabold text-cyan-400">
                          {(overview.document_status_breakdown.PROCESSING || 0) + (overview.document_status_breakdown.QUEUED || 0)}
                        </div>
                        <div className="text-xs text-slate-400 mt-1">In Flight</div>
                      </div>
                      <div className="p-4 rounded-xl bg-slate-950 border border-rose-500/20 text-center">
                        <div className="text-2xl font-extrabold text-rose-400">
                          {overview.document_status_breakdown.FAILED || 0}
                        </div>
                        <div className="text-xs text-slate-400 mt-1">Failed</div>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="p-10 text-center text-slate-400">Loading platform telemetry...</div>
            )}
          </div>
        )}

        {/* TAB 4: DOCUMENT & OCR FLEET */}
        {activeAdminTab === 'documents' && (
          <div className="space-y-4">
            <div className="rounded-2xl bg-slate-900/60 border border-slate-800 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950/80 text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-4">Document Title</th>
                      <th className="py-3 px-4">Workspace</th>
                      <th className="py-3 px-4">Size</th>
                      <th className="py-3 px-4">Pages</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {documents.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-10 text-center text-slate-400">No documents uploaded yet.</td>
                      </tr>
                    ) : (
                      documents.map(doc => (
                        <tr key={doc.id} className="hover:bg-slate-800/30 transition-colors">
                          <td className="py-3.5 px-4 font-semibold text-white">
                            <div>{doc.filename}</div>
                            {doc.error_message && (
                              <div className="text-[11px] text-rose-400 mt-1">{doc.error_message}</div>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-slate-300">{doc.workspace_name}</td>
                          <td className="py-3.5 px-4 font-mono text-[11px]">{formatBytes(doc.size_bytes)}</td>
                          <td className="py-3.5 px-4">{doc.page_count > 0 ? doc.page_count : '—'}</td>
                          <td className="py-3.5 px-4">
                            <span
                              className={`px-2 py-0.5 rounded-full font-semibold text-[10px] uppercase border ${
                                doc.status === 'READY'
                                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                  : doc.status === 'PROCESSING' || doc.status === 'QUEUED'
                                  ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30'
                                  : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                              }`}
                            >
                              {doc.status}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            {doc.status === 'FAILED' ? (
                              <button
                                disabled={busyId === doc.id}
                                onClick={() => handleRetryDoc(doc.id, doc.filename)}
                                className="px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500 hover:text-white text-rose-300 text-[11px] font-semibold border border-rose-500/40"
                              >
                                Retry Ingest ↻
                              </button>
                            ) : (
                              <span className="text-[11px] text-slate-500">OK</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: WORKER JOB QUEUE */}
        {activeAdminTab === 'jobs' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl bg-slate-900/60 border border-slate-800">
              <div>
                <h3 className="text-sm font-bold text-white">Background Worker Queue</h3>
                <p className="text-xs text-slate-400">Live ingestion, deletion &amp; account cleanup jobs processed by docmind-worker.</p>
              </div>
              <div className="flex items-center gap-1.5">
                {['ALL', 'QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED'].map(st => (
                  <button
                    key={st}
                    onClick={() => setJobStatusFilter(st)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      jobStatusFilter === st ? 'bg-cyan-500 text-slate-950' : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-2xl bg-slate-900/60 border border-slate-800 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950/80 text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-4">Job Type</th>
                      <th className="py-3 px-4">Workspace</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Attempts</th>
                      <th className="py-3 px-4">Last Error</th>
                      <th className="py-3 px-4">Updated</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {jobs.filter(j => jobStatusFilter === 'ALL' || j.status === jobStatusFilter).length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-10 text-center text-slate-400">No background jobs matching filter.</td>
                      </tr>
                    ) : (
                      jobs
                        .filter(j => jobStatusFilter === 'ALL' || j.status === jobStatusFilter)
                        .map(job => (
                          <tr key={job.id} className="hover:bg-slate-800/30 transition-colors">
                            <td className="py-3.5 px-4 font-mono text-[11px] font-semibold text-white">{job.job_type}</td>
                            <td className="py-3.5 px-4 text-slate-300">{job.workspace_name}</td>
                            <td className="py-3.5 px-4">
                              <span
                                className={`px-2 py-0.5 rounded-full font-semibold text-[10px] uppercase border ${
                                  job.status === 'SUCCEEDED'
                                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                    : job.status === 'FAILED'
                                    ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                                    : 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30'
                                }`}
                              >
                                {job.status}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 font-mono text-[11px]">{job.attempts} / {job.max_attempts}</td>
                            <td className="py-3.5 px-4 text-rose-300 max-w-xs truncate">{job.last_error || '—'}</td>
                            <td className="py-3.5 px-4 text-slate-400 whitespace-nowrap">{new Date(job.updated_at).toLocaleString()}</td>
                            <td className="py-3.5 px-4 text-right">
                              {(job.status === 'FAILED' || job.status === 'RETRY_WAIT') && (
                                <button
                                  disabled={busyId === job.id}
                                  onClick={() => handleRetryJob(job.id)}
                                  className="px-2.5 py-1 rounded-lg bg-cyan-500/20 hover:bg-cyan-500 hover:text-slate-950 text-cyan-300 text-[11px] font-semibold border border-cyan-500/40"
                                >
                                  Retry Job ↻
                                </button>
                              )}
                            </td>
                          </tr>
                        ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 6: GLOBAL AUDIT TRAIL */}
        {activeAdminTab === 'audit' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-900/60 border border-slate-800">
              <div>
                <h3 className="text-sm font-bold text-white">Platform Audit Log</h3>
                <p className="text-xs text-slate-400">Immutable security &amp; administrative actions across all customer companies.</p>
              </div>
              <button
                onClick={handleExportPlatformCsv}
                className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white border border-slate-700"
              >
                Export CSV ↓
              </button>
            </div>
            <div className="rounded-2xl bg-slate-900/60 border border-slate-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950/80 text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Timestamp</th>
                    <th className="py-3 px-4">Actor</th>
                    <th className="py-3 px-4">Action</th>
                    <th className="py-3 px-4">Target Type</th>
                    <th className="py-3 px-4">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {auditLogs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-10 text-center text-slate-400">No audit events recorded yet.</td>
                    </tr>
                  ) : (
                    auditLogs.map(log => (
                      <tr key={log.id} className="hover:bg-slate-800/30 transition-colors font-mono text-[11px]">
                        <td className="py-3 px-4 text-slate-400 whitespace-nowrap">
                          {new Date(log.created_at).toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-cyan-300 font-semibold">{log.actor_email || 'system'}</td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded bg-slate-950 text-white border border-slate-800">
                            {log.action}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-400">{log.target_type}</td>
                        <td className="py-3 px-4 text-slate-300">
                          {log.metadata ? JSON.stringify(log.metadata) : '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
          </div>
        )}

        {/* TAB 6: SYSTEM CONFIG */}
        {activeAdminTab === 'system' && diagnostics && (
          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-base font-bold text-white">Runtime Configuration</h3>
                <p className="text-xs text-slate-400">Active backend environment parameters.</p>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-bold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                {diagnostics.app_env}
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                <div className="text-[11px] font-semibold text-slate-400 uppercase">Storage</div>
                <div className="text-white font-bold">{diagnostics.storage_provider}</div>
                <div className="text-slate-400">Bucket: <code className="text-cyan-300">{diagnostics.r2_bucket}</code></div>
              </div>
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                <div className="text-[11px] font-semibold text-slate-400 uppercase">AI Engine</div>
                <div className="text-white font-bold">{diagnostics.llm_model}</div>
                <div className="text-slate-400">Embedding: <code className="text-cyan-300">{diagnostics.embedding_model} ({diagnostics.embedding_dimension}d)</code></div>
              </div>
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                <div className="text-[11px] font-semibold text-slate-400 uppercase">Email</div>
                <div className="text-white font-bold">{diagnostics.email_enabled ? diagnostics.smtp_host : 'Disabled'}</div>
                <div className="text-slate-400">From: <code className="text-cyan-300">{diagnostics.smtp_from_email}</code></div>
              </div>
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                <div className="text-[11px] font-semibold text-slate-400 uppercase">URLs</div>
                <div className="text-slate-400">App: <code className="text-cyan-300">{diagnostics.public_app_url}</code></div>
                <div className="text-slate-400">API: <code className="text-cyan-300">{diagnostics.api_base_url}</code></div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
