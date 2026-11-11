'use client';

import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ApiClient } from '../../lib/api';
import { friendlyError } from '../../lib/auth-flow';
import { AuthShell } from '../../components/auth/AuthShell';
import { Button, inputClass, LinkButton, Spinner } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';

function StatusIcon({ kind }: { kind: 'ok' | 'error' | 'mail' }) {
  const styles = {
    ok: 'bg-ok-soft text-ok',
    error: 'bg-danger-soft text-danger',
    mail: 'bg-brand-soft text-brand-ink',
  }[kind];
  const icon = kind === 'ok' ? 'check' : kind === 'error' ? 'x' : 'users';
  return (
    <div className={`mb-5 inline-flex size-11 items-center justify-center rounded-full ${styles}`}>
      <Icon name={icon} className="size-5" strokeWidth={2.2} />
    </div>
  );
}

function AuthActionContent() {
  const searchParams = useSearchParams();
  const action = searchParams.get('action');
  const token = searchParams.get('token');
  const emailParam = searchParams.get('email');
  const workspaceParam = searchParams.get('workspace');

  const [loading, setLoading] = useState(action === 'verify' && !!token);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    if (action === 'verify' && token) {
      ApiClient.verifyEmail(token)
        .then(() => setSuccess('Your email is verified and your account is active.'))
        .catch(err => setError(friendlyError(err, 'This verification link is invalid or has expired.')))
        .finally(() => setLoading(false));
    }
  }, [action, token]);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!token) return setError('This reset link is missing its token. Request a new one from the sign-in page.');
    if (newPassword.length < 8) return setError('Use at least 8 characters for your password.');
    if (newPassword !== confirmPassword) return setError('The two passwords do not match.');

    setLoading(true);
    try {
      await ApiClient.resetPassword(token, newPassword);
      setSuccess('Your password has been changed. Sign in with the new one.');
    } catch (err) {
      setError(friendlyError(err, 'This reset link has expired or was already used. Request a new one.'));
    } finally {
      setLoading(false);
    }
  };

  /* Verify email */
  if (action === 'verify') {
    if (loading) {
      return (
        <div className="text-center">
          <Spinner className="mx-auto size-6" />
          <p className="mt-4 text-sm text-muted">Verifying your email&hellip;</p>
        </div>
      );
    }
    return success ? (
      <div>
        <StatusIcon kind="ok" />
        <h1 className="text-2xl font-semibold tracking-tight">Email verified</h1>
        <p className="mt-2 text-[15px] leading-7 text-muted">{success}</p>
        <LinkButton href="/login" size="lg" className="mt-6 w-full">
          Sign in
        </LinkButton>
      </div>
    ) : (
      <div>
        <StatusIcon kind="error" />
        <h1 className="text-2xl font-semibold tracking-tight">Verification failed</h1>
        <p className="mt-2 text-[15px] leading-7 text-muted">{error || 'This verification link is invalid or has expired.'}</p>
        <LinkButton href="/login" variant="secondary" size="lg" className="mt-6 w-full">
          Back to sign in
        </LinkButton>
      </div>
    );
  }

  /* Reset password */
  if (action === 'reset') {
    if (success) {
      return (
        <div>
          <StatusIcon kind="ok" />
          <h1 className="text-2xl font-semibold tracking-tight">Password changed</h1>
          <p className="mt-2 text-[15px] leading-7 text-muted">{success}</p>
          <LinkButton href="/login" size="lg" className="mt-6 w-full">
            Sign in
          </LinkButton>
        </div>
      );
    }
    return (
      <div>
        <h1 className="text-[1.75rem] font-semibold leading-tight tracking-[-0.02em]">Set a new password</h1>
        <p className="mt-2 text-[15px] leading-6 text-muted">Choose a password with at least 8 characters.</p>
        <form onSubmit={handleReset} className="mt-7 space-y-4">
          {error && (
            <div role="alert" className="flex items-start gap-2.5 rounded-lg bg-danger-soft px-3.5 py-3 text-sm text-danger">
              <Icon name="alert" className="mt-0.5 size-4" />
              <span>{error}</span>
            </div>
          )}
          <div>
            <label htmlFor="np" className="mb-1.5 block text-sm font-medium">
              New password
            </label>
            <input id="np" type="password" required minLength={8} autoComplete="new-password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="cp" className="mb-1.5 block text-sm font-medium">
              Confirm new password
            </label>
            <input id="cp" type="password" required minLength={8} autoComplete="new-password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className={inputClass} />
          </div>
          <Button type="submit" size="lg" className="w-full" disabled={loading}>
            {loading && <Spinner />}
            Save new password
          </Button>
        </form>
      </div>
    );
  }

  /* Workspace invitation */
  if (action === 'invite') {
    return (
      <div>
        <StatusIcon kind="mail" />
        <h1 className="text-2xl font-semibold tracking-tight">You have been invited</h1>
        <p className="mt-2 text-[15px] leading-7 text-muted">
          {emailParam ? (
            <>
              The invitation was sent to <span className="font-medium text-fg">{emailParam}</span>.
            </>
          ) : (
            'You have been invited to a DocMind workspace.'
          )}{' '}
          Sign in with that address, or create an account, to join.
        </p>
        {workspaceParam && (
          <p className="mt-3 rounded-lg bg-surface-2 px-3 py-2 text-[13px] text-muted">
            Workspace ID <code className="font-mono text-fg">{workspaceParam}</code>
          </p>
        )}
        <div className="mt-6 grid gap-2">
          <LinkButton href="/login" size="lg">
            Sign in to join
          </LinkButton>
          <LinkButton href="/signup" variant="secondary" size="lg">
            Create an account
          </LinkButton>
        </div>
      </div>
    );
  }

  /* Nothing to do */
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Nothing to do here</h1>
      <p className="mt-2 text-[15px] leading-7 text-muted">
        This page handles links from DocMind emails. If you followed one, it may be incomplete. Request a new email from the{' '}
        <Link href="/login" className="font-medium text-fg underline underline-offset-2">
          sign-in page
        </Link>
        .
      </p>
      <LinkButton href="/" variant="secondary" size="lg" className="mt-6 w-full">
        Back to home
      </LinkButton>
    </div>
  );
}

export default function AuthPage() {
  return (
    <AuthShell>
      <Suspense
        fallback={
          <div className="text-center">
            <Spinner className="mx-auto size-6" />
          </div>
        }
      >
        <AuthActionContent />
      </Suspense>
    </AuthShell>
  );
}
