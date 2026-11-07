'use client';

import React, { useState } from 'react';
import { Logo } from './Logo';

interface LandingPageProps {
  onOpenAuth: (mode: 'signin' | 'signup', isCompany?: boolean) => void;
  onLaunchApp: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onOpenAuth, onLaunchApp }) => {
  const [isAnnual, setIsAnnual] = useState(true);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  // Sovereign / BYOS Custom Modal State
  const [sovereignModalOpen, setSovereignModalOpen] = useState(false);
  const [sovereignEmail, setSovereignEmail] = useState('');
  const [sovereignCompany, setSovereignCompany] = useState('');
  const [sovereignStorage, setSovereignStorage] = useState('AWS S3 (Private Bucket)');
  const [sovereignCompliance, setSovereignCompliance] = useState('SOC-2 & ISO 27001');
  const [sovereignSubmitted, setSovereignSubmitted] = useState(false);

  const faqs = [
    {
      q: 'How does DocMind guarantee that documents are NEVER visible to other companies?',
      a: 'DocMind implements complete architectural zero-trust multi-tenancy. Every company receives an isolated workspace ID. Uploaded documents are encrypted at rest with AES-256 and saved to isolated tenant storage partitions. Database queries strictly enforce parameter-bound tenant scoping derived from cryptographic JWT tokens. It is architecturally impossible for one organization to access, view, or search another company\'s files.',
    },
    {
      q: 'How does DocMind guarantee zero AI hallucinations?',
      a: 'Unlike generic chatbots that guess when facts are missing, DocMind employs strict evidence bounding. Retrieval uses a hybrid engine merging dense vector similarity (pgvector) and sparse lexical search (PostgreSQL FTS) via Reciprocal Rank Fusion. If evidence in the source documents is insufficient, the system explicitly declares so instead of inventing answers.',
    },
    {
      q: 'Does DocMind or Google Gemini train on our uploaded documents?',
      a: 'Never. DocMind has an absolute zero-training policy. Customer documents, tables, and vector embeddings are stored strictly within private workspace partitions. Data is never shared, exported, or used to fine-tune any foundation model.',
    },
    {
      q: 'Can DocMind handle scanned PDF documents, invoices, or complex tables?',
      a: 'Yes! DocMind includes an automated OCR fallback engine powered by Tesseract. When scanned pages or images without a selectable text layer are detected, it runs OCR extraction. Furthermore, multi-column tables are reconstructed into structured Markdown pipe tables so financial metrics and contract terms are preserved with relational precision.',
    },
    {
      q: 'Can we store all documents on our own private servers / AWS S3 rather than DocMind\'s cloud?',
      a: 'Yes! Under our Enterprise Sovereign (BYOS) plan, documents never leave your corporate infrastructure. You can connect your private AWS S3, Cloudflare R2, MinIO, or internal on-premise storage. DocMind operates strictly as an intelligence layer or can be deployed entirely inside your private VPC as an air-gapped Docker container.',
    },
    {
      q: 'How does the Cross-Document Comparative Matrix work?',
      a: 'You can select between 2 and 5 documents simultaneously (such as 3 vendor proposals, annual audits, or MSAs). The engine retrieves parallel context across all files and prompts Gemini 2.5 Flash to generate a side-by-side comparison matrix with key clauses, differences, and risk flags.',
    },
  ];

  return (
    <div className="min-h-screen bg-[#030712] text-slate-100 selection:bg-cyan-500/30 selection:text-cyan-200 font-sans">
      {/* Background Animated Gradient Mesh */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[1200px] h-[600px] bg-gradient-to-b from-cyan-500/15 via-teal-500/10 to-transparent blur-3xl opacity-70" />
        <div className="absolute top-[35%] -left-60 w-[700px] h-[700px] bg-indigo-600/10 blur-3xl rounded-full" />
        <div className="absolute top-[65%] -right-60 w-[700px] h-[700px] bg-teal-500/10 blur-3xl rounded-full" />
      </div>

      <div className="relative z-10">
        {/* HERO SECTION */}
        <section className="pt-24 pb-20 px-6 max-w-7xl mx-auto text-center">
          {/* Animated Announcement Pill */}
          <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-slate-900/90 border border-cyan-500/30 text-xs font-semibold text-cyan-300 shadow-xl shadow-cyan-500/10 mb-8 backdrop-blur-xl hover:border-cyan-400/60 transition-all cursor-pointer">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
            <span className="uppercase text-[10px] tracking-wider px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-mono">
              Enterprise Document Intelligence
            </span>
            <span>Verifiable Citations • Zero Hallucinations • Enterprise Privacy</span>
            <span className="text-cyan-400">&rarr;</span>
          </div>

          {/* Headline */}
          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-white max-w-5xl mx-auto leading-[1.1] mb-6">
            Ground-Truth Document Intelligence with{' '}
            <span className="bg-gradient-to-r from-cyan-400 via-teal-300 to-indigo-300 bg-clip-text text-transparent">
              Zero Hallucinations
            </span>
          </h1>

          {/* Subtitle */}
          <p className="text-base sm:text-lg text-slate-300 max-w-3xl mx-auto leading-relaxed mb-10">
            Search, synthesize, and analyze complex contracts, financial filings, and technical documentation with complete confidence. Every answer is backed by <b className="text-cyan-300">verifiable inline page citations [S1]</b> with zero hallucinations and complete enterprise data privacy.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
            <button
              onClick={() => onOpenAuth('signup', true)}
              className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-gradient-to-r from-cyan-500 to-teal-400 hover:from-cyan-400 hover:to-teal-300 text-slate-950 font-bold text-sm transition-all shadow-xl shadow-cyan-500/25 active:scale-95 flex items-center justify-center gap-2.5 cursor-pointer"
            >
              <span>🏢 Create Company Workspace</span>
              <span>&rarr;</span>
            </button>

            <button
              onClick={onLaunchApp}
              className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-slate-900/90 hover:bg-slate-800 border border-cyan-500/30 hover:border-cyan-400 text-white font-semibold text-sm transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2 cursor-pointer group"
              title="Instant interactive evaluation workspace"
            >
              <span className="text-cyan-400 group-hover:scale-110 transition-transform">⚡</span>
              <span>Experience Interactive Demo</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 font-mono border border-cyan-500/30">Live Workspace</span>
            </button>
          </div>

          {/* Trust Badges */}
          <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-10 text-xs text-slate-400 font-medium">
            <div className="flex items-center gap-2">
              <span className="text-emerald-400 text-base">🛡️</span>
              <span>Zero Model Training Policy</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-cyan-400 text-base">🔒</span>
              <span>AES-256 &amp; TLS 1.3 Encryption</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-teal-400 text-base">🏢</span>
              <span>Multi-Tenant Tenant Isolation</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-indigo-400 text-base">⚡</span>
              <span>Verifiable Ground-Truth Citations</span>
            </div>
          </div>
        </section>

        {/* MODERN PRODUCT WORKSPACE PREVIEW */}
        <section id="demo" className="py-16 px-6 max-w-6xl mx-auto">
          <div className="text-center mb-10">
            <span className="text-xs font-bold text-cyan-400 uppercase tracking-wider px-3.5 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/20 shadow-sm shadow-cyan-500/10">
              Interactive Enterprise Experience
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mt-3">
              Audit-Grade Document Intelligence at Enterprise Scale
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 mt-2 max-w-2xl mx-auto">
              Search, synthesize, and cross-compare complex corporate files with verifiable inline source citations that prove every claim.
            </p>
          </div>

          {/* Product UI Window Mockup */}
          <div className="rounded-3xl bg-slate-900/90 border border-slate-800 shadow-2xl backdrop-blur-2xl overflow-hidden">
            {/* macOS Window Chrome Header */}
            <div className="px-5 py-3.5 bg-slate-950/90 border-b border-slate-800 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-rose-500/80"></div>
                <div className="w-3 h-3 rounded-full bg-amber-500/80"></div>
                <div className="w-3 h-3 rounded-full bg-emerald-500/80"></div>
                <span className="ml-3 font-mono text-[11px] text-slate-400">DocMind Workspace • Acme Global Systems</span>
              </div>
              <div className="hidden sm:flex items-center gap-2 text-[11px]">
                <span className="px-2.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-medium">
                  AES-256 Encrypted
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                  Tenant-Isolated
                </span>
              </div>
            </div>

            {/* Split Screen Workspace Preview */}
            <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[460px]">
              {/* Mock Sidebar */}
              <div className="lg:col-span-4 p-4 border-b lg:border-b-0 lg:border-r border-slate-800 bg-slate-950/50 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 mb-4">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-white truncate">Acme Systems Corp</div>
                      <div className="text-[10px] text-slate-400">Enterprise Tenant #WS-042</div>
                    </div>
                  </div>

                  <div className="space-y-1 text-xs">
                    <div className="px-3 py-2 rounded-lg text-slate-400 flex items-center gap-2.5 hover:bg-slate-900/60 transition-colors">
                      <span>📊</span> Dashboard
                    </div>
                    <div className="px-3 py-2 rounded-lg text-slate-400 flex items-center justify-between hover:bg-slate-900/60 transition-colors">
                      <span className="flex items-center gap-2.5"><span>📁</span> Document Library</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">14</span>
                    </div>
                    <div className="px-3 py-2 rounded-lg bg-cyan-500/15 text-cyan-300 font-semibold border border-cyan-500/30 flex items-center justify-between shadow-sm">
                      <span className="flex items-center gap-2.5"><span>💬</span> Research Chat</span>
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
                    </div>
                    <div className="px-3 py-2 rounded-lg text-slate-400 flex items-center gap-2.5 hover:bg-slate-900/60 transition-colors">
                      <span>⚖️</span> Compare Files
                    </div>
                    <div className="px-3 py-2 rounded-lg text-slate-400 flex items-center gap-2.5 hover:bg-slate-900/60 transition-colors">
                      <span>🛡️</span> Admin Console
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 mt-4 text-[11px] text-slate-400">
                  <div className="flex items-center justify-between font-semibold text-slate-300 mb-1">
                    <span>Quota & Storage</span>
                    <span className="text-cyan-400 font-mono">42 MB / 10 GB</span>
                  </div>
                  <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                    <div className="bg-cyan-400 h-full w-[4%]"></div>
                  </div>
                </div>
              </div>

              {/* Mock Chat & Grounded Citation Pane */}
              <div className="lg:col-span-8 p-5 sm:p-6 flex flex-col justify-between bg-slate-950/30">
                <div className="space-y-4">
                  {/* Scope Badges */}
                  <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-slate-800/60 text-xs">
                    <span className="text-slate-500 shrink-0 font-medium">Selected Scope:</span>
                    <span className="px-2.5 py-1 rounded-lg bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 font-mono text-[11px] flex items-center gap-1.5 whitespace-nowrap">
                      <span>📕</span> Vendor_Master_Services_Agreement_2026.pdf
                    </span>
                    <span className="px-2.5 py-1 rounded-lg bg-slate-900 text-slate-300 border border-slate-800 font-mono text-[11px] flex items-center gap-1.5 whitespace-nowrap">
                      <span>📘</span> Global_Enterprise_SLA.docx
                    </span>
                  </div>

                  {/* Mock User Message */}
                  <div className="flex justify-end">
                    <div className="bg-cyan-500/15 text-cyan-100 border border-cyan-500/30 rounded-2xl rounded-tr-sm px-4 py-3 max-w-lg text-xs sm:text-sm leading-relaxed shadow-sm">
                      Compare indemnification liabilities and termination notice covenants between these contracts.
                    </div>
                  </div>

                  {/* Mock Assistant Response with Citations */}
                  <div className="flex gap-3">
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center text-slate-950 font-bold text-xs shrink-0 shadow-md shadow-cyan-500/20">
                      D
                    </div>
                    <div className="space-y-3 flex-1">
                      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl rounded-tl-sm p-4 text-xs sm:text-sm text-slate-200 leading-relaxed space-y-2">
                        <p>
                          Under Section 16.2 of the Master Services Agreement, supplier indemnification for third-party intellectual property claims remains uncapped{' '}
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded font-mono font-bold text-xs bg-cyan-400 text-slate-950 shadow-sm cursor-default">
                            [S1]
                          </span>.
                        </p>
                        <p>
                          In contrast, general commercial liability is bounded to the preceding 12 months of paid fees ($500,000 maximum){' '}
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded font-mono font-bold text-xs bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 cursor-default">
                            [S2]
                          </span>.
                          Termination for convenience requires a 60-day written cure window across both documents{' '}
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded font-mono font-bold text-xs bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 cursor-default">
                            [S3]
                          </span>.
                        </p>
                      </div>

                      {/* Verified Citation Drawer */}
                      <div className="p-3.5 rounded-xl bg-cyan-950/30 border border-cyan-500/30 text-xs">
                        <div className="flex items-center justify-between font-semibold text-cyan-300 mb-1.5">
                          <span className="flex items-center gap-2">
                            <span className="px-1.5 py-0.5 rounded bg-cyan-400 text-slate-950 text-[10px] font-bold">S1</span>
                            <span>Vendor_Master_Services_Agreement_2026.pdf • Page 16</span>
                          </span>
                          <span className="text-[10px] text-cyan-400/80 font-mono">100% Match</span>
                        </div>
                        <p className="text-[11px] text-slate-300 font-mono bg-slate-950/70 p-2.5 rounded-lg border border-slate-800/80">
                          &ldquo;Supplier shall defend, indemnify and hold harmless Customer against all third-party IP infringement damages without monetary limitation.&rdquo;
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Card Bottom CTA */}
                <div className="pt-5 mt-5 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="text-xs text-slate-400 text-center sm:text-left">
                    <span className="text-white font-medium">Ready to explore with your documents?</span> Experience our interactive demo or request an enterprise architecture session.
                  </div>
                  <div className="flex items-center gap-2.5">
                    <button
                      onClick={onLaunchApp}
                      className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-400 text-slate-950 font-bold text-xs hover:opacity-95 transition-all shadow-md shadow-cyan-500/20 cursor-pointer"
                    >
                      Experience Live Demo →
                    </button>
                    <button
                      onClick={() => setSovereignModalOpen(true)}
                      className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 font-medium text-xs border border-slate-800 transition-colors cursor-pointer"
                    >
                      Talk to Sales
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SECURITY & GOVERNANCE SHOWCASE */}
        <section id="security" className="py-20 px-6 max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <span className="text-xs font-bold text-cyan-400 uppercase tracking-wider px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20">
              Enterprise Trust &amp; Security
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight mt-4">
              Your Company Documents Are Never Exposed to Anyone Else
            </h2>
            <p className="text-sm sm:text-base text-slate-400 max-w-2xl mx-auto mt-2">
              DocMind guarantees multi-tenant quarantine, zero model training, and cryptographic access control at every layer.
            </p>
          </div>

          {/* 3 Pillars Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-cyan-500/40 transition-all space-y-4">
              <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 flex items-center justify-center text-2xl">
                ☁️
              </div>
              <h3 className="text-base font-bold text-white">Physical Storage Quarantine</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Files are partitioned into dedicated, cryptographically isolated workspace object paths. Short-lived signed URLs expire in 120 seconds with strict workspace token verification.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-cyan-500/40 transition-all space-y-4">
              <div className="w-12 h-12 rounded-xl bg-teal-500/10 border border-teal-500/30 text-teal-400 flex items-center justify-center text-2xl">
                🛡️
              </div>
              <h3 className="text-base font-bold text-white">Row-Level Access Governance</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Every database query and vector similarity search strictly enforces authenticated tenant constraints derived from verified JWT tokens. Cross-tenant queries are blocked at the kernel layer.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-cyan-500/40 transition-all space-y-4">
              <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 flex items-center justify-center text-2xl">
                🔐
              </div>
              <h3 className="text-base font-bold text-white">Zero Model Training Guarantee</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Your enterprise contracts, intellectual property, and research are never retained, logged, or used to fine-tune foundation models. Your data remains strictly your own.
              </p>
            </div>
          </div>
        </section>

        {/* SERVICES SUITE SECTION */}
        <section id="services" className="py-20 px-6 max-w-7xl mx-auto border-t border-slate-800/80">
          <div className="text-center mb-16">
            <span className="text-xs font-bold text-cyan-400 uppercase tracking-wider px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20">
              Enterprise Suite
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight mt-4">
              Core Capabilities for Enterprise Document Teams
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: '🔍',
                title: 'Hybrid Vector + Lexical Search',
                desc: 'Reciprocal Rank Fusion (k=60) merges 768-dim dense semantic vector search with PostgreSQL tsvector full-text search.',
              },
              {
                icon: '📑',
                title: 'Cross-Document Comparative Matrix',
                desc: 'Select 2 to 5 agreements or reports to automatically generate structured side-by-side attribute difference matrices with citation grounding.',
              },
              {
                icon: '📷',
                title: 'Automated OCR & Table Parsing',
                desc: 'PyMuPDF and Tesseract OCR automatically extract scanned paper PDFs while restoring multi-column tables into Markdown relational pipes.',
              },
              {
                icon: '👥',
                title: 'Company Workspaces & RBAC',
                desc: 'Manage organizations with Owner, Admin, Member, and Viewer roles. Send branded email invites via production Gmail SMTP.',
              },
              {
                icon: '📊',
                title: 'Dynamic Quota & Usage Metering',
                desc: 'Enforce real-time limits on documents, storage MB, monthly questions, and concurrent uploads with automated billing cycle resets.',
              },
              {
                icon: '⚡',
                title: 'Global Platform Admin Console',
                desc: 'Dedicated administration portal to monitor total workspaces, storage utilization, ingestion queues, and global security audit trails.',
              },
            ].map((svc, idx) => (
              <div
                key={idx}
                className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-cyan-500/40 hover:bg-slate-900/90 transition-all space-y-3"
              >
                <div className="text-3xl mb-2">{svc.icon}</div>
                <h3 className="text-base font-bold text-white">{svc.title}</h3>
                <p className="text-xs text-slate-400 leading-relaxed">{svc.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* PRICING & TIERS SECTION */}
        <section id="pricing" className="py-20 px-6 max-w-7xl mx-auto border-t border-slate-800/80">
          <div className="text-center mb-12">
            <span className="text-xs font-bold text-cyan-400 uppercase tracking-wider px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20">
              Transparent Pricing
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight mt-4">
              Flexible Plans for Growing Organizations and Enterprises
            </h2>
            <p className="text-sm text-slate-400 mt-2">Zero hidden charges. Scale seamlessly as your document intelligence needs grow.</p>

            {/* Monthly / Annual Switcher */}
            <div className="mt-8 inline-flex items-center gap-3 p-1.5 rounded-2xl bg-slate-900 border border-slate-800">
              <button
                onClick={() => setIsAnnual(false)}
                className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                  !isAnnual ? 'bg-cyan-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                Monthly Billing
              </button>
              <button
                onClick={() => setIsAnnual(true)}
                className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
                  isAnnual ? 'bg-cyan-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                <span>Annual Billing</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500 text-slate-950 font-bold">Save 20%</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Tier 1: Starter */}
            <div className="p-8 rounded-3xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Solo Researcher</div>
                <h3 className="text-2xl font-bold text-white">Starter Personal</h3>
                <div className="text-3xl font-extrabold text-white mt-2">$0 <span className="text-xs text-slate-500 font-normal">/ forever free</span></div>
                <p className="text-xs text-slate-400">Ideal for individual researchers, testing, and compliance pilots.</p>
                <div className="border-t border-slate-800 pt-4 space-y-2.5 text-xs text-slate-300">
                  <div className="flex items-center gap-2">✓ 20 Documents Max</div>
                  <div className="flex items-center gap-2">✓ 200 MB Encrypted Cloud Storage</div>
                  <div className="flex items-center gap-2">✓ 100 Questions / month</div>
                  <div className="flex items-center gap-2">✓ Strict [S1] Citation Grounding</div>
                  <div className="flex items-center gap-2">✓ 1 User Seat</div>
                </div>
              </div>
              <button
                onClick={() => onOpenAuth('signup', false)}
                className="w-full mt-8 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition-all"
              >
                Start Free Solo &rarr;
              </button>
            </div>

            {/* Tier 2: Pro Company */}
            <div className="p-8 rounded-3xl bg-slate-900 border-2 border-cyan-500 shadow-2xl shadow-cyan-500/10 flex flex-col justify-between relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-gradient-to-r from-cyan-500 to-teal-400 text-slate-950 font-bold text-[10px] uppercase tracking-wider shadow-md">
                Most Popular for Teams
              </div>
              <div className="space-y-4">
                <div className="text-xs font-bold text-cyan-400 uppercase tracking-wider">Multi-User Organization</div>
                <h3 className="text-2xl font-bold text-white">Pro Company</h3>
                <div className="text-3xl font-extrabold text-white mt-2">
                  ${isAnnual ? '64' : '79'}{' '}
                  <span className="text-xs text-slate-500 font-normal">/ month</span>
                </div>
                <p className="text-xs text-slate-400">Comprehensive legal and compliance document workspace.</p>
                <div className="border-t border-slate-800 pt-4 space-y-2.5 text-xs text-slate-200">
                  <div className="flex items-center gap-2 text-cyan-300">✓ 500 Documents Max</div>
                  <div className="flex items-center gap-2 text-cyan-300">✓ 10 GB Encrypted Cloud Storage</div>
                  <div className="flex items-center gap-2 text-cyan-300">✓ 2,500 Questions / month</div>
                  <div className="flex items-center gap-2">✓ Cross-Doc Comparative Matrix (2-5 docs)</div>
                  <div className="flex items-center gap-2">✓ Automated OCR Fallback for Scans</div>
                  <div className="flex items-center gap-2">✓ 25 Team Member Seats (RBAC)</div>
                </div>
              </div>
              <button
                onClick={() => onOpenAuth('signup', true)}
                className="w-full mt-8 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-400 hover:from-cyan-400 hover:to-teal-300 text-slate-950 font-bold text-xs transition-all shadow-md shadow-cyan-500/20 active:scale-95"
              >
                Create Pro Company &rarr;
              </button>
            </div>

            {/* Tier 3: Enterprise */}
            <div className="p-8 rounded-3xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="text-xs font-bold text-amber-400 uppercase tracking-wider">Mission-Critical Enterprise</div>
                <h3 className="text-2xl font-bold text-white">Enterprise Fleet</h3>
                <div className="text-3xl font-extrabold text-white mt-2">
                  ${isAnnual ? '239' : '299'}{' '}
                  <span className="text-xs text-slate-500 font-normal">/ month</span>
                </div>
                <p className="text-xs text-slate-400">Dedicated OCR fleet, audit logs, and custom compliance SLA.</p>
                <div className="border-t border-slate-800 pt-4 space-y-2.5 text-xs text-slate-300">
                  <div className="flex items-center gap-2 text-amber-300">✓ 5,000 Documents Max</div>
                  <div className="flex items-center gap-2 text-amber-300">✓ 100 GB Dedicated Encrypted Storage</div>
                  <div className="flex items-center gap-2 text-amber-300">✓ 25,000 Questions / month</div>
                  <div className="flex items-center gap-2">✓ 500 Team Member Seats</div>
                  <div className="flex items-center gap-2">✓ Full Audit Event Log Stream</div>
                  <div className="flex items-center gap-2">✓ Dedicated Priority Worker Fleets</div>
                </div>
              </div>
              <button
                onClick={() => onOpenAuth('signup', true)}
                className="w-full mt-8 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition-all"
              >
                Contact Enterprise Sales &rarr;
              </button>
            </div>
          </div>

          {/* SOVEREIGN / BYOS ENTERPRISE SOLUTION CARD */}
          <div className="mt-10 rounded-3xl bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950/40 border-2 border-indigo-500/40 p-8 sm:p-10 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="relative z-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8">
              <div className="space-y-3 max-w-2xl">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 font-mono text-[11px] font-bold uppercase tracking-wider">
                  <span>🛡️</span>
                  <span>Enterprise Sovereign &bull; Zero Data Retention (ZDR)</span>
                </div>
                <h3 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                  Need Documents Stored On Your Own Server or Private Cloud?
                </h3>
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                  For regulated industries (Banks, Defense, Healthcare, Global Law Firms), DocMind delivers a pure sovereign deployment: <strong className="text-white font-semibold">raw documents never touch DocMind servers</strong>.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-xs text-slate-300">
                  <div className="flex items-center gap-2">
                    <span className="text-indigo-400 font-bold">✓</span>
                    <span><strong>Bring Your Own Storage (BYOS):</strong> AWS S3, Cloudflare R2, MinIO, or NAS</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-indigo-400 font-bold">✓</span>
                    <span><strong>Bring Your Own Key / Model (BYOK):</strong> Private Azure OpenAI or local Ollama/vLLM</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-indigo-400 font-bold">✓</span>
                    <span><strong>Air-Gapped VPC:</strong> Full Docker &amp; Helm chart deployment behind your firewall</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-indigo-400 font-bold">✓</span>
                    <span><strong>SOC-2 &amp; HIPAA Ready:</strong> Dedicated Solutions Architect &amp; 99.99% SLA</span>
                  </div>
                </div>
              </div>

              <div className="w-full lg:w-auto flex flex-col items-center lg:items-end gap-3 shrink-0">
                <div className="text-right">
                  <div className="text-xs font-semibold uppercase tracking-wider text-indigo-400">Custom Deployment</div>
                  <div className="text-2xl sm:text-3xl font-extrabold text-white">Starts at $1,499 <span className="text-xs text-slate-400 font-normal">/ mo</span></div>
                  <div className="text-[11px] text-slate-400">or Annual On-Prem License</div>
                </div>
                <button
                  onClick={() => setSovereignModalOpen(true)}
                  className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 hover:from-indigo-400 hover:to-cyan-400 text-white font-bold text-xs transition-all shadow-lg shadow-indigo-500/25 active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>Request Sovereign On-Prem Demo</span>
                  <span>&rarr;</span>
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* SOVEREIGN EVALUATION REQUEST MODAL */}
        {sovereignModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
            <div className="w-full max-w-lg bg-slate-900 border border-indigo-500/30 rounded-2xl shadow-2xl p-6 sm:p-8 relative">
              <button
                onClick={() => {
                  setSovereignModalOpen(false);
                  setSovereignSubmitted(false);
                }}
                className="absolute top-5 right-5 text-slate-400 hover:text-white text-lg"
              >
                ✕
              </button>

              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/40 text-indigo-400 flex items-center justify-center text-lg">
                  🛡️
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Enterprise Sovereign (BYOS) Evaluation</h3>
                  <p className="text-xs text-slate-400">Zero-Data-Retention on-premise &amp; private cloud deployment</p>
                </div>
              </div>

              {sovereignSubmitted ? (
                <div className="py-8 text-center space-y-4">
                  <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center text-2xl mx-auto">
                    ✓
                  </div>
                  <h4 className="text-base font-bold text-white">Evaluation Request Registered!</h4>
                  <p className="text-xs text-slate-300 max-w-sm mx-auto leading-relaxed">
                    Our Solutions Engineering team will reach out to <strong className="text-cyan-400">{sovereignEmail}</strong> within 4 business hours with the DocMind Docker VPC installation bundle and S3/R2 connector guide.
                  </p>
                  <button
                    onClick={() => {
                      setSovereignModalOpen(false);
                      setSovereignSubmitted(false);
                    }}
                    className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition-all"
                  >
                    Close Window
                  </button>
                </div>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (sovereignEmail && sovereignCompany) {
                      setSovereignSubmitted(true);
                    }
                  }}
                  className="space-y-4 pt-2"
                >
                  <div>
                    <label className="text-xs font-medium text-slate-300 block mb-1">Work Email</label>
                    <input
                      type="email"
                      required
                      value={sovereignEmail}
                      onChange={(e) => setSovereignEmail(e.target.value)}
                      placeholder="ciso@yourcompany.com"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-slate-300 block mb-1">Company / Organization Name</label>
                    <input
                      type="text"
                      required
                      value={sovereignCompany}
                      onChange={(e) => setSovereignCompany(e.target.value)}
                      placeholder="e.g. Meridian Financial Partners"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-slate-300 block mb-1">Your Storage Platform</label>
                      <select
                        value={sovereignStorage}
                        onChange={(e) => setSovereignStorage(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
                      >
                        <option value="AWS S3 (Private Bucket)">AWS S3 (Private Bucket)</option>
                        <option value="Cloudflare R2 (BYOS)">Cloudflare R2 (BYOS)</option>
                        <option value="MinIO / On-Premise S3">MinIO / On-Premise S3</option>
                        <option value="Google Cloud Storage">Google Cloud Storage</option>
                        <option value="Azure Blob Storage">Azure Blob Storage</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-medium text-slate-300 block mb-1">Primary Compliance Standard</label>
                      <select
                        value={sovereignCompliance}
                        onChange={(e) => setSovereignCompliance(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
                      >
                        <option value="SOC-2 & ISO 27001">SOC-2 &amp; ISO 27001</option>
                        <option value="HIPAA (Healthcare)">HIPAA (Healthcare)</option>
                        <option value="FINRA / SEC (Banking)">FINRA / SEC (Banking)</option>
                        <option value="GDPR (EU Data Residency)">GDPR (EU Data Residency)</option>
                        <option value="ITAR / Defense">ITAR / Defense</option>
                      </select>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-[11px] text-indigo-300 leading-relaxed">
                    🔒 <strong>Strict Zero-Data Guarantee:</strong> All document indexing and vector embedding will run inside your VPC or connector. No customer documents are retained on DocMind SaaS infrastructure.
                  </div>

                  <button
                    type="submit"
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 hover:from-indigo-400 hover:to-cyan-400 text-white font-bold text-xs transition-all shadow-md shadow-indigo-500/20 active:scale-95"
                  >
                    Submit Sovereign Architecture Request &rarr;
                  </button>
                </form>
              )}
            </div>
          </div>
        )}

        {/* FAQ ACCORDION */}
        <section id="faq" className="py-20 px-6 max-w-4xl mx-auto border-t border-slate-800/80">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-extrabold text-white tracking-tight">Frequently Asked Questions</h2>
            <p className="text-xs sm:text-sm text-slate-400 mt-2">Everything you need to know about DocMind security, citations, and storage.</p>
          </div>

          <div className="space-y-3">
            {faqs.map((faq, idx) => {
              const isOpen = openFaq === idx;
              return (
                <div
                  key={idx}
                  className="rounded-2xl bg-slate-900/60 border border-slate-800/80 overflow-hidden transition-all"
                >
                  <button
                    onClick={() => setOpenFaq(isOpen ? null : idx)}
                    className="w-full p-5 text-left text-sm font-semibold text-white flex items-center justify-between gap-4 cursor-pointer"
                  >
                    <span>{faq.q}</span>
                    <span className="text-cyan-400 font-bold">{isOpen ? '−' : '+'}</span>
                  </button>
                  {isOpen && (
                    <div className="px-5 pb-5 text-xs text-slate-300 leading-relaxed border-t border-slate-800/60 pt-4 animate-in fade-in">
                      {faq.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* FOOTER */}
        <footer className="border-t border-slate-800/80 py-12 px-6 max-w-7xl mx-auto text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-6">
          <Logo size="sm" showBadge={false} />
          <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 text-[11px] text-slate-400">
            <span>Enterprise Security</span>
            <span>•</span>
            <span>SOC 2 Ready Architecture</span>
            <span>•</span>
            <span>Zero Model Training</span>
            <span>•</span>
            <span>Full Audit Telemetry</span>
          </div>
          <p>© 2026 DocMind Technologies Inc. All rights reserved.</p>
        </footer>
      </div>
    </div>
  );
};
