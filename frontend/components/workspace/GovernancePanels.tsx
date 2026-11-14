'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiClient, ApiKeyDTO, AuditEventDTO, TierSpecDTO, UsageSummaryDTO, WebhookDTO, WebhookTestPingResponse } from '../../lib/api';
import { formatBytes, formatDate, formatDateTime } from '../../lib/format';
import { Button, inputClass, Spinner } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { useToast } from '../ui/Toast';
import { Meter, Panel } from './parts';

function humanizeAction(action: string): string {
  const s = action.toLowerCase().replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function QuotaMetersPanel({
  usage,
  memberCount,
  showTierComparison = false,
}: {
  usage: UsageSummaryDTO | null;
  memberCount?: number;
  showTierComparison?: boolean;
}) {
  const [tiers, setTiers] = useState<TierSpecDTO[]>([]);

  useEffect(() => {
    if (!showTierComparison) return;
    let cancelled = false;
    ApiClient.getTiers()
      .then(list => {
        if (!cancelled) setTiers(list);
      })
      .catch(() => {
        if (!cancelled) setTiers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [showTierComparison]);

  if (!usage) {
    return (
      <Panel className="p-6 text-sm text-muted">
        Usage metrics are loading or unavailable for this workspace.
      </Panel>
    );
  }

  const seatsUsed = memberCount ?? 1;
  const seatsLimit = usage.max_members_limit ?? 25;

  return (
    <div className="space-y-6">
      <Panel className="p-5 sm:p-6">
        <div className="flex flex-col gap-2 border-b border-line pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">Active Plan &amp; Quotas</p>
            <h2 className="mt-0.5 text-lg font-semibold tracking-tight">
              {usage.tier_name || usage.tier || 'Starter'} Plan
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full border border-line bg-surface-2 px-2.5 py-1 font-medium text-fg">
              Max file: {usage.max_file_mb ?? 20} MB
            </span>
            <span className="rounded-full border border-line bg-surface-2 px-2.5 py-1 font-medium text-fg">
              Max pages/PDF: {usage.max_pages ?? 200}
            </span>
            <span
              className={`rounded-full px-2.5 py-1 font-semibold ${
                usage.ai_features_enabled ? 'bg-ok-soft text-ok' : 'bg-warn-soft text-warn'
              }`}
            >
              {usage.ai_features_enabled ? 'AI Q&A Active' : 'AI Paused'}
            </span>
          </div>
        </div>

        <div className="mt-5 grid gap-6 sm:grid-cols-2">
          <Meter
            label="Indexed Documents"
            used={usage.documents_count}
            limit={usage.documents_limit}
            valueText={`${usage.documents_count.toLocaleString()} of ${usage.documents_limit.toLocaleString()}`}
          />
          <Meter
            label="Cloudflare Storage"
            used={usage.storage_bytes}
            limit={usage.storage_limit_bytes}
            valueText={`${formatBytes(usage.storage_bytes)} of ${formatBytes(usage.storage_limit_bytes)}`}
          />
          <Meter
            label="Monthly AI Questions"
            used={usage.questions_used}
            limit={usage.questions_limit}
            valueText={`${usage.questions_used.toLocaleString()} of ${usage.questions_limit.toLocaleString()}`}
            hint={usage.billing_period_reset_date ? `Resets ${formatDate(usage.billing_period_reset_date)}` : undefined}
          />
          <Meter
            label="Team & Employee Seats"
            used={seatsUsed}
            limit={seatsLimit}
            valueText={`${seatsUsed.toLocaleString()} of ${seatsLimit.toLocaleString()} seats`}
            hint="Managed directly by Company Admins"
          />
        </div>
      </Panel>

      {showTierComparison && tiers.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-3">
          {tiers.map(t => {
            const isCurrent = (usage.tier || '').toUpperCase() === t.tier.toUpperCase();
            return (
              <Panel
                key={t.tier}
                className={`flex flex-col justify-between p-5 ${isCurrent ? 'border-fg ring-1 ring-fg' : ''}`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-base font-semibold">{t.name}</h3>
                    {isCurrent && (
                      <span className="rounded-full bg-brand px-2.5 py-0.5 text-[11px] font-semibold text-brand-fg">
                        Current
                      </span>
                    )}
                  </div>
                  <p className="mt-1 font-mono text-xs text-muted">{t.tier}</p>
                  <ul className="mt-4 space-y-1.5 text-xs text-muted">
                    {t.features.map(f => (
                      <li key={f} className="flex items-center gap-2">
                        <Icon name="check" className="size-3.5 shrink-0 text-ok" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <p className="mt-4 border-t border-line pt-3 text-[11px] text-faint">
                  Up to {t.max_members.toLocaleString()} members &bull; {t.concurrent_uploads} concurrent uploads
                </p>
              </Panel>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function WorkspaceApiKeysPanel({
  workspaceId,
  canManage,
  onAuthError,
}: {
  workspaceId?: string;
  canManage: boolean;
  onAuthError?: (err: unknown) => boolean;
}) {
  const toast = useToast();
  const [keys, setKeys] = useState<ApiKeyDTO[] | null>(null);
  const [name, setName] = useState('');
  const [scope, setScope] = useState<'full' | 'read'>('full');
  const [creating, setCreating] = useState(false);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const reloadKeys = useCallback(async () => {
    if (!workspaceId || !canManage) return;
    try {
      setKeys(await ApiClient.listApiKeys(workspaceId));
    } catch (err) {
      if (!onAuthError?.(err)) {
        toast(err instanceof Error ? err.message : 'Failed to load API keys.', 'error');
      }
      setKeys([]);
    }
  }, [workspaceId, canManage, onAuthError, toast]);

  useEffect(() => {
    if (!workspaceId || !canManage) return;
    let cancelled = false;
    ApiClient.listApiKeys(workspaceId)
      .then(list => {
        if (!cancelled) setKeys(list);
      })
      .catch(err => {
        if (!cancelled) {
          onAuthError?.(err);
          setKeys([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, canManage, onAuthError]);

  if (!canManage) {
    return (
      <Panel className="p-6 text-sm text-muted">
        API keys can only be created and revoked by workspace Owners and Admins.
      </Panel>
    );
  }
  if (!workspaceId) {
    return <Panel className="p-6 text-sm text-muted">Workspace loading...</Panel>;
  }

  const createKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    try {
      const created = await ApiClient.createApiKey(
        workspaceId,
        name.trim(),
        scope === 'full' ? ['read', 'write'] : ['read'],
      );
      setRevealedKey(created.secret_key);
      setName('');
      toast(`API key "${created.name}" created.`, 'success');
      await reloadKeys();
    } catch (err) {
      if (!onAuthError?.(err)) toast(err instanceof Error ? err.message : 'Failed to create API key.', 'error');
    } finally {
      setCreating(false);
    }
  };

  const revoke = async (k: ApiKeyDTO) => {
    setRevokingId(k.id);
    try {
      await ApiClient.revokeApiKey(workspaceId, k.id);
      toast(`Revoked key "${k.name}".`, 'success');
      await reloadKeys();
    } catch (err) {
      if (!onAuthError?.(err)) toast(err instanceof Error ? err.message : 'Could not revoke API key.', 'error');
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <Panel className="p-5 sm:p-6">
        <div className="flex flex-col gap-1 border-b border-line pb-4">
          <h2 className="text-base font-semibold">Workspace API Keys</h2>
          <p className="text-sm text-muted">
            Issue scoped server-to-server keys using{' '}
            <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-fg">X-API-Key: dm_live_...</code>{' '}
            for automation scripts, CI document sync, or internal tools.
          </p>
        </div>

        <form onSubmit={createKey} className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            required
            minLength={2}
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. HR Policy Sync or CI Pipeline"
            className={`${inputClass} sm:flex-1`}
          />
          <select
            value={scope}
            onChange={e => setScope(e.target.value as 'full' | 'read')}
            aria-label="API key permissions"
            className={`${inputClass} sm:w-44`}
          >
            <option value="full">Read &amp; Write</option>
            <option value="read">Read Only</option>
          </select>
          <Button type="submit" disabled={creating || !name.trim()}>
            {creating ? <Spinner /> : <Icon name="key" className="size-3.5" />}
            <span>Create Key</span>
          </Button>
        </form>

        {revealedKey && (
          <div className="mt-4 space-y-2 rounded-xl border border-ok/40 bg-ok-soft p-4">
            <p className="text-xs font-semibold text-ok">
              Copy this API key now — for security, the full secret is never displayed again.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 break-all rounded-lg border border-line bg-bg px-3 py-2 font-mono text-xs text-fg">
                {revealedKey}
              </code>
              <Button
                size="sm"
                variant="secondary"
                onClick={async () => {
                  await navigator.clipboard.writeText(revealedKey);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
              >
                <Icon name={copied ? 'check' : 'copy'} className="size-3.5" />
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
          </div>
        )}
      </Panel>

      <Panel className="scroll-thin overflow-x-auto">
        <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-line bg-surface-2/60">
              <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-faint">Name</th>
              <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-faint">Prefix</th>
              <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-faint">Scope</th>
              <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-faint">Last Used</th>
              <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-faint">Action</th>
            </tr>
          </thead>
          <tbody>
            {keys === null ? (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center">
                  <Spinner className="size-4" />
                </td>
              </tr>
            ) : keys.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-muted">
                  No active API keys yet.
                </td>
              </tr>
            ) : (
              keys.map(k => (
                <tr key={k.id} className="border-b border-line last:border-b-0">
                  <td className="px-5 py-3.5 font-medium">{k.name}</td>
                  <td className="px-5 py-3.5 font-mono text-xs text-muted">{k.key_prefix}</td>
                  <td className="px-5 py-3.5 text-xs">
                    <span className="rounded-full bg-surface-2 px-2 py-0.5 font-medium text-fg">
                      {k.scopes.includes('write') ? 'Read & Write' : 'Read Only'}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-xs text-muted">
                    {k.last_used_at ? formatDateTime(k.last_used_at) : 'Never used'}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <button
                      type="button"
                      disabled={revokingId === k.id}
                      onClick={() => void revoke(k)}
                      className="text-xs font-semibold text-danger hover:underline disabled:opacity-50"
                    >
                      {revokingId === k.id ? 'Revoking...' : 'Revoke'}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}

export function WorkspaceWebhooksPanel({
  workspaceId,
  canManage,
  onAuthError,
}: {
  workspaceId?: string;
  canManage: boolean;
  onAuthError?: (err: unknown) => boolean;
}) {
  const toast = useToast();
  const [webhooks, setWebhooks] = useState<WebhookDTO[] | null>(null);
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [events, setEvents] = useState<string[]>(['document.ready', 'document.failed']);
  const [creating, setCreating] = useState(false);
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [pingResult, setPingResult] = useState<{ id: string; success: boolean; text: string } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const reloadWebhooks = useCallback(async () => {
    if (!workspaceId || !canManage) return;
    try {
      setWebhooks(await ApiClient.listWebhooks(workspaceId));
    } catch (err) {
      if (!onAuthError?.(err)) toast(err instanceof Error ? err.message : 'Failed to load webhooks.', 'error');
      setWebhooks([]);
    }
  }, [workspaceId, canManage, onAuthError, toast]);

  useEffect(() => {
    reloadWebhooks();
  }, [reloadWebhooks]);

  if (!canManage) {
    return (
      <Panel className="p-6 text-sm text-muted">
        Webhooks can only be managed by workspace Owners and Admins.
      </Panel>
    );
  }
  if (!workspaceId) {
    return <Panel className="p-6 text-sm text-muted">Workspace loading...</Panel>;
  }

  const toggleEvent = (ev: string) => {
    setEvents(prev => (prev.includes(ev) ? prev.filter(x => x !== ev) : [...prev, ev]));
  };

  const createHook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    setCreating(true);
    try {
      const created = await ApiClient.createWebhook(workspaceId, {
        url: url.trim(),
        description: description.trim() || undefined,
        events: events.length > 0 ? events : ['document.ready'],
      });
      setRevealedSecret(created.secret);
      setUrl('');
      setDescription('');
      toast('Webhook endpoint registered.', 'success');
      await reloadWebhooks();
    } catch (err) {
      if (!onAuthError?.(err)) toast(err instanceof Error ? err.message : 'Failed to create webhook.', 'error');
    } finally {
      setCreating(false);
    }
  };

  const testPing = async (hook: WebhookDTO) => {
    setTestingId(hook.id);
    try {
      const res = await ApiClient.testWebhook(workspaceId, hook.id);
      setPingResult({
        id: hook.id,
        success: res.success,
        text: `${res.success ? '200 OK' : `Status ${res.status_code}`} (${res.latency_ms}ms): ${res.response_preview}`,
      });
      toast(res.success ? 'Ping delivered successfully.' : 'Ping failed or returned non-2xx status.', res.success ? 'success' : 'error');
      await reloadWebhooks();
    } catch (err) {
      if (!onAuthError?.(err)) toast(err instanceof Error ? err.message : 'Ping delivery failed.', 'error');
    } finally {
      setTestingId(null);
    }
  };

  const deleteHook = async (hook: WebhookDTO) => {
    setDeletingId(hook.id);
    try {
      await ApiClient.deleteWebhook(workspaceId, hook.id);
      toast('Webhook deleted.', 'success');
      await reloadWebhooks();
    } catch (err) {
      if (!onAuthError?.(err)) toast(err instanceof Error ? err.message : 'Failed to delete webhook.', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <Panel className="p-5 sm:p-6">
        <div className="flex flex-col gap-1 border-b border-line pb-4">
          <h2 className="text-base font-semibold">Webhooks &amp; Automated Pipeline Dispatch</h2>
          <p className="text-sm text-muted">
            Deliver signed HMAC-SHA256 event payloads to external systems (Slack, Zapier, or internal microservices)
            when documents are indexed or fail.
          </p>
        </div>

        <form onSubmit={createHook} className="mt-4 space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="url"
              required
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://api.yourcompany.com/webhooks/docmind"
              className={`${inputClass} sm:flex-1`}
            />
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Description (e.g. Slack Ingest Alerts)"
              className={`${inputClass} sm:w-64`}
            />
            <Button type="submit" disabled={creating || !url.trim()}>
              {creating ? <Spinner /> : <Icon name="sparkles" className="size-3.5" />}
              <span>Add Endpoint</span>
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs text-muted">
            <span className="font-semibold text-fg">Trigger Events:</span>
            {[
              { id: 'document.ready', label: 'Document Ready' },
              { id: 'document.failed', label: 'Ingestion Failed' },
              { id: 'knowledge_gap.created', label: 'Knowledge Gap' },
              { id: 'quota.warning', label: 'Quota Alert' },
            ].map(ev => (
              <label key={ev.id} className="flex cursor-pointer items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={events.includes(ev.id)}
                  onChange={() => toggleEvent(ev.id)}
                  className="rounded border-line"
                />
                <span>{ev.label}</span>
              </label>
            ))}
          </div>
        </form>

        {revealedSecret && (
          <div className="mt-4 space-y-2 rounded-xl border border-ok/40 bg-ok-soft p-4">
            <p className="text-xs font-semibold text-ok">
              Webhook signing secret generated. Use this to verify incoming requests via the{' '}
              <code className="rounded bg-bg px-1 font-mono text-[11px] text-fg">X-DocMind-Signature</code> header.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 break-all rounded-lg border border-line bg-bg px-3 py-2 font-mono text-xs text-fg">
                {revealedSecret}
              </code>
              <Button
                size="sm"
                variant="secondary"
                onClick={async () => {
                  await navigator.clipboard.writeText(revealedSecret);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
              >
                <Icon name={copied ? 'check' : 'copy'} className="size-3.5" />
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
          </div>
        )}
      </Panel>

      <Panel className="scroll-thin overflow-x-auto">
        <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-line bg-surface-2/60">
              <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-faint">Endpoint URL</th>
              <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-faint">Events</th>
              <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-faint">Status</th>
              <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-faint">Actions</th>
            </tr>
          </thead>
          <tbody>
            {webhooks === null ? (
              <tr>
                <td colSpan={4} className="px-5 py-8 text-center">
                  <Spinner className="size-4" />
                </td>
              </tr>
            ) : webhooks.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-5 py-8 text-center text-muted">
                  No webhooks configured yet.
                </td>
              </tr>
            ) : (
              webhooks.map(w => (
                <tr key={w.id} className="border-b border-line last:border-b-0">
                  <td className="px-5 py-3.5 font-medium">
                    <p className="truncate font-mono text-xs text-fg">{w.url}</p>
                    {w.description && <p className="text-xs text-muted">{w.description}</p>}
                    {pingResult && pingResult.id === w.id && (
                      <p
                        className={`mt-1 font-mono text-[11px] ${
                          pingResult.success ? 'text-ok' : 'text-danger'
                        }`}
                      >
                        Ping: {pingResult.text}
                      </p>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-xs">
                    <div className="flex flex-wrap gap-1">
                      {w.events.map(ev => (
                        <span key={ev} className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-muted">
                          {ev}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-xs text-muted">
                    {w.failure_count > 0 ? (
                      <span className="text-warn">{w.failure_count} delivery failures</span>
                    ) : (
                      <span className="text-ok">Healthy</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-right space-x-3">
                    <button
                      type="button"
                      disabled={testingId === w.id}
                      onClick={() => void testPing(w)}
                      className="text-xs font-semibold text-brand hover:underline disabled:opacity-50"
                    >
                      {testingId === w.id ? 'Testing...' : 'Test Ping'}
                    </button>
                    <button
                      type="button"
                      disabled={deletingId === w.id}
                      onClick={() => void deleteHook(w)}
                      className="text-xs font-semibold text-danger hover:underline disabled:opacity-50"
                    >
                      {deletingId === w.id ? 'Deleting...' : 'Delete'}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}


export function WorkspaceAuditLogsPanel({
  workspaceId,
  workspaceSlug,
  canManage,
  onAuthError,
}: {
  workspaceId?: string;
  workspaceSlug: string;
  canManage: boolean;
  onAuthError?: (err: unknown) => boolean;
}) {
  const toast = useToast();
  const [logs, setLogs] = useState<AuditEventDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!workspaceId || !canManage) return;
    let cancelled = false;
    ApiClient.getWorkspaceAuditLogs(workspaceId, 100)
      .then(data => {
        if (!cancelled) {
          setLogs(data);
          setError(null);
        }
      })
      .catch(err => {
        if (!cancelled) {
          if (!onAuthError?.(err)) setError(err instanceof Error ? err.message : 'Could not load audit trail.');
          setLogs([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, canManage, onAuthError]);

  const filteredLogs = useMemo(() => {
    if (!logs) return null;
    const q = search.trim().toLowerCase();
    if (!q) return logs;
    return logs.filter(
      l =>
        l.action.toLowerCase().includes(q) ||
        (l.actor_email || '').toLowerCase().includes(q) ||
        l.target_type.toLowerCase().includes(q) ||
        JSON.stringify(l.metadata || {}).toLowerCase().includes(q),
    );
  }, [logs, search]);

  if (!canManage) {
    return (
      <Panel className="p-6 text-sm text-muted">
        Audit logs are visible only to workspace Owners and Admins.
      </Panel>
    );
  }

  const exportCsv = async () => {
    if (!workspaceId) return;
    setExporting(true);
    try {
      const blob = await ApiClient.exportWorkspaceAuditLogsCsv(workspaceId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `docmind_audit_${workspaceSlug || workspaceId}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast('Audit log CSV exported.', 'success');
    } catch (err) {
      if (!onAuthError?.(err)) toast(err instanceof Error ? err.message : 'Export failed.', 'error');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold">Compliance Audit Trail</h2>
          <p className="text-xs text-muted">
            Immutable log of logins, employee provisioning, document uploads, role updates, and gap resolutions.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Icon name="search" className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
            <input
              type="search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Filter actor or action..."
              className="h-9 w-48 rounded-lg border border-line-strong bg-bg pl-8 pr-3 text-xs focus:border-fg focus:outline-none sm:w-56"
            />
          </div>
          <Button variant="secondary" size="sm" onClick={() => void exportCsv()} disabled={exporting}>
            <Icon name="download" className="size-3.5" />
            {exporting ? 'Exporting...' : 'Export CSV'}
          </Button>
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}

      <Panel className="overflow-hidden">
        {filteredLogs === null ? (
          <div className="flex justify-center py-10">
            <Spinner className="size-5 text-muted" />
          </div>
        ) : filteredLogs.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted">
            {search.trim() ? 'No matching audit events found.' : 'No audit events recorded yet.'}
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {filteredLogs.map(l => {
              const details = l.metadata
                ? Object.entries(l.metadata)
                    .filter(([, v]) => v !== null && v !== undefined && String(v).length > 0)
                    .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${String(v)}`)
                    .join(' • ')
                : '';
              return (
                <li key={l.id} className="flex flex-col gap-1 px-5 py-3.5 sm:flex-row sm:items-baseline sm:gap-6">
                  <time className="tabular w-40 shrink-0 text-xs text-muted" dateTime={l.created_at}>
                    {formatDateTime(l.created_at)}
                  </time>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-fg">{humanizeAction(l.action)}</span>
                      <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] uppercase text-muted">
                        {l.target_type}
                      </span>
                    </div>
                    <p className="mt-0.5 break-words text-xs text-muted">
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


