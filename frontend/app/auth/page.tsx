'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ApiClient } from '../../lib/api';
import { Logo } from '../../components/Logo';

function AuthActionContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const action = searchParams.get('action');
  const token = searchParams.get('token');
  const emailParam = searchParams.get('email');
  const workspaceParam = searchParams.get('workspace');

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reset password form state
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Auto-verify email if action=verify and token is present
  useEffect(() => {
    if (action === 'verify' && token) {
      setLoading(true);
      ApiClient.verifyEmail(token)
        .then(() => {
          setSuccess('Your email address has been verified successfully! Your account is now active.');
        })
        .catch(err => {
          setError(err instanceof Error ? err.message : 'Email verification failed or token expired.');
        })
        .finally(() => setLoading(false));
    }
  }, [action, token]);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError('Reset token is missing from the URL.');
      return;
    }
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      await ApiClient.resetPassword(token, newPassword);
      setSuccess('Your password has been changed successfully. You can now log in with your new password.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Password reset failed. Link may have expired or already been used.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background glow accents */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-8 relative z-10">
        {/* Brand Header */}
        <div className="flex flex-col items-center justify-center text-center mb-6">
          <Logo size="lg" showBadge={true} badgeText="Identity" className="justify-center mb-2" />
          <p className="text-xs text-slate-400 mt-1">Ground-truth citation intelligence</p>
        </div>

        {/* Action 1: Email Verification */}
        {action === 'verify' && (
          <div className="space-y-4 text-center">
            {loading && (
              <div className="py-8">
                <div className="w-8 h-8 border-3 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-sm text-slate-300">Verifying your account email...</p>
              </div>
            )}

            {success && (
              <div className="space-y-4">
                <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-2xl flex items-center justify-center mx-auto">
                  ✓
                </div>
                <h2 className="text-base font-semibold text-white">Email Verified!</h2>
                <p className="text-xs text-slate-300 leading-relaxed">{success}</p>
                <button
                  onClick={() => router.push('/')}
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-400 hover:from-cyan-400 hover:to-teal-300 text-slate-950 font-semibold text-xs transition-all shadow-md"
                >
                  Proceed to Sign In &rarr;
                </button>
              </div>
            )}

            {error && (
              <div className="space-y-4">
                <div className="w-12 h-12 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-400 text-2xl flex items-center justify-center mx-auto">
                  ✕
                </div>
                <h2 className="text-base font-semibold text-white">Verification Failed</h2>
                <p className="text-xs text-rose-300 leading-relaxed">{error}</p>
                <button
                  onClick={() => router.push('/')}
                  className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition-all"
                >
                  Return to Home
                </button>
              </div>
            )}
          </div>
        )}

        {/* Action 2: Password Reset */}
        {action === 'reset' && (
          <div>
            <h2 className="text-base font-semibold text-white mb-2 text-center">Set New Password</h2>
            <p className="text-xs text-slate-400 mb-5 text-center">
              Please enter a new secure password for your DocMind account.
            </p>

            {success ? (
              <div className="space-y-4 text-center">
                <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-2xl flex items-center justify-center mx-auto">
                  ✓
                </div>
                <p className="text-xs text-emerald-300 leading-relaxed">{success}</p>
                <button
                  onClick={() => router.push('/')}
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-400 hover:from-cyan-400 hover:to-teal-300 text-slate-950 font-semibold text-xs transition-all shadow-md"
                >
                  Sign In Now &rarr;
                </button>
              </div>
            ) : (
              <form onSubmit={handleResetPassword} className="space-y-4">
                {error && (
                  <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300 flex items-start gap-2">
                    <span>⚠️</span>
                    <span>{error}</span>
                  </div>
                )}

                <div>
                  <label className="text-xs font-medium text-slate-300 block mb-1">
                    New Password (min 8 chars)
                  </label>
                  <input
                    type="password"
                    required
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 focus:border-cyan-500 focus:outline-none text-xs text-slate-200"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-300 block mb-1">
                    Confirm New Password
                  </label>
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 focus:border-cyan-500 focus:outline-none text-xs text-slate-200"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-400 hover:from-cyan-400 hover:to-teal-300 text-slate-950 font-semibold text-xs transition-all shadow-md disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading ? 'Updating Password...' : 'Save New Password &rarr;'}
                </button>
              </form>
            )}
          </div>
        )}

        {/* Action 3: Workspace Invitation */}
        {action === 'invite' && (
          <div className="space-y-4 text-center">
            <div className="w-12 h-12 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-2xl flex items-center justify-center mx-auto">
              ✉️
            </div>
            <h2 className="text-base font-semibold text-white">Workspace Invitation</h2>
            <p className="text-xs text-slate-300 leading-relaxed">
              You have been invited to collaborate on DocMind as{' '}
              <b className="text-cyan-400">{emailParam || 'a team member'}</b>.
            </p>
            {workspaceParam && (
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-400">
                Workspace ID: <code className="text-cyan-300">{workspaceParam}</code>
              </div>
            )}
            <button
              onClick={() => router.push('/')}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-400 hover:from-cyan-400 hover:to-teal-300 text-slate-950 font-semibold text-xs transition-all shadow-md"
            >
              Sign In or Register to Join &rarr;
            </button>
          </div>
        )}

        {/* Default / Fallback */}
        {!['verify', 'reset', 'invite'].includes(action || '') && (
          <div className="text-center space-y-4">
            <p className="text-xs text-slate-400">No active authentication action requested.</p>
            <button
              onClick={() => router.push('/')}
              className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition-all"
            >
              Go to DocMind Dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
          <div className="w-8 h-8 border-3 border-cyan-400 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <AuthActionContent />
    </Suspense>
  );
}

