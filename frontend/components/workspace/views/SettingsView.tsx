'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { ApiClient, AuditEventDTO, WorkspaceMemberDTO } from '../../../lib/api';
import { formatBytes, formatDate, formatDateTime } from '../../../lib/format';
import { LIMIT_ROWS, PLANS, SUPPORT_EMAIL } from '../../../lib/site';
import { btn, Button, inputClass, Spinner } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { Modal } from '../../ui/Modal';
import { ThemeToggle } from '../../ui/ThemeToggle';
import { useToast } from '../../ui/Toast';
import { Meter, PageHeader, Panel } from '../parts';
import { useWorkspace } from '../WorkspaceContext';

type SubTab = 'workspace' | 'plan' | 'team' | 'activity' | 'account';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-b border-line px-5 py-4 last:border-b-0 sm:flex-row sm:items-center sm:gap-6">
      <dt className="w-44 shrink-0 text-sm text-muted">{label}</dt>
      <dd className="min-w-0 text-[15px] font-medium">{children}</dd>
    </div>
  );
}

const roleLabel = (r: string) => r.charAt(0) + r.slice(1).toLowerCase();

/* ------------------------------------------------------------------ */
function WorkspaceTab() {
  const { session, usage } = useWorkspace();
  return (
    <Panel>
      <dl>
        <Row label="Name">{session.workspaceName}</Row>
        <Row label="Address">
          <span className="font-mono text-sm">{session.workspaceSlug}</span>
        </Row>
        <Row label="Your role">{roleLabel(session.role)}</Row>
        <Row label="Plan">{usage?.tier_name || usage?.tier || 'Not available'}</Row>
        {session.workspaceId && (
          <Row label="Workspace ID">
            <span className="break-all font-mono text-[13px] font-normal text-muted">{session.workspaceId}</span>
          </Row>
        )}
      </dl>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
function PlanTab() {
  const { session, usage, isOwner, refreshUsage, handleApiError } = useWorkspace();
  const toast = useToast();
  const [target, setTarget] = useState<(typeof PLANS)[number] | null>(null);
  const [saving, setSaving] = useState(false);

  const current = usage?.tier;
  const confirm = async () => {
    if (!target || !session.workspaceId) return;
    setSaving(true);
    try {
      await ApiClient.updateWorkspaceTier(session.workspaceId, target.id);
      await refreshUsage();
      toast(`Your workspace is now on the ${target.name} plan.`, 'success');
      setTarget(null);
    } catch (err) {
      if (!handleApiError(err)) toast(err instanceof Error ? err.message : 'Could not change the plan.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {usage && (
        <Panel className="grid gap-6 p-5 sm:grid-cols-2 sm:p-6">
          <Meter label="Documents" used={usage.documents_count} limit={usage.documents_limit} valueText={`${usage.documents_count} of ${usage.documents_limit.toLocaleString('en-US')}`} />
          <Meter
            label="Storage"
            used={usage.storage_bytes}
            limit={usage.storage_limit_bytes}
            valueText={`${formatBytes(usage.storage_bytes)} of ${formatBytes(usage.storage_limit_bytes)}`}
            hint={usage.max_file_mb ? `Up to ${usage.max_file_mb} MB per file` : undefined}
          />
          <Meter
            label="Questions this month"
            used={usage.questions_used}
            limit={usage.questions_limit}
            valueText={`${usage.questions_used} of ${usage.questions_limit.toLocaleString('en-US')}`}
            hint={usage.billing_period_reset_date ? `Resets ${formatDate(usage.billing_period_reset_date)}` : undefined}
          />
          {usage.max_members_limit !== undefined && (
            <div>
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-medium">Team seats</span>
                <span className="tabular text-muted">{usage.max_members_limit.toLocaleString('en-US')} included</span>
              </div>
              <p className="mt-2 text-[13px] text-faint">
                {usage.concurrent_uploads_limit ? `${usage.concurrent_uploads_limit} ${usage.concurrent_uploads_limit === 1 ? 'upload' : 'uploads'} at once` : ''}
                {usage.max_pages ? ` • ${usage.max_pages} pages per file` : ''}
              </p>
            </div>
          )}
        </Panel>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {PLANS.map(p => {
          const isCurrent = current === p.id;
          return (
            <Panel key={p.id} className={`flex flex-col p-5 ${isCurrent ? 'border-brand ring-1 ring-brand' : ''}`}>
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold">{p.name}</h3>
                {isCurrent && <span className="rounded-full bg-brand px-2.5 py-0.5 text-xs font-medium text-brand-fg">Current plan</span>}
              </div>
              <p className="mt-2">
                <span className="tabular text-3xl font-semibold">${p.price}</span>
                <span className="text-sm text-muted"> per month</span>
              </p>
              <ul className="mt-4 flex-1 space-y-1.5 text-sm text-muted">
                {LIMIT_ROWS.slice(0, 4).map(r => (
                  <li key={r.key} className="flex justify-between gap-3">
                    <span>{r.label}</span>
                    <span className="tabular font-medium text-fg">{r.format(p.limits[r.key])}</span>
                  </li>
                ))}
                <li className="flex justify-between gap-3">
                  <span>Team seats</span>
                  <span className="tabular font-medium text-fg">{p.limits.seats.toLocaleString('en-US')}</span>
                </li>
              </ul>
              {!isCurrent && (
                <Button variant="secondary" className="mt-5 w-full" disabled={!isOwner || !session.workspaceId} onClick={() => setTarget(p)}>
                  Switch to {p.name}
                </Button>
              )}
            </Panel>
          );
        })}
      </div>
      {!isOwner && <p className="text-sm text-muted">Only the workspace owner can change the plan.</p>}

      <Modal
        open={!!target}
        onClose={() => setTarget(null)}
        title={`Switch to ${target?.name}?`}
        lockClose={saving}
        footer={
          <>
            <Button variant="ghost" onClick={() => setTarget(null)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={confirm} disabled={saving}>
              {saving && <Spinner />}
              Switch plan
            </Button>
          </>
        }
      >
        <p className="text-[15px] leading-7 text-muted">
          Limits change right away to those of the {target?.name} plan (${target?.price} per month). If your usage is above the new
          limits, existing documents stay, but new uploads and questions are blocked until you are within them.
        </p>
      </Modal>
    </div>
  );
}

/* ------------------------------------------------------------------ */
function TeamTab() {
  const { session, usage, canManageMembers, isOwner, handleApiError } = useWorkspace();
  const toast = useToast();
  const [members, setMembers] = useState<WorkspaceMemberDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('MEMBER');
  const [inviting, setInviting] = useState(false);
  const [removing, setRemoving] = useState<WorkspaceMemberDTO | null>(null);
  const [busy, setBusy] = useState(false);
  const wsId = session.workspaceId;

  const load = useCallback(async () => {
    if (!wsId) return;
    try {
      setMembers(await ApiClient.getWorkspaceMembers(wsId));
      setError(null);
    } catch (err) {
      if (!handleApiError(err)) setError(err instanceof Error ? err.message : 'Could not load members.');
      setMembers([]);
    }
  }, [wsId, handleApiError]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  if (!wsId) return <Panel className="p-6 text-sm text-muted">Team management is available once this workspace has finished loading. Sign out and back in to refresh it.</Panel>;

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviting(true);
    try {
      await ApiClient.inviteWorkspaceMember(wsId, email.trim(), role);
      toast(`Invitation sent to ${email.trim()}.`, 'success');
      setEmail('');
      void load();
    } catch (err) {
      if (!handleApiError(err)) toast(err instanceof Error ? err.message : 'Could not send the invitation.', 'error');
    } finally {
      setInviting(false);
    }
  };

  const changeRole = async (m: WorkspaceMemberDTO, next: string) => {
    try {
      await ApiClient.updateMemberRole(wsId, m.user_id, next);
      toast(`${m.email} is now ${roleLabel(next)}.`, 'success');
      void load();
    } catch (err) {
      if (!handleApiError(err)) toast(err instanceof Error ? err.message : 'Could not change the role.', 'error');
    }
  };

  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    try {
      await ApiClient.removeWorkspaceMember(wsId, removing.user_id);
      toast(`${removing.email} was removed.`, 'success');
      setRemoving(null);
      void load();
    } catch (err) {
      if (!handleApiError(err)) toast(err instanceof Error ? err.message : 'Could not remove the member.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {canManageMembers && (
        <Panel className="p-5 sm:p-6">
          <h2 className="text-base font-semibold">Invite someone</h2>
          <p className="mt-1 text-sm text-muted">
            They get an email with a link to join{usage?.max_members_limit ? `. Your plan includes ${usage.max_members_limit.toLocaleString('en-US')} seats` : ''}.
          </p>
          <form onSubmit={invite} className="mt-4 flex flex-col gap-2 sm:flex-row">
            <label htmlFor="invite-email" className="sr-only">
              Email address
            </label>
            <input id="invite-email" type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="colleague@company.com" className={`${inputClass} sm:flex-1`} />
            <label htmlFor="invite-role" className="sr-only">
              Role
            </label>
            <select id="invite-role" value={role} onChange={e => setRole(e.target.value)} className={`${inputClass} sm:w-36`}>
              <option value="ADMIN">Admin</option>
              <option value="MEMBER">Member</option>
              <option value="VIEWER">Viewer</option>
            </select>
            <Button type="submit" disabled={inviting}>
              {inviting && <Spinner />}
              Send invite
            </Button>
          </form>
        </Panel>
      )}

      {error && <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p>}

      <Panel className="scroll-thin overflow-x-auto">
        <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
          <caption className="sr-only">Workspace members</caption>
          <thead>
            <tr className="border-b border-line bg-surface-2/60">
              <th scope="col" className="px-5 py-3 font-medium text-faint">Member</th>
              <th scope="col" className="px-5 py-3 font-medium text-faint">Role</th>
              <th scope="col" className="px-5 py-3 font-medium text-faint">Joined</th>
              <th scope="col" className="px-5 py-3"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {members === null && (
              <tr>
                <td colSpan={4} className="px-5 py-8 text-center text-muted"><Spinner className="size-4" /></td>
              </tr>
            )}
            {members?.map(m => {
              const isSelf = m.email === session.email;
              const editable = canManageMembers && m.role !== 'OWNER' && !isSelf && (isOwner || m.role !== 'ADMIN');
              return (
                <tr key={m.user_id} className="border-b border-line last:border-b-0">
                  <td className="px-5 py-3.5 font-medium">
                    {m.email}
                    {isSelf && <span className="ml-2 text-[13px] font-normal text-faint">You</span>}
                  </td>
                  <td className="px-5 py-3.5">
                    {editable ? (
                      <select
                        aria-label={`Role for ${m.email}`}
                        value={m.role}
                        onChange={e => changeRole(m, e.target.value)}
                        className="h-8 rounded-lg border border-line-strong bg-surface px-2 text-sm focus:border-fg focus:outline-none"
                      >
                        <option value="ADMIN">Admin</option>
                        <option value="MEMBER">Member</option>
                        <option value="VIEWER">Viewer</option>
                      </select>
                    ) : (
                      roleLabel(m.role)
                    )}
                  </td>
                  <td className="tabular px-5 py-3.5 text-muted">{formatDate(m.joined_at)}</td>
                  <td className="px-5 py-3.5 text-right">
                    {editable && (
                      <button type="button" onClick={() => setRemoving(m)} className="text-[13px] font-medium text-danger hover:underline">
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>

      <Modal
        open={!!removing}
        onClose={() => setRemoving(null)}
        title="Remove this member?"
        lockClose={busy}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRemoving(null)} disabled={busy}>Cancel</Button>
            <Button variant="danger-solid" onClick={remove} disabled={busy}>
              {busy && <Spinner />}
              Remove member
            </Button>
          </>
        }
      >
        <p className="text-[15px] leading-7 text-muted">
          <span className="font-medium text-fg">{removing?.email}</span> will lose access to this workspace right away. Their past conversations stay in the workspace.
        </p>
      </Modal>
    </div>
  );
}

/* ------------------------------------------------------------------ */
function humanize(action: string): string {
  const s = action.toLowerCase().replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function ActivityTab() {
  const { session, canManageMembers, handleApiError } = useWorkspace();
  const [logs, setLogs] = useState<AuditEventDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wsId = session.workspaceId;

  useEffect(() => {
    if (!wsId || !canManageMembers) return;
    ApiClient.getWorkspaceAuditLogs(wsId, 50)
      .then(setLogs)
      .catch(err => {
        if (!handleApiError(err)) setError(err instanceof Error ? err.message : 'Could not load activity.');
        setLogs([]);
      });
  }, [wsId, canManageMembers, handleApiError]);

  if (!canManageMembers) return <Panel className="p-6 text-sm text-muted">The activity log is visible to workspace owners and admins.</Panel>;

  return (
    <div>
      {error && <p role="alert" className="mb-4 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p>}
      <Panel>
        {logs === null ? (
          <div className="flex justify-center py-10"><Spinner className="size-5 text-muted" /></div>
        ) : logs.length === 0 ? (
          <p className="px-5 py-10 text-center text-[15px] text-muted">No activity recorded yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {logs.map(l => {
              const details = l.metadata ? Object.entries(l.metadata).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${String(v)}`).join(', ') : '';
              return (
                <li key={l.id} className="flex flex-col gap-1 px-5 py-3.5 sm:flex-row sm:items-baseline sm:gap-6">
                  <time className="tabular w-36 shrink-0 text-[13px] text-muted" dateTime={l.created_at}>{formatDateTime(l.created_at)}</time>
                  <div className="min-w-0">
                    <p className="text-[15px] font-medium">{humanize(l.action)}</p>
                    <p className="break-words text-[13px] text-muted">
                      {l.actor_email || 'System'}
                      {details ? ` • ${details}` : ''}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}

/* ------------------------------------------------------------------ */
function AccountTab() {
  const { session } = useWorkspace();
  return (
    <div className="space-y-6">
      <Panel>
        <dl>
          <Row label="Name">{session.fullName}</Row>
          <Row label="Email">{session.email}</Row>
          <Row label="Appearance">
            <span className="inline-flex items-center gap-2">
              <ThemeToggle className="-ml-2" />
              <span className="text-sm font-normal text-muted">Switch between light and dark</span>
            </span>
          </Row>
        </dl>
      </Panel>
      <Panel className="p-5 sm:p-6">
        <h2 className="text-base font-semibold">Delete your account</h2>
        <p className="mt-1 max-w-xl text-sm leading-6 text-muted">
          Deleting your account removes your documents, passages and conversations. This cannot be undone. Email us from your account address and we will confirm before anything is removed.
        </p>
        <a
          href={`mailto:${SUPPORT_EMAIL}?subject=Delete%20my%20DocMind%20account&body=Please%20delete%20the%20account%20for%20${encodeURIComponent(session.email)}.`}
          className={btn('danger', 'md', 'mt-4')}
        >
          Email us to delete
        </a>
      </Panel>
    </div>
  );
}

/* ------------------------------------------------------------------ */
export function SettingsView() {
  const { session } = useWorkspace();
  const [tab, setTab] = useState<SubTab>('workspace');

  const tabs: { id: SubTab; label: string; icon: React.ComponentProps<typeof Icon>['name'] }[] = [
    { id: 'workspace', label: 'Workspace', icon: 'building' },
    { id: 'plan', label: 'Plan and usage', icon: 'layers' },
    { id: 'team', label: 'Team', icon: 'users' },
    { id: 'activity', label: 'Activity', icon: 'history' },
    { id: 'account', label: 'Account', icon: 'user' },
  ];

  return (
    <div>
      <PageHeader title="Settings" description={`Manage ${session.workspaceName} and your account.`} />
      <div className="grid gap-6 md:grid-cols-[12rem_1fr] md:gap-8">
        <nav aria-label="Settings sections" className="scroll-thin -mx-1 flex gap-1 overflow-x-auto px-1 md:flex-col md:overflow-visible">
          {tabs.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              aria-current={tab === t.id ? 'page' : undefined}
              className={`flex items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
                tab === t.id ? 'bg-surface-2 text-fg' : 'text-muted hover:bg-surface-2/70 hover:text-fg'
              }`}
            >
              <Icon name={t.icon} className="size-4" />
              {t.label}
            </button>
          ))}
        </nav>
        <div className="min-w-0">
          {tab === 'workspace' && <WorkspaceTab />}
          {tab === 'plan' && <PlanTab />}
          {tab === 'team' && <TeamTab />}
          {tab === 'activity' && <ActivityTab />}
          {tab === 'account' && <AccountTab />}
        </div>
      </div>
    </div>
  );
}
