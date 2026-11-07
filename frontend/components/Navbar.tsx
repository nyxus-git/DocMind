'use client';

import React, { useState } from 'react';
import { UsageSummaryDTO } from '../lib/api';
import { UserSession } from './AuthModal';
import { Logo } from './Logo';

interface NavbarProps {
  viewMode: 'landing' | 'app';
  usage?: UsageSummaryDTO | null;
  activeSession: UserSession | null;
  onOpenUpload: () => void;
  onOpenAuth: (mode: 'signin' | 'signup', isCompany?: boolean) => void;
  onSwitchView: (mode: 'landing' | 'app') => void;
  onOpenAdmin?: () => void;
  onSignOut: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  viewMode,
  usage,
  activeSession,
  onOpenUpload,
  onOpenAuth,
  onSwitchView,
  onOpenAdmin,
  onSignOut,
}) => {
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const percentQuestions = usage && usage.questions_limit > 0 ? Math.round((usage.questions_used / usage.questions_limit) * 100) : 0;
  const storageMbUsed = usage ? (usage.storage_bytes / (1024 * 1024)).toFixed(1) : '0';
  const storageMbLimit = usage ? (usage.storage_limit_bytes / (1024 * 1024)).toFixed(0) : '200';

  return (
    <header className="h-16 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-xl px-6 flex items-center justify-between sticky top-0 z-40 transition-all">
      {/* Brand & Workspace Switcher */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => onSwitchView('landing')}
          className="flex items-center gap-2 group text-left cursor-pointer"
        >
          <Logo size="md" showText={true} showBadge={true} badgeText="SaaS 2.0" />
        </button>

        {/* If in app mode: Show active workspace badge & tenant isolation */}
        {viewMode === 'app' && activeSession && (
          <>
            <div className="h-4 w-px bg-slate-800 hidden sm:block" />
            <div className="hidden sm:flex items-center gap-2 text-xs text-slate-300 bg-slate-900/80 border border-slate-800/80 px-3 py-1.5 rounded-full shadow-inner">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-semibold text-white truncate max-w-[200px]">
                {activeSession.workspaceName}
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 font-mono border border-cyan-500/20">
                {activeSession.role}
              </span>
            </div>

            {/* Cloudflare R2 Isolated Tenant Storage Indicator */}
            <div className="hidden xl:flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900/60 border border-slate-800/80 text-[11px] text-slate-400">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
              <span>Cloudflare R2: Tenant Isolated</span>
            </div>
          </>
        )}
      </div>

      {/* Navigation Links (when in Landing page mode) */}
      {viewMode === 'landing' && (
        <nav className="hidden lg:flex items-center gap-7 text-xs font-medium text-slate-300">
          <a href="#what-is-docmind" className="hover:text-cyan-400 transition-colors">
            Overview
          </a>
          <a href="#services" className="hover:text-cyan-400 transition-colors">
            Services Suite
          </a>
          <a href="#security" className="hover:text-cyan-400 transition-colors">
            Cloudflare R2 Security
          </a>
          <a href="#demo" className="hover:text-cyan-400 transition-colors">
            Live Sandbox
          </a>
          <a href="#pricing" className="hover:text-cyan-400 transition-colors">
            Pricing & Quotas
          </a>
          <a href="#faq" className="hover:text-cyan-400 transition-colors">
            FAQ
          </a>
        </nav>
      )}

      {/* Right Actions */}
      <div className="flex items-center gap-3">
        {viewMode === 'landing' ? (
          <>
            <button
              onClick={() => onOpenAuth('signin')}
              className="px-3.5 py-2 text-xs font-semibold text-slate-300 hover:text-white transition-colors"
            >
              Sign In
            </button>

            <button
              onClick={() => onOpenAuth('signup', true)}
              className="hidden sm:flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-700/80 text-xs font-semibold text-cyan-300 transition-all hover:border-cyan-500/50 shadow-sm"
            >
              <span>🏢</span>
              <span>Company Workspace</span>
            </button>

            <button
              onClick={() => onSwitchView('app')}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-400 hover:from-cyan-400 hover:to-teal-300 text-slate-950 font-bold text-xs transition-all shadow-md shadow-cyan-500/25 active:scale-95 flex items-center gap-1.5"
            >
              <span>Launch App</span>
              <span>&rarr;</span>
            </button>
          </>
        ) : (
          /* App Workspace Mode */
          <>
            {usage && (
              <div className="hidden md:flex items-center gap-3 text-xs font-medium text-slate-400">
                {/* Storage Metric */}
                <div className="flex items-center gap-1.5 bg-slate-900/60 border border-slate-800/80 px-2.5 py-1 rounded-lg">
                  <span className="text-slate-500">Storage:</span>
                  <span className="text-slate-200">{storageMbUsed} / {storageMbLimit} MB</span>
                </div>

                {/* Questions Metric */}
                <div className="flex items-center gap-2 bg-slate-900/60 border border-slate-800/80 px-2.5 py-1 rounded-lg">
                  <span className="text-slate-500">Q&A:</span>
                  <span className="text-slate-200">{usage.questions_used} / {usage.questions_limit}</span>
                  <div className="w-12 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-cyan-400 to-teal-400 rounded-full"
                      style={{ width: `${Math.min(100, percentQuestions)}%` }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Quick Admin Console Pill Button */}
            {onOpenAdmin && (
              <button
                onClick={onOpenAdmin}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-amber-500/30 text-xs font-semibold text-amber-300 hover:border-amber-400/60 transition-all shadow-sm"
                title="Open Platform Administration Console"
              >
                <span>⚡</span>
                <span className="hidden sm:inline">Admin Console</span>
              </button>
            )}

            <button
              onClick={onOpenUpload}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-400 hover:from-cyan-400 hover:to-teal-300 text-slate-950 font-bold text-xs transition-all shadow-md shadow-cyan-500/20 active:scale-95"
            >
              <svg className="w-4 h-4 shrink-0" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
              <span>Upload Document</span>
            </button>

            {/* User Profile Menu */}
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-500/20 to-teal-500/20 hover:from-cyan-500/30 hover:to-teal-500/30 border border-cyan-500/30 flex items-center justify-center text-xs font-bold text-cyan-300 transition-colors shadow-sm"
                title="Account Settings & Session"
              >
                {activeSession?.fullName?.charAt(0) || 'U'}
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 mt-2 w-64 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl py-2 z-50 text-xs text-slate-200 animate-in fade-in zoom-in-95 duration-150">
                  <div className="px-4 py-3 border-b border-slate-800">
                    <div className="font-bold text-white truncate text-sm">{activeSession?.fullName || 'User'}</div>
                    <div className="text-[11px] text-slate-400 truncate">{activeSession?.email || 'admin@docmind.ai'}</div>
                    <div className="mt-1.5 text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 inline-block font-mono border border-cyan-500/20">
                      {activeSession?.workspaceName || 'Personal Workspace'}
                    </div>
                  </div>

                  {onOpenAdmin && (
                    <button
                      onClick={() => {
                        setUserMenuOpen(false);
                        onOpenAdmin();
                      }}
                      className="w-full text-left px-4 py-2 hover:bg-slate-800 text-amber-300 hover:text-amber-200 flex items-center gap-2 font-medium"
                    >
                      <span>⚡</span> Platform Admin Console
                    </button>
                  )}

                  <button
                    onClick={() => {
                      setUserMenuOpen(false);
                      onSwitchView('landing');
                    }}
                    className="w-full text-left px-4 py-2 hover:bg-slate-800 text-slate-300 hover:text-white flex items-center gap-2"
                  >
                    <span>🏠</span> Website & Overview
                  </button>

                  <button
                    onClick={() => {
                      setUserMenuOpen(false);
                      onOpenAuth('signup', true);
                    }}
                    className="w-full text-left px-4 py-2 hover:bg-slate-800 text-slate-300 hover:text-white flex items-center gap-2"
                  >
                    <span>🏢</span> New Company Workspace
                  </button>

                  <div className="my-1 border-t border-slate-800" />

                  <button
                    onClick={() => {
                      setUserMenuOpen(false);
                      onSignOut();
                    }}
                    className="w-full text-left px-4 py-2 hover:bg-rose-500/10 text-rose-400 flex items-center gap-2 font-medium"
                  >
                    <span>🚪</span> Sign Out
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </header>
  );
};
