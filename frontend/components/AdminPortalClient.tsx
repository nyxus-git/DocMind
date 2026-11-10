'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ApiClient } from '../lib/api';
import { establishSession, friendlyError } from '../lib/auth-flow';
import { clearSession, loadSession, saveSession, UserSession } from '../lib/session';
import { AdminConsole } from './AdminConsole';

export function AdminPortalClient() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [authorizedSession, setAuthorizedSession] = useState<UserSession | null>(null);
  const [currentNonAdminEmail, setCurrentNonAdminEmail] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Server connection helper
  const [showServerConfig, setShowServerConfig] = useState(false);
  const [customApiUrl, setCustomApiUrl] = useState('');
  const [currentApiUrl, setCurrentApiUrl] = useState('');
  const [testFeedback, setTestFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [testingConnection, setTestingConnection] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      await Promise.resolve();
      if (cancelled) return;
      const base = ApiClient.getBaseUrl();
      setCurrentApiUrl(base);
      setCustomApiUrl(base.replace(/\/api\/v1\/?$/, ''));

      const existing = loadSession();
      const token = ApiClient.getToken();
      if (existing && token) {
        try {
          const profile = await ApiClient.getMyProfile();
          if (cancelled) return;
          if (profile.is_superadmin) {
            const updated: UserSession = { ...existing, isSuperAdmin: true };
            saveSession(updated);
            setAuthorizedSession(updated);
          } else {
            setCurrentNonAdminEmail(profile.email);
          }
        } catch {
          // Token expired or unreachable
        }
      }
      if (!cancelled) setChecking(false);
    };
    void init();
    return () => {
      cancelled = true;
    };
  }, []);

  const saveAndTestServerUrl = async () => {
    if (!customApiUrl.trim()) return;
    setTestingConnection(true);
    setTestFeedback(null);
    const res = await ApiClient.testConnection(customApiUrl);
    setTestingConnection(false);
    if (res.ok) {
      ApiClient.setBaseUrl(customApiUrl);
      const nextUrl = ApiClient.getBaseUrl();
      setCurrentApiUrl(nextUrl);
      setTestFeedback({ ok: true, message: `Connected to ${nextUrl}` });
      setError(null);
    } else {
      setTestFeedback({
        ok: false,
        message: res.error || `Cannot reach ${customApiUrl}`,
      });
    }
  };

  const handleAdminSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      // Clear any previous non-admin session first
      await ApiClient.logout().catch(() => {});
      clearSession();

      await ApiClient.login(email.trim(), password);
      const profile = await ApiClient.getMyProfile();

      if (!profile.is_superadmin) {
        await ApiClient.logout().catch(() => {});
        clearSession();
        setLoading(false);
        setError('Access denied: This account does not have Platform Super-Admin privileges.');
        return;
      }

      const session = await establishSession(profile.email, 'Platform Administrator');
      const finalSession: UserSession = { ...session, isSuperAdmin: true };
      saveSession(finalSession);
      setAuthorizedSession(finalSession);
      setCurrentNonAdminEmail(null);
    } catch (err: unknown) {
      setError(friendlyError(err, 'Invalid admin credentials or cannot reach server.'));
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await ApiClient.logout().catch(() => {});
    clearSession();
    setAuthorizedSession(null);
    setPassword('');
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="size-8 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
          <p className="text-xs text-slate-400">Verifying Platform Super-Admin Session...</p>
        </div>
      </div>
    );
  }

  if (authorizedSession) {
    return (
      <AdminConsole
        adminEmail={authorizedSession.email}
        onBackToApp={() => router.push('/app/')}
        onSignOut={handleSignOut}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center px-4 py-12 font-sans">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex size-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-rose-500 items-center justify-center text-xl font-bold text-slate-950 shadow-lg shadow-amber-500/20">
            ⚡
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">DocMind Super-Admin</h1>
          <p className="text-sm text-slate-400">
            Platform Control Center — Manage all registered companies, tiers & accounts
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-2xl space-y-5">
          {currentNonAdminEmail && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-200 leading-relaxed">
              You are currently signed in as customer account <b className="text-white">{currentNonAdminEmail}</b>. Sign in with your Platform Admin credentials below to switch into the Control Center.
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-rose-500/40 bg-rose-500/15 px-4 py-3 text-xs text-rose-200 space-y-2">
              <p className="font-medium">{error}</p>
              {error.includes('Cannot reach') && (
                <button
                  type="button"
                  onClick={() => setShowServerConfig(true)}
                  className="underline font-semibold text-white"
                >
                  Configure API Server URL &rarr;
                </button>
              )}
            </div>
          )}

          <form onSubmit={handleAdminSignIn} className="space-y-4">
            <div>
              <label htmlFor="admin-email" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Admin ID (Email)
              </label>
              <input
                id="admin-email"
                type="email"
                required
                autoComplete="email"
                placeholder="admin@docmind.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label htmlFor="admin-password" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  id="admin-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  placeholder="Enter admin password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2.5 pr-10 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-white"
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-gradient-to-r from-amber-500 to-rose-500 hover:from-amber-400 hover:to-rose-400 text-slate-950 font-bold text-sm py-2.5 transition-all disabled:opacity-50"
            >
              {loading ? 'Authenticating...' : 'Access Admin Console'}
            </button>
          </form>

          {/* Optional API Server Config */}
          <div className="pt-2 border-t border-slate-800/80 text-center">
            <button
              type="button"
              onClick={() => setShowServerConfig(v => !v)}
              className="text-[11px] text-slate-500 hover:text-slate-300"
            >
              {showServerConfig ? 'Hide API configuration' : `API Endpoint: ${currentApiUrl.replace(/\/api\/v1\/?$/, '')}`}
            </button>
            {showServerConfig && (
              <div className="mt-3 text-left space-y-2 rounded-xl bg-slate-950 border border-slate-800 p-3">
                <p className="text-[11px] text-slate-400">Override backend API URL:</p>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={customApiUrl}
                    onChange={e => setCustomApiUrl(e.target.value)}
                    placeholder="https://docmind-api.rohanmane.dev"
                    className="flex-1 rounded-lg bg-slate-900 border border-slate-700 px-2.5 py-1.5 text-xs text-white"
                  />
                  <button
                    type="button"
                    onClick={saveAndTestServerUrl}
                    disabled={testingConnection}
                    className="rounded-lg bg-slate-800 hover:bg-slate-700 px-3 py-1.5 text-xs font-semibold text-white"
                  >
                    {testingConnection ? '...' : 'Save'}
                  </button>
                </div>
                {testFeedback && (
                  <p className={`text-[11px] ${testFeedback.ok ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {testFeedback.message}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-slate-500 px-1">
          <Link href="/" className="hover:text-slate-300">&larr; Back to DocMind website</Link>
          <Link href="/login/" className="hover:text-slate-300">Customer Sign in &rarr;</Link>
        </div>
      </div>
    </div>
  );
}
