'use client';

import React, { useState } from 'react';
import { CitationDTO } from '../lib/api';
import { Logo } from './Logo';

interface LandingPageProps {
  onOpenAuth: (mode: 'signin' | 'signup', isCompany?: boolean) => void;
  onLaunchApp: () => void;
}

interface DemoScenario {
  id: string;
  title: string;
  documentScope: string[];
  question: string;
  answer: string;
  citations: CitationDTO[];
}

const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: 'compliance',
    title: 'Cloudflare R2 & Multi-Tenancy',
    documentScope: ['DocMind_PRD_Technical_Specification_v1.0.pdf'],
    question: 'How does DocMind ensure customer documents are never visible to another company?',
    answer:
      'DocMind enforces strict tenant boundaries at every layer of the infrastructure. Documents are stored in encrypted, isolated Cloudflare R2 object partitions under workspaces/[workspace_id]/ [S1]. Every database query enforces row-level workspace constraints derived exclusively from verified JWT server state [S2]. Passwords use memory-hard Argon2id hashing, and documents are never used for AI model training [S3].',
    citations: [
      {
        citation_id: 'cit-demo-1',
        document_id: 'doc-prd-01',
        filename: 'DocMind_PRD_Technical_Specification_v1.0.pdf',
        page_start: 10,
        page_end: 10,
        section: '09 / Identity and workspaces',
        excerpt:
          'FR-007: Every request resolves user and active workspace strictly from trusted server state. Cross-tenant access attempts immediately fail with HTTP 403 Forbidden.',
        source_label: 'S1',
      },
      {
        citation_id: 'cit-demo-2',
        document_id: 'doc-prd-01',
        filename: 'DocMind_PRD_Technical_Specification_v1.0.pdf',
        page_start: 12,
        page_end: 12,
        section: '11 / Cloudflare R2 Object Storage',
        excerpt:
          'Direct browser-to-R2 upload with ephemeral presigned URLs; private workspace prefixing ensures cross-tenant data inference or discovery is impossible.',
        source_label: 'S2',
      },
      {
        citation_id: 'cit-demo-3',
        document_id: 'doc-prd-01',
        filename: 'DocMind_PRD_Technical_Specification_v1.0.pdf',
        page_start: 10,
        page_end: 10,
        section: '09 / FR-002 Security Policy',
        excerpt:
          'Argon2id password hashing with time_cost=2 and 64MB memory. Zero model training policy on customer reference documents.',
        source_label: 'S3',
      },
    ],
  },
  {
    id: 'compare',
    title: 'Contract Cross-Comparison',
    documentScope: ['Vendor_A_MSA_2026.pdf', 'Vendor_B_MSA_2026.pdf'],
    question: 'Compare the liability limitations and indemnification covenants between Vendor A and Vendor B.',
    answer:
      'Vendor A caps aggregate indemnification liability at 12 months of paid contract fees ($250,000 maximum) with a 30-day notice window [S1]. In contrast, Vendor B provides an uncapped indemnification for gross negligence and IP infringement, but imposes a $1,000,000 general liability threshold [S2]. Vendor B also requires binding arbitration in New York, whereas Vendor A elects Delaware jurisdiction [S3].',
    citations: [
      {
        citation_id: 'cit-demo-4',
        document_id: 'doc-vendor-a',
        filename: 'Vendor_A_MSA_2026.pdf',
        page_start: 8,
        page_end: 8,
        section: 'Section 12.1: Limitation of Liability',
        excerpt:
          'Except for breach of confidentiality, neither party liability shall exceed the total amount paid by Customer in the preceding twelve (12) months or $250,000.',
        source_label: 'S1',
      },
      {
        citation_id: 'cit-demo-5',
        document_id: 'doc-vendor-b',
        filename: 'Vendor_B_MSA_2026.pdf',
        page_start: 14,
        page_end: 15,
        section: 'Section 16: Indemnification Obligations',
        excerpt:
          'Supplier indemnification for third-party intellectual property claims and willful misconduct shall remain uncapped up to statutory damages limits.',
        source_label: 'S2',
      },
      {
        citation_id: 'cit-demo-6',
        document_id: 'doc-vendor-b',
        filename: 'Vendor_B_MSA_2026.pdf',
        page_start: 22,
        page_end: 22,
        section: 'Section 24: Dispute Resolution and Governing Law',
        excerpt:
          'Any dispute arising hereunder shall be finally settled under the Rules of Arbitration of the American Arbitration Association in New York County, New York.',
        source_label: 'S3',
      },
    ],
  },
  {
    id: 'financial',
    title: 'Financial Audit & Balance Sheet Analysis',
    documentScope: ['Meridian_Q3_Financials.pdf', 'Q3_Consolidated_Audit.pdf'],
    question: 'Extract Q3 ARR growth, operating margins, and outstanding auditor caveats.',
    answer:
      'Q3 Enterprise ARR reached $48.6M, representing a 34.2% YoY acceleration with gross margins expanding to 81.4% [S1]. The independent auditor flagged $4.2M in aged cross-border receivables pending European regulatory clearance [S2].',
    citations: [
      {
        citation_id: 'cit-demo-7',
        document_id: 'doc-fin-01',
        filename: 'Meridian_Q3_Financials.pdf',
        page_start: 4,
        page_end: 5,
        section: 'Item 2: Management Discussion & Analysis',
        excerpt:
          'Enterprise ARR reached $48.6M representing 34.2% YoY acceleration. Cloud subscription gross margins expanded to 81.4% from 78.2% in Q3 prior year.',
        source_label: 'S1',
      },
      {
        citation_id: 'cit-demo-8',
        document_id: 'doc-fin-02',
        filename: 'Q3_Consolidated_Audit.pdf',
        page_start: 28,
        page_end: 29,
        section: 'Note 14: Contingencies and Audit Caveats',
        excerpt:
          'Auditors identified $4.2M in aged cross-border receivables requiring specialized reserve allocation pending regulatory currency settlement.',
        source_label: 'S2',
      },
    ],
  },
];

export const LandingPage: React.FC<LandingPageProps> = ({ onOpenAuth, onLaunchApp }) => {
  const [activeScenario, setActiveScenario] = useState<DemoScenario>(DEMO_SCENARIOS[0]);
  const [activeCitation, setActiveCitation] = useState<CitationDTO | null>(null);
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
      a: 'DocMind implements complete architectural multi-tenancy. Every company receives an isolated workspace ID. Uploaded documents are saved to dedicated Cloudflare R2 partitioned paths (workspaces/[workspace_id]/...). Database queries enforce strict WHERE workspace_id = :authenticated_workspace_id. It is mathematically impossible for one company to access, view, or search another company\'s files.',
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
              Cloudflare R2 + pgvector
            </span>
            <span>Zero Cross-Tenant Leakage & Verifiable Citations</span>
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
            Upload complex contracts, financial filings, and technical specifications. Every claim is verified with{' '}
            <b className="text-cyan-300">exact page citations [S1]</b>. Each company’s files are physically quarantined on{' '}
            <b className="text-white">Cloudflare R2</b> with zero cross-tenant visibility.
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
              title="Instant pre-seeded enterprise evaluation workspace for hiring teams and reviewers"
            >
              <span className="text-cyan-400 group-hover:scale-110 transition-transform">⚡</span>
              <span>Recruiter 1-Click Sandbox</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 font-mono border border-cyan-500/30">Reviewer Mode</span>
            </button>
          </div>

          {/* Trust Badges */}
          <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-10 text-xs text-slate-400 font-medium">
            <div className="flex items-center gap-2">
              <span className="text-emerald-400 text-base">🔒</span>
              <span>Cloudflare R2 Tenant Isolation</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-cyan-400 text-base">🛡️</span>
              <span>Argon2id Memory-Hard Hashing</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-teal-400 text-base">⚡</span>
              <span>768-Dim pgvector Hybrid Search</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-indigo-400 text-base">🚫</span>
              <span>Zero AI Model Training Policy</span>
            </div>
          </div>
        </section>

        {/* INTERACTIVE QUERY & CITATION PLAYGROUND */}
        <section id="demo" className="py-16 px-6 max-w-6xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Interactive Ground-Truth Playground
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 mt-2">
              Experience verified citation grounding. Click any numbered badge <b className="text-cyan-400">[S1]</b> to inspect verbatim proof.
            </p>
          </div>

          {/* Playground Container */}
          <div className="rounded-3xl bg-slate-900/70 border border-slate-800 shadow-2xl backdrop-blur-2xl overflow-hidden p-6 sm:p-8">
            {/* Scenario Switcher Tabs */}
            <div className="flex flex-wrap gap-2.5 pb-6 border-b border-slate-800">
              {DEMO_SCENARIOS.map(sc => (
                <button
                  key={sc.id}
                  onClick={() => {
                    setActiveScenario(sc);
                    setActiveCitation(null);
                  }}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                    activeScenario.id === sc.id
                      ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                      : 'bg-slate-950/80 text-slate-400 hover:text-white border border-slate-800'
                  }`}
                >
                  {sc.title}
                </button>
              ))}
            </div>

            {/* Scope Bar */}
            <div className="py-4 flex items-center gap-2 text-xs text-slate-400 border-b border-slate-800/60">
              <span className="text-slate-500">Document Scope:</span>
              {activeScenario.documentScope.map((doc, idx) => (
                <span
                  key={idx}
                  className="px-2.5 py-1 rounded-lg bg-slate-950 text-cyan-300 font-mono text-[11px] border border-slate-800 flex items-center gap-1.5"
                >
                  <span>📄</span> {doc}
                </span>
              ))}
            </div>

            {/* User Question */}
            <div className="py-6">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">User Query</div>
              <div className="text-base sm:text-lg font-semibold text-white bg-slate-950/80 p-4 rounded-2xl border border-slate-800/80">
                &ldquo;{activeScenario.question}&rdquo;
              </div>
            </div>

            {/* Grounded AI Response */}
            <div className="pb-6">
              <div className="text-[11px] font-bold text-cyan-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                <span>🤖</span> DocMind Grounded Synthesis (Gemini 2.5 Flash)
              </div>
              <div className="text-sm leading-relaxed text-slate-200 bg-slate-950/90 p-5 rounded-2xl border border-cyan-500/30">
                {activeScenario.answer.split(/(\[S\d+\])/g).map((segment, idx) => {
                  const match = segment.match(/\[S(\d+)\]/);
                  if (match) {
                    const citIndex = parseInt(match[1], 10) - 1;
                    const cit = activeScenario.citations[citIndex];
                    const isSelected = activeCitation?.citation_id === cit?.citation_id;
                    return (
                      <button
                        key={idx}
                        onClick={() => setActiveCitation(cit || null)}
                        className={`inline-flex items-center px-1.5 py-0.5 mx-1 rounded font-mono font-bold text-xs transition-all ${
                          isSelected
                            ? 'bg-cyan-400 text-slate-950 ring-2 ring-cyan-400 shadow-md shadow-cyan-400/30 scale-105'
                            : 'bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 cursor-pointer'
                        }`}
                        title="Click to view verbatim excerpt proof"
                      >
                        {segment}
                      </button>
                    );
                  }
                  return <span key={idx}>{segment}</span>;
                })}
              </div>
            </div>

            {/* Verbatim Excerpt Drawer Preview */}
            {activeCitation && (
              <div className="p-5 rounded-2xl bg-cyan-950/30 border border-cyan-500/40 text-xs animate-in fade-in slide-in-from-bottom-2 duration-150">
                <div className="flex items-center justify-between text-cyan-400 font-bold mb-2">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-cyan-400 text-slate-950 text-[10px]">
                      {activeCitation.source_label}
                    </span>
                    <span>
                      {activeCitation.filename} • Page {activeCitation.page_start}
                    </span>
                  </div>
                  <button onClick={() => setActiveCitation(null)} className="text-slate-400 hover:text-white">✕</button>
                </div>
                <div className="text-slate-400 text-[11px] mb-2 font-mono">
                  Section: {activeCitation.section || 'General'}
                </div>
                <blockquote className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 font-mono text-[11px] leading-relaxed">
                  &ldquo;{activeCitation.excerpt}&rdquo;
                </blockquote>
              </div>
            )}
          </div>
        </section>

        {/* SECURITY & CLOUDFLARE R2 ISOLATION SHOWCASE */}
        <section id="security" className="py-20 px-6 max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <span className="text-xs font-bold text-cyan-400 uppercase tracking-wider px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20">
              Architectural Security
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight mt-4">
              Your Company Documents Are Never Exposed to Anyone Else
            </h2>
            <p className="text-sm sm:text-base text-slate-400 max-w-2xl mx-auto mt-2">
              DocMind guarantees multi-tenant quarantine from the physical storage bucket to database row filters.
            </p>
          </div>

          {/* 3 Pillars Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-cyan-500/40 transition-all space-y-4">
              <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 flex items-center justify-center text-2xl">
                ☁️
              </div>
              <h3 className="text-base font-bold text-white">Cloudflare R2 Path Isolation</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Files are partitioned into dedicated workspace paths:{' '}
                <code className="text-cyan-300 text-[11px]">workspaces/[ws_id]/documents/[id]/[sha256].bin</code>. Presigned PUT/GET URLs
                expire in 120 seconds and require active workspace authentication.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-cyan-500/40 transition-all space-y-4">
              <div className="w-12 h-12 rounded-xl bg-teal-500/10 border border-teal-500/30 text-teal-400 flex items-center justify-center text-2xl">
                🛡️
              </div>
              <h3 className="text-base font-bold text-white">Row-Level Database Guard</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Every query to PostgreSQL and pgvector strictly checks <code className="text-teal-300 text-[11px]">WHERE workspace_id = :active_workspace_id</code> derived from cryptographic JWT claims. IDOR tampering is rejected with an immediate 403 Forbidden.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-cyan-500/40 transition-all space-y-4">
              <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 flex items-center justify-center text-2xl">
                🔐
              </div>
              <h3 className="text-base font-bold text-white">Zero Model Training</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Your company contracts, balance sheets, and intellectual property are never sent to train or fine-tune public foundation models. Your data remains strictly your own.
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
              Predictable SaaS Tiers for Every Team
            </h2>
            <p className="text-sm text-slate-400 mt-2">Zero hidden charges. Scale seamlessly as your document volume grows.</p>

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
                  <div className="flex items-center gap-2">✓ 200 MB Cloudflare R2 Storage</div>
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
                  <div className="flex items-center gap-2 text-cyan-300">✓ 10 GB Cloudflare R2 Storage</div>
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
                  <div className="flex items-center gap-2 text-amber-300">✓ 100 GB Cloudflare R2 Storage</div>
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
          <div className="flex items-center gap-6 text-[11px] text-slate-400">
            <span>Cloudflare R2 Encrypted</span>
            <span>•</span>
            <span>pgvector 768-Dim</span>
            <span>•</span>
            <span>Gmail SMTP Verified</span>
            <span>•</span>
            <span>Argon2id Hashed</span>
          </div>
          <p>© 2026 DocMind Enterprise SaaS. All rights reserved.</p>
        </footer>
      </div>
    </div>
  );
};
