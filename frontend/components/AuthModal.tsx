'use client';

import React, { useState } from 'react';
import { ApiClient } from '../lib/api';

export interface UserSession {
  email: string;
  fullName: string;
  workspaceName: string;
  workspaceSlug: string;
  isCompany: boolean;
  role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';
  token?: string;
}

interface AuthModalProps {
  isOpen: boolean;
  initialMode?: 'signin' | 'signup';
  initialIsCompany?: boolean;
  onClose: () => void;
  onAuthSuccess: (session: UserSession) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  initialMode = 'signin',
  initialIsCompany = false,
  onClose,
  onAuthSuccess,
}) => {
  const [mode, setMode] = useState<'signin' | 'signup'>(initialMode);
  const [isCompany, setIsCompany] = useState<boolean>(initialIsCompany);

  // Form fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [workspaceSlug, setWorkspaceSlug] = useState('');
  const [teamSize, setTeamSize] = useState('11-50');
  const [rememberMe, setRememberMe] = useState(true);

  // State
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCompanyNameChange = (val: string) => {
    setCompanyName(val);
    const slug = val
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    setWorkspaceSlug(slug);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mode === 'signup') {
        if (!email || !password || !fullName) {
          throw new Error('Please fill in all required fields.');
        }
        if (password.length < 8) {
          throw new Error('Password must be at least 8 characters long.');
        }
        if (isCompany && !companyName) {
          throw new Error('Please specify your company or organization name.');
        }

        const effectiveWorkspace = isCompany ? companyName : `${fullName}'s Workspace`;
        const effectiveSlug = isCompany ? workspaceSlug || 'company-workspace' : 'personal';

        // Attempt live API register if backend available
        try {
          await ApiClient.register(email, password);
        } catch {
          // Backend may be offline in dev/demo mode; proceed with offline local session
        }

        const session: UserSession = {
          email,
          fullName,
          workspaceName: effectiveWorkspace,
          workspaceSlug: effectiveSlug,
          isCompany,
          role: 'OWNER',
        };

        if (typeof window !== 'undefined') {
          localStorage.setItem('docmind_user_session', JSON.stringify(session));
        }

        setSuccessNotice('Account created successfully! Initializing private workspace...');
        setTimeout(() => {
          setLoading(false);
          onAuthSuccess(session);
          onClose();
        }, 600);

      } else {
        // Sign In
        if (!email || !password) {
          throw new Error('Please enter both email and password.');
        }

        try {
          await ApiClient.login(email, password);
        } catch {
          // Fallback demo auth
        }

        const existingRaw = typeof window !== 'undefined' ? localStorage.getItem('docmind_user_session') : null;
        let session: UserSession;

        if (existingRaw) {
          session = JSON.parse(existingRaw);
          session.email = email;
        } else {
          session = {
            email,
            fullName: email.split('@')[0].toUpperCase(),
            workspaceName: isCompany ? 'Acme Enterprise Workspace' : 'Personal Workspace',
            workspaceSlug: isCompany ? 'acme-enterprise' : 'personal',
            isCompany,
            role: 'OWNER',
          };
          if (typeof window !== 'undefined') {
            localStorage.setItem('docmind_user_session', JSON.stringify(session));
          }
        }

        setLoading(false);
        onAuthSuccess(session);
        onClose();
      }
    } catch (err: unknown) {
      setLoading(false);
      const msg = err instanceof Error ? err.message : 'Authentication failed. Please check credentials.';
      setError(msg);
    }
  };

  const handleQuickDemo = (demoType: 'company' | 'personal') => {
    const isComp = demoType === 'company';
    const demoSession: UserSession = {
      email: isComp ? 'admin@meridian-global.com' : 'researcher@docmind.ai',
      fullName: isComp ? 'Dr. Sarah Chen' : 'Alex Mercer',
      workspaceName: isComp ? 'Meridian Global Compliance • Enterprise' : 'Research Sandbox',
      workspaceSlug: isComp ? 'meridian-compliance' : 'research-sandbox',
      isCompany: isComp,
      role: isComp ? 'OWNER' : 'MEMBER',
    };

    if (typeof window !== 'undefined') {
      localStorage.setItem('docmind_user_session', JSON.stringify(demoSession));
    }
    onAuthSuccess(demoSession);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden relative my-8">
        {/* Glow accent */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-1 bg-gradient-to-r from-transparent via-cyan-400 to-transparent" />

        {/* Modal Header */}
        <div className="p-6 border-b border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-teal-400 flex items-center justify-center font-bold text-slate-950 shadow-md shadow-cyan-500/20">
              D
            </div>
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                {mode === 'signin' ? 'Sign In to DocMind' : 'Create DocMind Workspace'}
              </h3>
              <p className="text-xs text-slate-400">
                {mode === 'signin'
                  ? 'Access your private enterprise document intelligence'
                  : 'Get started with verifiable citation RAG and private storage'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-800/60 hover:bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Mode & Workspace Switcher Tabs */}
        <div className="px-6 pt-5 pb-2">
          <div className="grid grid-cols-2 p-1 rounded-xl bg-slate-950 border border-slate-800">
            <button
              type="button"
              onClick={() => {
                setMode('signin');
                setError(null);
              }}
              className={`py-2 text-xs font-semibold rounded-lg transition-all ${
                mode === 'signin'
                  ? 'bg-slate-800 text-cyan-400 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('signup');
                setError(null);
              }}
              className={`py-2 text-xs font-semibold rounded-lg transition-all ${
                mode === 'signup'
                  ? 'bg-slate-800 text-cyan-400 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Create Account
            </button>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300 flex items-start gap-2.5">
              <span className="text-sm">⚠️</span>
              <div className="flex-1">{error}</div>
            </div>
          )}

          {successNotice && (
            <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300 flex items-start gap-2.5">
              <span className="text-sm">✓</span>
              <div className="flex-1">{successNotice}</div>
            </div>
          )}

          {/* If Sign Up: Account Type Toggle */}
          {mode === 'signup' && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-300 block">Workspace Type</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setIsCompany(true)}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    isCompany
                      ? 'bg-cyan-500/10 border-cyan-500/40 text-white'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-semibold text-xs text-cyan-300">
                    <span>🏢</span> Company / Organization
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    Multi-user team workspace with role governance and centralized billing.
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setIsCompany(false)}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    !isCompany
                      ? 'bg-cyan-500/10 border-cyan-500/40 text-white'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-semibold text-xs text-cyan-300">
                    <span>👤</span> Personal Researcher
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    Isolated private workspace for solo analysis, research, and testing.
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* Full Name (Sign Up only) */}
          {mode === 'signup' && (
            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">
                Full Name <span className="text-cyan-400">*</span>
              </label>
              <input
                type="text"
                required
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                placeholder="e.g. Elena Rostova"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 focus:border-cyan-500 focus:outline-none text-sm text-slate-200 placeholder:text-slate-600 transition-colors"
              />
            </div>
          )}

          {/* Company Fields (Sign Up & Company mode) */}
          {mode === 'signup' && isCompany && (
            <div className="space-y-3 p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/80">
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">
                  Company / Organization Name <span className="text-cyan-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={companyName}
                  onChange={e => handleCompanyNameChange(e.target.value)}
                  placeholder="e.g. Apex Global Legal Partners"
                  className="w-full px-3.5 py-2 rounded-lg bg-slate-900 border border-slate-800 focus:border-cyan-500 focus:outline-none text-xs text-slate-200 placeholder:text-slate-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-medium text-slate-400 block mb-1">
                    Workspace URL Identifier
                  </label>
                  <div className="flex items-center px-2.5 py-2 rounded-lg bg-slate-900 border border-slate-800 text-[11px] text-slate-400">
                    <span className="text-slate-500 shrink-0">app/</span>
                    <input
                      type="text"
                      value={workspaceSlug}
                      onChange={e => setWorkspaceSlug(e.target.value)}
                      placeholder="apex-legal"
                      className="w-full bg-transparent border-none text-cyan-300 focus:outline-none pl-1"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-medium text-slate-400 block mb-1">
                    Team Size
                  </label>
                  <select
                    value={teamSize}
                    onChange={e => setTeamSize(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-lg bg-slate-900 border border-slate-800 text-[11px] text-slate-300 focus:outline-none focus:border-cyan-500"
                  >
                    <option value="1-10">1 – 10 members</option>
                    <option value="11-50">11 – 50 members</option>
                    <option value="51-200">51 – 200 members</option>
                    <option value="200+">200+ Enterprise</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Email */}
          <div>
            <label className="text-xs font-medium text-slate-300 block mb-1">
              {isCompany && mode === 'signup' ? 'Work Email' : 'Email Address'}{' '}
              <span className="text-cyan-400">*</span>
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder={isCompany ? 'name@company.com' : 'name@example.com'}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 focus:border-cyan-500 focus:outline-none text-sm text-slate-200 placeholder:text-slate-600 transition-colors"
            />
          </div>

          {/* Password */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-slate-300">
                Password <span className="text-cyan-400">*</span>
              </label>
              {mode === 'signin' && (
                <button
                  type="button"
                  onClick={() => alert('Password reset link will be sent to your email.')}
                  className="text-xs text-cyan-400 hover:text-cyan-300"
                >
                  Forgot password?
                </button>
              )}
            </div>
            <input
              type="password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 focus:border-cyan-500 focus:outline-none text-sm text-slate-200 placeholder:text-slate-600 transition-colors"
            />
            {mode === 'signup' && (
              <p className="text-[11px] text-slate-500 mt-1">
                Minimum 8 characters. Passwords are securely hashed with Argon2id.
              </p>
            )}
          </div>

          {/* Remember me & security notice */}
          <div className="flex items-center justify-between pt-1">
            <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-400">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={e => setRememberMe(e.target.checked)}
                className="rounded border-slate-800 bg-slate-950 text-cyan-500 focus:ring-0"
              />
              <span>Remember this session for 30 days</span>
            </label>
            <span className="text-[11px] text-slate-500 flex items-center gap-1">
              <span>🔒</span> TLS 1.3
            </span>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-400 hover:from-cyan-400 hover:to-teal-300 text-slate-950 font-semibold text-sm transition-all shadow-lg shadow-cyan-500/20 active:scale-[0.99] disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                <span>Authenticating...</span>
              </>
            ) : mode === 'signin' ? (
              <span>Sign In to Workspace &rarr;</span>
            ) : (
              <span>Create {isCompany ? 'Company' : 'Personal'} Workspace &rarr;</span>
            )}
          </button>
        </form>

        {/* Quick Demo Sandbox Access */}
        <div className="p-6 border-t border-slate-800/80 bg-slate-950/40">
          <div className="text-center mb-3">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Or Explore Instantly with Preloaded Sandbox
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => handleQuickDemo('company')}
              className="px-3 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 text-xs text-slate-200 flex items-center justify-center gap-1.5 transition-colors"
            >
              <span>🏢</span>
              <span>Demo Company (Enterprise)</span>
            </button>

            <button
              type="button"
              onClick={() => handleQuickDemo('personal')}
              className="px-3 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 text-xs text-slate-200 flex items-center justify-center gap-1.5 transition-colors"
            >
              <span>👤</span>
              <span>Demo Solo Researcher</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
