'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { ApiClient, PendingInviteDTO, WorkspaceMemberDTO } from '../../../lib/api';
import { formatBytes, formatDate } from '../../../lib/format';
import { LIMIT_ROWS, PLANS } from '../../../lib/site';
import { Button, inputClass, Spinner } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { Modal } from '../../ui/Modal';
import { ThemeToggle } from '../../ui/ThemeToggle';
import { useToast } from '../../ui/Toast';
import { WorkspaceApiKeysPanel, WorkspaceAuditLogsPanel, WorkspaceWebhooksPanel } from '../GovernancePanels';
import { Meter, PageHeader, Panel } from '../parts';
import { useWorkspace } from '../WorkspaceContext';

type SubTab = 'workspace' | 'plan' | 'team' | 'apikeys' | 'webhooks' | 'activity' | 'account';

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
  const { session, usage, canManageMembers, updateWorkspaceTitle, handleApiError } = useWorkspace();
  const toast = useToast();
  const [nameInput, setNameInput] = useState(session.workspaceName);
  const [saving, setSaving] = useState(false);

  const rename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session.workspaceId || !nameInput.trim() || nameInput.trim() === session.workspaceName) return;
    setSaving(true);
    try {
      const updated = await ApiClient.updateWorkspaceName(session.workspaceId, nameInput.trim());
      updateWorkspaceTitle(updated.name);
      toast(`Workspace renamed to ${updated.name}.`, 'success');
    } catch (err) {
      if (!handleApiError(err)) toast(err instanceof Error ? err.message : 'Could not rename workspace.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
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
      {canManageMembers && session.workspaceId && (
        <Panel className="p-5 sm:p-6">
          <h2 className="text-base font-semibold">Rename workspace</h2>
          <form onSubmit={rename} className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              required
              minLength={2}
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              className={`${inputClass} sm:flex-1`}
              aria-label="Workspace name"
            />
            <Button type="submit" disabled={saving || !nameInput.trim() || nameInput.trim() === session.workspaceName}>
              {saving && <Spinner />} Save name
            </Button>
          </form>
        </Panel>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
function PlanTab() {
  const { session, usage, isOwner, refreshUsage, handleApiError } = useWorkspace();
  const toast = useToast();
  const [target, setTarget] = useState<(typeof PLANS)[number] | null>(null);
  const [saving, setSaving] = useState(false);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');

  const current = usage?.tier;
  const isNearQuota =
    !!usage &&
    (usage.questions_used / Math.max(1, usage.questions_limit) >= 0.8 ||
      usage.documents_count / Math.max(1, usage.documents_limit) >= 0.8);

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
      {isNearQuota && (
        <div className="flex items-center justify-between rounded-xl border border-warn/40 bg-warn-soft p-4">
          <div className="flex items-center gap-2.5">
            <Icon name="alert" className="size-4 shrink-0 text-warn" />
            <p className="text-xs font-medium text-warn">
              You are approaching your plan&apos;s usage limit (&ge;80% consumed). Consider upgrading to avoid service pauses.
            </p>
          </div>
          {isOwner && current !== 'ENTERPRISE' && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                const nextPlan = PLANS.find(p => p.id === (current === 'STARTER' ? 'PRO' : 'ENTERPRISE'));
                if (nextPlan) setTarget(nextPlan);
              }}
            >
              Upgrade Plan
            </Button>
          )}
        </div>
      )}

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

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Available Subscription Plans</h2>
          <p className="text-xs text-muted">Scale capacity with zero downtime or migration friction.</p>
        </div>
        <div className="inline-flex items-center rounded-lg border border-line bg-surface-1 p-1 text-xs">
          <button
            type="button"
            onClick={() => setBillingCycle('monthly')}
            className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
              billingCycle === 'monthly' ? 'bg-surface-2 text-fg shadow-sm' : 'text-muted hover:text-fg'
            }`}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setBillingCycle('annual')}
            className={`flex items-center gap-1 rounded-md px-2.5 py-1 font-medium transition-colors ${
              billingCycle === 'annual' ? 'bg-surface-2 text-fg shadow-sm' : 'text-muted hover:text-fg'
            }`}
          >
            <span>Annual</span>
            <span className="rounded bg-ok-soft px-1 text-[10px] font-semibold text-ok">Save 20%</span>
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {PLANS.map(p => {
          const isCurrent = current === p.id;
          const displayPrice = billingCycle === 'annual' ? Math.round(p.price * 0.8) : p.price;
          return (
            <Panel key={p.id} className={`flex flex-col p-5 ${isCurrent ? 'border-brand ring-1 ring-brand' : ''}`}>
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold">{p.name}</h3>
                {isCurrent && <span className="rounded-full bg-brand px-2.5 py-0.5 text-xs font-medium text-brand-fg">Current plan</span>}
              </div>
              <p className="mt-2">
                <span className="tabular text-3xl font-semibold">${displayPrice}</span>
                <span className="text-sm text-muted"> per month</span>
                {billingCycle === 'annual' && p.price > 0 && (
                  <span className="block text-[11px] text-ok">Billed annually (${displayPrice * 12}/yr)</span>
                )}
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
  const [invites, setInvites] = useState<PendingInviteDTO[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('MEMBER');
  const [inviting, setInviting] = useState(false);
  const [removing, setRemoving] = useState<WorkspaceMemberDTO | null>(null);
  const [transferTo, setTransferTo] = useState<WorkspaceMemberDTO | null>(null);
  const [busy, setBusy] = useState(false);
  const wsId = session.workspaceId;

  const load = useCallback(async () => {
    if (!wsId) return;
    try {
      const [mList, invList] = await Promise.all([
        ApiClient.getWorkspaceMembers(wsId),
        canManageMembers ? ApiClient.listPendingInvites(wsId).catch(() => []) : Promise.resolve([]),
      ]);
      setMembers(mList);
      setInvites(invList);
      setError(null);
    } catch (err) {
      if (!handleApiError(err)) setError(err instanceof Error ? err.message : 'Could not load members.');
      setMembers([]);
    }
  }, [wsId, canManageMembers, handleApiError]);

  useEffect(() => {
    let cancelled = false;
    if (!wsId) return;
    Promise.all([
      ApiClient.getWorkspaceMembers(wsId),
      canManageMembers ? ApiClient.listPendingInvites(wsId).catch(() => []) : Promise.resolve([]),
    ])
      .then(([mList, invList]) => {
        if (cancelled) return;
        setMembers(mList);
        setInvites(invList);
        setError(null);
      })
      .catch(err => {
        if (cancelled) return;
        if (!handleApiError(err)) setError(err instanceof Error ? err.message : 'Could not load members.');
        setMembers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [wsId, canManageMembers, handleApiError]);

  if (!wsId) return <Panel className="p-6 text-sm text-muted">Team management is available once this workspace has finished loading. Sign out and back in to refresh it.</Panel>;

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviting(true);
    try {
      const res = await ApiClient.inviteWorkspaceMember(wsId, email.trim(), role);
      toast(res.message || `Invitation sent to ${email.trim()}.`, 'success');
      setEmail('');
      void load();
    } catch (err) {
      if (!handleApiError(err)) toast(err instanceof Error ? err.message : 'Could not send the invitation.', 'error');
    } finally {
      setInviting(false);
    }
  };

  const revokeInvite = async (inv: PendingInviteDTO) => {
    try {
      await ApiClient.revokePendingInvite(wsId, inv.id);
      toast(`Cancelled invite for ${inv.email}.`, 'success');
      void load();
    } catch (err) {
      if (!handleApiError(err)) toast(err instanceof Error ? err.message : 'Could not cancel invite.', 'error');
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

  const confirmTransfer = async () => {
    if (!transferTo) return;
    setBusy(true);
    try {
      await ApiClient.transferWorkspaceOwnership(wsId, transferTo.user_id);
      toast(`Ownership transferred to ${transferTo.email}.`, 'success');
      setTransferTo(null);
      void load();
    } catch (err) {
      if (!handleApiError(err)) toast(err instanceof Error ? err.message : 'Ownership transfer failed.', 'error');
    } finally {
      setBusy(false);
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
              <option value="EMPLOYEE">Employee</option>
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
                        <option value="EMPLOYEE">Employee</option>
                        <option value="VIEWER">Viewer</option>
                      </select>
                    ) : (
                      roleLabel(m.role)
                    )}
                  </td>
                  <td className="tabular px-5 py-3.5 text-muted">{formatDate(m.joined_at)}</td>
                  <td className="px-5 py-3.5 text-right space-x-3">
                    {isOwner && !isSelf && m.role !== 'OWNER' && (
                      <button type="button" onClick={() => setTransferTo(m)} className="text-[13px] font-medium text-muted hover:text-fg hover:underline">
                        Make Owner
                      </button>
                    )}
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

      {canManageMembers && invites.length > 0 && (
        <Panel className="scroll-thin overflow-x-auto">
          <div className="border-b border-line px-5 py-3">
            <h3 className="text-sm font-semibold">Pending invitations ({invites.length})</h3>
          </div>
          <table className="w-full min-w-[30rem] border-collapse text-left text-sm">
            <tbody>
              {invites.map(inv => (
                <tr key={inv.id} className="border-b border-line last:border-b-0">
                  <td className="px-5 py-3 font-medium">{inv.email}</td>
                  <td className="px-5 py-3 text-muted">{roleLabel(inv.role)}</td>
                  <td className="px-5 py-3 text-xs text-faint">Expires {formatDate(inv.expires_at)}</td>
                  <td className="px-5 py-3 text-right">
                    <button type="button" onClick={() => revokeInvite(inv)} className="text-[13px] font-medium text-danger hover:underline">
                      Cancel
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

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

      <Modal
        open={!!transferTo}
        onClose={() => setTransferTo(null)}
        title="Transfer workspace ownership?"
        lockClose={busy}
        footer={
          <>
            <Button variant="ghost" onClick={() => setTransferTo(null)} disabled={busy}>Cancel</Button>
            <Button onClick={confirmTransfer} disabled={busy}>
              {busy && <Spinner />}
              Transfer Ownership
            </Button>
          </>
        }
      >
        <p className="text-[15px] leading-7 text-muted">
          <span className="font-medium text-fg">{transferTo?.email}</span> will become the workspace Owner, and your role will change to Admin.
        </p>
      </Modal>
    </div>
  );
}

/* ------------------------------------------------------------------ */
function ApiKeysTab() {
  const { session, canManageMembers, handleApiError } = useWorkspace();
  return <WorkspaceApiKeysPanel workspaceId={session.workspaceId} canManage={canManageMembers} onAuthError={handleApiError} />;
}

/* ------------------------------------------------------------------ */
function WebhooksTab() {
  const { session, canManageMembers, handleApiError } = useWorkspace();
  return (
    <WorkspaceWebhooksPanel
      workspaceId={session.workspaceId}
      canManage={canManageMembers}
      onAuthError={handleApiError}
    />
  );
}

/* ------------------------------------------------------------------ */
function ActivityTab() {
  const { session, canManageMembers, handleApiError } = useWorkspace();
  return (
    <WorkspaceAuditLogsPanel
      workspaceId={session.workspaceId}
      workspaceSlug={session.workspaceSlug}
      canManage={canManageMembers}
      onAuthError={handleApiError}
    />
  );
}

/* ------------------------------------------------------------------ */
function AccountTab() {
  const { session, signOut, handleApiError } = useWorkspace();
  const toast = useToast();

  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [changingPw, setChangingPw] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState('');
  const [deletingAcc, setDeletingAcc] = useState(false);

  const submitPasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPw.length < 8) {
      toast('New password must be at least 8 characters.', 'error');
      return;
    }
    setChangingPw(true);
    try {
      const res = await ApiClient.changePassword(currentPw, newPw);
      toast(res.message || 'Password updated. Please sign in again.', 'success');
      setCurrentPw('');
      setNewPw('');
      await signOut();
    } catch (err) {
      if (!handleApiError(err)) toast(err instanceof Error ? err.message : 'Failed to change password.', 'error');
    } finally {
      setChangingPw(false);
    }
  };

  const submitDeleteAccount = async () => {
    setDeletingAcc(true);
    try {
      await ApiClient.deleteAccount();
      toast('Your account has been scheduled for deletion.', 'info');
      setDeleteOpen(false);
      await signOut();
    } catch (err) {
      if (!handleApiError(err)) toast(err instanceof Error ? err.message : 'Failed to delete account.', 'error');
    } finally {
      setDeletingAcc(false);
    }
  };

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
        <h2 className="text-base font-semibold">Change password</h2>
        <p className="mt-1 text-sm text-muted">Updating your password revokes all active sessions across devices.</p>
        <form onSubmit={submitPasswordChange} className="mt-4 grid max-w-md gap-3">
          <div>
            <label htmlFor="cur-pw" className="mb-1 block text-xs font-medium text-muted">Current password</label>
            <input id="cur-pw" type="password" required value={currentPw} onChange={e => setCurrentPw(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="new-pw" className="mb-1 block text-xs font-medium text-muted">New password (min 8 characters)</label>
            <input id="new-pw" type="password" required minLength={8} value={newPw} onChange={e => setNewPw(e.target.value)} className={inputClass} />
          </div>
          <div>
            <Button type="submit" variant="secondary" disabled={changingPw}>
              {changingPw && <Spinner />} Update password
            </Button>
          </div>
        </form>
      </Panel>

      <Panel className="p-5 sm:p-6">
        <h2 className="text-base font-semibold">Delete your account</h2>
        <p className="mt-1 max-w-xl text-sm leading-6 text-muted">
          Permanently deletes your account, solo workspaces, uploaded files, vector chunks, and conversation history. This cannot be undone.
        </p>
        <Button variant="danger" className="mt-4" onClick={() => setDeleteOpen(true)}>
          Delete my account
        </Button>
      </Panel>

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Permanently delete your account?"
        lockClose={deletingAcc}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)} disabled={deletingAcc}>Cancel</Button>
            <Button
              variant="danger-solid"
              disabled={deletingAcc || confirmEmail.trim().toLowerCase() !== session.email.toLowerCase()}
              onClick={submitDeleteAccount}
            >
              {deletingAcc && <Spinner />} Permanently delete
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm text-muted">
          <p>
            Type <strong className="text-fg">{session.email}</strong> below to confirm permanent account deletion:
          </p>
          <input
            type="email"
            value={confirmEmail}
            onChange={e => setConfirmEmail(e.target.value)}
            placeholder={session.email}
            className={inputClass}
          />
        </div>
      </Modal>
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
    { id: 'apikeys', label: 'API Keys', icon: 'key' },
    { id: 'webhooks', label: 'Webhooks', icon: 'sparkles' },
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
          {tab === 'apikeys' && <ApiKeysTab />}
          {tab === 'webhooks' && <WebhooksTab />}
          {tab === 'activity' && <ActivityTab />}
          {tab === 'account' && <AccountTab />}
        </div>
      </div>
    </div>
  );
}
