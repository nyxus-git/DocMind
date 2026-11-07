'use client';

import React, { useState } from 'react';
import { UsageSummaryDTO } from '../lib/api';
import { UserSession } from './AuthModal';

interface NavbarProps {
  viewMode: 'landing' | 'app';
  usage?: UsageSummaryDTO | null;
  activeSession: UserSession | null;
  onOpenUpload: () => void;
  onOpenAuth: (mode: 'signin' | 'signup', isCompany?: boolean) => void;
  onSwitchView: (mode: 'landing' | 'app') => void;
  onSignOut: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  viewMode,
  usage,
  activeSession,
  onOpenUpload,
  onOpenAuth,
  onSwitchView,
  onSignOut,
}) => {
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const percentQuestions = usage ? Math.round((usage.questions_used / usage.questions_limit) * 100) : 0;
  const storageMbUsed = usage ? (usage.storage_bytes / (1024 * 1024)).toFixed(1) : '0';
  const storageMbLimit = usage ? (usage.storage_limit_bytes / (1024 * 1024)).toFixed(0) : '200';

  return (
    <header className="h-16 border-b border-slate-800 bg-slate-950/85 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-40 transition-all">
      {/* Brand */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => onSwitchView('landing')}
          className="flex items-center gap-2 group text-left"
        >
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-500 to-teal-400 flex items-center justify-center font-bold text-slate-950 shadow-md shadow-cyan-500/20 group-hover:scale-105 transition-transform">
            D
          </div>
          <span className="font-extrabold text-lg tracking-tight text-white flex items-center gap-1.5">
            DocMind
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 font-mono border border-cyan-500/20">
              SaaS
            </span>
          </span>
        </button>

        {/* If in app mode: Show workspace badge */}
        {viewMode === 'app' && activeSession && (
          <>
            <div className="h-4 w-px bg-slate-800 hidden sm:block" />
            <div className="hidden sm:flex items-center gap-2 text-xs text-slate-300 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-full shadow-inner">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-medium truncate max-w-[200px]">
                {activeSession.workspaceName}
              </span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 font-mono">
                {activeSession.role}
              </span>
            </div>
          </>
        )}
      </div>

      {/* Navigation Links (when in Landing page mode) */}
      {viewMode === 'landing' && (
        <nav className="hidden lg:flex items-center gap-6 text-xs font-medium text-slate-300">
          <a href="#what-is-docmind" className="hover:text-cyan-400 transition-colors">
            Overview
          </a>
          <a href="#services" className="hover:text-cyan-400 transition-colors">
            Services Suite
          </a>
          <a href="#demo" className="hover:text-cyan-400 transition-colors">
            Live Demo
          </a>
          <a href="#pricing" className="hover:text-cyan-400 transition-colors">
            Pricing & Tiers
          </a>
          <a href="#faq" className="hover:text-cyan-400 transition-colors">
            Security & FAQ
          </a>
        </nav>
      )}

      {/* Right Actions */}
      <div className="flex items-center gap-3">
        {viewMode === 'landing' ? (
          <>
            <button
              onClick={() => onOpenAuth('signin')}
              className="px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white transition-colors"
            >
              Sign In
            </button>

            <button
              onClick={() => onOpenAuth('signup', true)}
              className="hidden sm:flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-xs font-semibold text-cyan-300 transition-all hover:border-cyan-500/50 shadow-sm"
            >
              <span>🏢</span>
              <span>Company Signup</span>
            </button>

            <button
              onClick={() => onSwitchView('app')}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-400 hover:from-cyan-400 hover:to-teal-300 text-slate-950 font-bold text-xs transition-all shadow-md shadow-cyan-500/20 active:scale-95 flex items-center gap-1"
            >
              <span>Launch App</span>
              <span>&rarr;</span>
            </button>
          </>
        ) : (
          /* App Workspace Mode */
          <>
            {usage && (
              <div className="hidden md:flex items-center gap-4 text-xs font-medium text-slate-400">
                {/* Storage Metric */}
                <div className="flex items-center gap-1.5 bg-slate-900/60 border border-slate-800/80 px-2.5 py-1 rounded-md">
                  <span className="text-slate-500">Storage:</span>
                  <span className="text-slate-200">{storageMbUsed} / {storageMbLimit} MB</span>
                </div>

                {/* Questions Metric */}
                <div className="flex items-center gap-2 bg-slate-900/60 border border-slate-800/80 px-2.5 py-1 rounded-md">
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

            <button
              onClick={onOpenUpload}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-teal-400 hover:from-cyan-400 hover:to-teal-300 text-slate-950 font-medium text-xs transition-all shadow-md shadow-cyan-500/10 active:scale-95"
            >
              <svg className="w-4 h-4 shrink-0" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span>Upload Document</span>
            </button>

            {/* User Profile Menu */}
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 border border-slate-700 flex items-center justify-center text-xs font-bold text-cyan-400 transition-colors"
                title="Account Settings & Session"
              >
                {activeSession?.fullName?.charAt(0) || 'U'}
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 mt-2 w-56 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl py-2 z-50 text-xs text-slate-200 animate-in fade-in zoom-in-95 duration-150">
                  <div className="px-4 py-2.5 border-b border-slate-800">
                    <div className="font-bold text-white truncate">{activeSession?.fullName || 'User'}</div>
                    <div className="text-[11px] text-slate-400 truncate">{activeSession?.email || 'admin@docmind.ai'}</div>
                    <div className="mt-1 text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 inline-block font-mono">
                      {activeSession?.workspaceName || 'Personal Workspace'}
                    </div>
                  </div>

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
                    <span>🏢</span> Switch / New Company Account
                  </button>

                  <div className="my-1 border-t border-slate-800" />

                  <button
                    onClick={() => {
                      setUserMenuOpen(false);
                      onSignOut();
                    }}
                    className="w-full text-left px-4 py-2 hover:bg-rose-500/10 text-rose-400 flex items-center gap-2"
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
