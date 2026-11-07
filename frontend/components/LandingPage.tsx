'use client';

import React, { useState } from 'react';
import { CitationDTO } from '../lib/api';

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
    title: 'Tenant Security & Encryption',
    documentScope: ['DocMind_PRD_Technical_Specification_v1.0.pdf'],
    question: 'How does DocMind guarantee tenant isolation and protect stored passwords?',
    answer:
      'DocMind enforces cryptographic tenant isolation at both the database and object storage layers. Every request strictly derives the user identity and active workspace from trusted server-side JWT claims [S1]. Passwords are never stored in cleartext; they are hashed using the memory-hard Argon2id algorithm [S2]. Furthermore, object storage paths are partitioned by workspace ID and accessed only via short-lived ephemeral signed URLs [S3].',
    citations: [
      {
        citation_id: 'cit-demo-1',
        document_id: 'doc-prd-01',
        filename: 'DocMind_PRD_Technical_Specification_v1.0.pdf',
        page_start: 10,
        page_end: 10,
        section: '09 / Identity and workspaces',
        excerpt:
          'FR-002: Hash passwords with Argon2id; never store or log cleartext passwords. FR-007: Every request resolves user and active workspace from trusted server state.',
        source_label: 'S1',
      },
      {
        citation_id: 'cit-demo-2',
        document_id: 'doc-prd-01',
        filename: 'DocMind_PRD_Technical_Specification_v1.0.pdf',
        page_start: 10,
        page_end: 10,
        section: '09 / FR-002 Security Policy',
        excerpt:
          'DB contains only encoded password hash; logs contain no password or authorization tokens under any circumstances.',
        source_label: 'S2',
      },
      {
        citation_id: 'cit-demo-3',
        document_id: 'doc-prd-01',
        filename: 'DocMind_PRD_Technical_Specification_v1.0.pdf',
        page_start: 12,
        page_end: 12,
        section: '11 / Upload and Object Storage',
        excerpt:
          'Direct browser-to-R2 upload with ephemeral presigned URLs; private workspace prefixing ensures cross-tenant data inference is impossible.',
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
        document_id: 'doc-msa-a',
        filename: 'Vendor_A_MSA_2026.pdf',
        page_start: 18,
        page_end: 19,
        section: 'Section 12.2 Limitation of Liability',
        excerpt:
          'Neither party liability under this Agreement shall exceed the total fees paid during the prior twelve (12) month period preceding the claim.',
        source_label: 'S1',
      },
      {
        citation_id: 'cit-demo-5',
        document_id: 'doc-msa-b',
        filename: 'Vendor_B_MSA_2026.pdf',
        page_start: 14,
        page_end: 14,
        section: 'Section 9.4 Super-cap exceptions',
        excerpt:
          'The liability cap in Section 9.1 shall not apply to breach of Section 7 (Confidentiality) or indemnification obligations under Section 11.',
        source_label: 'S2',
      },
      {
        citation_id: 'cit-demo-6',
        document_id: 'doc-msa-b',
        filename: 'Vendor_B_MSA_2026.pdf',
        page_start: 22,
        page_end: 22,
        section: 'Section 16 Governing Law',
        excerpt:
          'This Agreement shall be governed by the laws of the State of New York with exclusive venue in the Borough of Manhattan.',
        source_label: 'S3',
      },
    ],
  },
  {
    id: 'summary',
    title: 'Financial Audit Summarization',
    documentScope: ['Q3_Consolidated_Financial_Audit.pdf'],
    question: 'Summarize the primary revenue drivers and critical audit risk caveats for Q3.',
    answer:
      'Q3 consolidated recurring revenue expanded by 34.2% YoY, driven primarily by enterprise SaaS contract renewals and expansion in APAC healthcare accounts [S1]. However, the independent auditor noted two critical caveats: rising short-term foreign exchange currency exposure and a pending uncollected receivables reserve of $4.2M subject to reconciliation in Q4 [S2].',
    citations: [
      {
        citation_id: 'cit-demo-7',
        document_id: 'doc-fin-03',
        filename: 'Q3_Consolidated_Financial_Audit.pdf',
        page_start: 4,
        page_end: 5,
        section: 'Item 2: Management Discussion',
        excerpt:
          'Enterprise ARR reached $48.6M representing 34.2% YoY acceleration. APAC healthcare sector renewals accounted for 61% of expansion volume.',
        source_label: 'S1',
      },
      {
        citation_id: 'cit-demo-8',
        document_id: 'doc-fin-03',
        filename: 'Q3_Consolidated_Financial_Audit.pdf',
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
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const faqs = [
    {
      q: 'How does DocMind guarantee zero AI hallucinations?',
      a: 'Unlike generic chatbots that guess when information is missing, DocMind employs a strict evidence-bounding protocol. Retrieval is performed using a hybrid dense (pgvector) + lexical (PostgreSQL FTS) engine. The LLM is constrained to synthesize answers only from the retrieved evidence chunks. If evidence is insufficient, it explicitly states what is missing instead of fabricating facts.',
    },
    {
      q: 'Does DocMind train foundation models on our uploaded files?',
      a: 'Never. DocMind has an absolute zero-training policy. Your documents and extracted text chunks are stored in private, workspace-isolated database tables and encrypted object storage. They are never exported, shared, or used to fine-tune or train any AI model.',
    },
    {
      q: 'How do Company Workspaces and role-based permissions work?',
      a: 'When an organization creates a Company account, an isolated tenant container is initialized. Workspace owners can invite team members with specific roles: Owner (full billing & workspace administration), Admin (document and user management), Member (upload, chat, compare), and Viewer (read-only document Q&A).',
    },
    {
      q: 'What file formats and sizes are supported?',
      a: 'DocMind supports PDF, DOCX (Microsoft Word), TXT, and Markdown files up to 20 MB and 200 pages per document in the standard tier, with up to 200 MB storage per workspace. Enterprise tiers support custom file sizes up to 100 MB and multi-thousand-page documents.',
    },
    {
      q: 'Can DocMind handle scanned paper documents or PDFs with images?',
      a: 'Yes. DocMind includes an automated OCR pipeline. If a PDF contains image-only or scanned pages without a native text layer, the ingestion worker automatically activates an OCR fallback to extract textual data, preserving layout and page indices.',
    },
  ];

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Background radial gradients */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[1000px] h-[550px] bg-gradient-to-b from-cyan-500/15 via-teal-500/5 to-transparent blur-3xl opacity-60" />
        <div className="absolute top-[40%] -left-40 w-[600px] h-[600px] bg-blue-600/10 blur-3xl rounded-full" />
        <div className="absolute top-[60%] -right-40 w-[600px] h-[600px] bg-teal-500/10 blur-3xl rounded-full" />
      </div>

      {/* Main Content */}
      <div className="relative z-10">
        {/* HERO SECTION */}
        <section className="pt-20 pb-20 px-6 max-w-7xl mx-auto text-center">
          {/* Animated Announcement Pill */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-900/90 border border-cyan-500/30 text-xs font-medium text-cyan-300 shadow-lg shadow-cyan-500/10 mb-8 backdrop-blur-md hover:border-cyan-400 transition-all cursor-pointer">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
            <span className="font-semibold tracking-wide uppercase text-[10px] bg-cyan-500/20 text-cyan-300 px-2 py-0.5 rounded">
              DocMind v1.0 Production
            </span>
            <span>Enterprise Multi-Tenant Document Intelligence Platform</span>
            <span className="text-cyan-400">&rarr;</span>
          </div>

          {/* Main Headline */}
          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-white max-w-5xl mx-auto leading-[1.12]">
            Ask Your Documents Anything.{' '}
            <span className="bg-gradient-to-r from-cyan-400 via-teal-300 to-blue-400 bg-clip-text text-transparent">
              Verify Every Single Word.
            </span>
          </h1>

          {/* Subtitle */}
          <p className="mt-6 text-lg sm:text-xl text-slate-300 max-w-3xl mx-auto leading-relaxed font-light">
            DocMind transforms high-stakes enterprise documents—contracts, financial audits, technical PRDs, and clinical filings—into a searchable, question-answerable knowledge base with <strong>verifiable page citations</strong>, <strong>cross-document comparative matrices</strong>, and <strong>zero AI hallucinations</strong>.
          </p>

          {/* Primary CTA Buttons */}
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <button
              onClick={() => onOpenAuth('signup', true)}
              className="px-8 py-4 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-400 hover:from-cyan-400 hover:to-teal-300 text-slate-950 font-bold text-base shadow-xl shadow-cyan-500/20 transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center gap-2"
            >
              <span>🏢</span>
              <span>Create Company Account</span>
              <span className="text-slate-950 font-extrabold">&rarr;</span>
            </button>

            <button
              onClick={onLaunchApp}
              className="px-7 py-4 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 hover:border-cyan-500/50 text-white font-semibold text-base transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center gap-2 backdrop-blur-md"
            >
              <span>⚡</span>
              <span>Launch Live Workspace</span>
            </button>
          </div>

          {/* Trust Guarantees Bar */}
          <div className="mt-14 pt-8 border-t border-slate-800/80 grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto text-left">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 font-bold text-sm">
                ✓
              </div>
              <div>
                <div className="text-xs font-bold text-white uppercase tracking-wider">Zero Training</div>
                <div className="text-xs text-slate-400">Customer data never trains models</div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400 font-bold text-sm">
                🛡️
              </div>
              <div>
                <div className="text-xs font-bold text-white uppercase tracking-wider">Multi-Tenant Isolation</div>
                <div className="text-xs text-slate-400">Cryptographic database boundaries</div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 font-bold text-sm">
                📑
              </div>
              <div>
                <div className="text-xs font-bold text-white uppercase tracking-wider">Exact Page Citations</div>
                <div className="text-xs text-slate-400">Clickable verbatim evidence proof</div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 font-bold text-sm">
                ⚡
              </div>
              <div>
                <div className="text-xs font-bold text-white uppercase tracking-wider">Fast Hybrid RAG</div>
                <div className="text-xs text-slate-400">pgvector + Full-Text Search</div>
              </div>
            </div>
          </div>
        </section>

        {/* INTERACTIVE LIVE DEMO SANDBOX */}
        <section id="demo" className="py-16 px-6 max-w-7xl mx-auto">
          <div className="text-center mb-10">
            <div className="inline-block px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-semibold uppercase tracking-wider mb-3">
              Interactive Live Simulation
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold text-white">
              Experience Cryptographic Citation Grounding
            </h2>
            <p className="mt-3 text-slate-400 max-w-2xl mx-auto text-sm">
              Select an enterprise scenario below to watch DocMind retrieve evidence chunks, enforce answer boundaries, and generate verifiable citations.
            </p>
          </div>

          {/* Interactive Shell */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden backdrop-blur-xl">
            {/* Scenario Picker Tabs */}
            <div className="p-4 border-b border-slate-800 bg-slate-950/70 flex flex-wrap gap-2 items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-rose-500/80" />
                <span className="w-3 h-3 rounded-full bg-amber-500/80" />
                <span className="w-3 h-3 rounded-full bg-emerald-500/80" />
                <span className="ml-3 text-xs font-mono text-slate-400">DocMind RAG Engine v1.0 &bull; Evidence Bounded</span>
              </div>

              <div className="flex flex-wrap gap-2">
                {DEMO_SCENARIOS.map(sc => (
                  <button
                    key={sc.id}
                    onClick={() => {
                      setActiveScenario(sc);
                      setActiveCitation(null);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      activeScenario.id === sc.id
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                        : 'bg-slate-800/60 text-slate-400 hover:text-slate-200 border border-transparent'
                    }`}
                  >
                    {sc.title}
                  </button>
                ))}
              </div>
            </div>

            {/* Simulated Chat Interface */}
            <div className="p-6 sm:p-8 space-y-6">
              {/* Document Scope Banner */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs">
                <div className="flex items-center gap-2 text-slate-300">
                  <span className="text-cyan-400">📁 Document Scope:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {activeScenario.documentScope.map((doc, idx) => (
                      <span key={idx} className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[11px] border border-slate-700">
                        {doc}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2 text-emerald-400 font-mono text-[11px]">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Evidence Verified (pgvector + FTS)</span>
                </div>
              </div>

              {/* User Question */}
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-slate-800 text-slate-300 flex items-center justify-center font-bold text-xs shrink-0">
                  You
                </div>
                <div className="p-4 rounded-2xl bg-slate-800/80 border border-slate-700/60 text-sm text-slate-200 max-w-2xl">
                  {activeScenario.question}
                </div>
              </div>

              {/* Assistant Grounded Answer */}
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-500 to-teal-400 text-slate-950 flex items-center justify-center font-bold text-xs shrink-0 shadow-md shadow-cyan-500/20">
                  AI
                </div>
                <div className="flex-1 space-y-4">
                  <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 text-sm leading-relaxed text-slate-200">
                    <p className="whitespace-pre-line">{activeScenario.answer}</p>

                    {/* Citations Row */}
                    <div className="mt-4 pt-4 border-t border-slate-800/80 flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider mr-1">
                        Clickable Citations:
                      </span>
                      {activeScenario.citations.map(c => (
                        <button
                          key={c.citation_id}
                          onClick={() => setActiveCitation(c)}
                          className={`px-2.5 py-1 rounded-md text-xs font-mono font-bold transition-all flex items-center gap-1.5 ${
                            activeCitation?.citation_id === c.citation_id
                              ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                              : 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/20'
                          }`}
                        >
                          <span>[{c.source_label}]</span>
                          <span className="font-sans font-normal text-[11px] text-slate-300">
                            p.{c.page_start}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Active Citation Inspection Drawer (Inline Preview) */}
                  {activeCitation && (
                    <div className="p-5 rounded-2xl bg-cyan-950/20 border border-cyan-500/40 text-xs text-slate-300 space-y-3 animate-in fade-in duration-150">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded bg-cyan-400 text-slate-950 font-bold font-mono text-[10px]">
                            [{activeCitation.source_label}] SOURCE VERIFIED
                          </span>
                          <span className="font-semibold text-white">{activeCitation.filename}</span>
                          <span className="text-slate-400 font-mono">(Page {activeCitation.page_start})</span>
                        </div>
                        <button
                          onClick={() => setActiveCitation(null)}
                          className="text-slate-400 hover:text-white text-sm"
                        >
                          ✕
                        </button>
                      </div>

                      <div className="p-3 rounded-xl bg-slate-950/90 border border-slate-800 text-xs italic font-serif text-slate-300">
                        &ldquo;{activeCitation.excerpt}&rdquo;
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span>Section: {activeCitation.section || 'General Content'}</span>
                        <span className="text-cyan-400">SHA-256 Verified at Ingestion &bull; Ephemeral Object URL</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Footer action bar */}
            <div className="p-4 border-t border-slate-800 bg-slate-950/90 flex flex-wrap items-center justify-between gap-4">
              <span className="text-xs text-slate-400">
                Want to test this against your own company files (PDF, DOCX, TXT)?
              </span>
              <button
                onClick={onLaunchApp}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-400 text-slate-950 font-bold text-xs shadow-md shadow-cyan-500/10 hover:opacity-95 transition-all"
              >
                Upload Your Own Documents &rarr;
              </button>
            </div>
          </div>
        </section>

        {/* WHAT IS DOCMIND SECTION */}
        <section id="what-is-docmind" className="py-20 px-6 max-w-7xl mx-auto border-t border-slate-800/60">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-block px-3 py-1 rounded-full bg-teal-500/10 border border-teal-500/20 text-teal-400 text-xs font-semibold uppercase tracking-wider mb-3">
                Architectural Advantage
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight leading-tight">
                Why Enterprise Teams Replace Generic AI with DocMind
              </h2>
              <p className="mt-4 text-slate-300 text-base leading-relaxed">
                Generic AI tools are trained to be creative, which makes them disastrous for compliance, law, and financial diligence. When an LLM doesn’t know an answer, it fabricates believable figures and ungrounded clauses.
              </p>
              <p className="mt-3 text-slate-400 text-sm leading-relaxed">
                <strong>DocMind is built on an authoritative engineering principle: Grounded over Confident.</strong> Every single answer must originate from verified passages retrieved from your uploaded files. If evidence does not exist in the source, DocMind unequivocally informs you.
              </p>

              <div className="mt-8 space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                    1
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">Hybrid Semantic & Lexical Retrieval</h4>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Combines 768-dimensional dense vector embeddings with PostgreSQL Full-Text Search (FTS) to ensure acronyms, clause numbers, and conceptual nuances are retrieved without fail.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded bg-teal-500/20 text-teal-400 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                    2
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">Multi-Tenant Cryptographic Boundaries</h4>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Row-Level Security guarantees no workspace can query, view, or infer data from another tenant. Company workspaces have dedicated user roles and audit tracking.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                    3
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">Auditable Verbatim Citations</h4>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Clicking any citation instantly loads the exact excerpt, document name, and page number directly from immutable stored chunks.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Comparison Grid */}
            <div className="p-6 rounded-3xl bg-slate-900/80 border border-slate-800 space-y-4">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400 pb-2 border-b border-slate-800">
                Direct Comparison: Standard Chatbot vs DocMind
              </div>

              <div className="grid grid-cols-2 gap-4 text-xs">
                <div className="p-4 rounded-2xl bg-rose-950/20 border border-rose-900/40 space-y-2">
                  <div className="font-bold text-rose-300 flex items-center gap-1.5">
                    <span>✕</span> Standard AI Chatbots
                  </div>
                  <ul className="space-y-1.5 text-slate-400">
                    <li>&bull; Hallucinates when facts are missing</li>
                    <li>&bull; No page numbers or verifiable citations</li>
                    <li>&bull; Files may train public foundation models</li>
                    <li>&bull; No cross-document comparison matrix</li>
                    <li>&bull; Fragile prompt wrappers without quotas</li>
                  </ul>
                </div>

                <div className="p-4 rounded-2xl bg-cyan-950/20 border border-cyan-500/30 space-y-2">
                  <div className="font-bold text-cyan-300 flex items-center gap-1.5">
                    <span>✓</span> DocMind Platform
                  </div>
                  <ul className="space-y-1.5 text-slate-300">
                    <li>&bull; Strict evidence bounding (zero hallucination)</li>
                    <li>&bull; Verifiable [S1], [S2] page-level citations</li>
                    <li>&bull; Absolute zero training on customer data</li>
                    <li>&bull; Automated multi-doc comparative matrix</li>
                    <li>&bull; Enterprise quotas, metering & multi-tenancy</li>
                  </ul>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
                <span>Security Standard: Argon2id + SHA-256 + TLS 1.3</span>
                <span className="text-cyan-400 font-mono">SOC2-Ready</span>
              </div>
            </div>
          </div>
        </section>

        {/* COMPLETE SERVICES SUITE SHOWCASE */}
        <section id="services" className="py-20 px-6 max-w-7xl mx-auto border-t border-slate-800/60">
          <div className="text-center mb-16">
            <div className="inline-block px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-semibold uppercase tracking-wider mb-3">
              Full Services Suite
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold text-white">
              Engineered for End-to-End Document Workflows
            </h2>
            <p className="mt-3 text-slate-400 max-w-2xl mx-auto text-sm">
              Six synchronized services providing ingestion, extraction, cross-document synthesis, and enterprise governance.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Service 1 */}
            <div className="p-6 rounded-2xl bg-slate-900/70 border border-slate-800 hover:border-cyan-500/40 transition-all hover:translate-y-[-2px] flex flex-col justify-between group">
              <div>
                <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center text-xl mb-4 group-hover:bg-cyan-500/20 transition-colors">
                  💬
                </div>
                <h3 className="text-lg font-bold text-white">Grounded Multi-Doc Chat</h3>
                <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                  Ask deep questions across single files or hundreds of indexed documents. Every claim contains clickable, verifiable `[S1]` citations mapped to source page numbers.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-800/60 flex items-center justify-between text-xs text-cyan-400 font-medium">
                <span>Hybrid pgvector + FTS</span>
                <span>&rarr;</span>
              </div>
            </div>

            {/* Service 2 */}
            <div className="p-6 rounded-2xl bg-slate-900/70 border border-slate-800 hover:border-cyan-500/40 transition-all hover:translate-y-[-2px] flex flex-col justify-between group">
              <div>
                <div className="w-12 h-12 rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-400 flex items-center justify-center text-xl mb-4 group-hover:bg-teal-500/20 transition-colors">
                  ⚖️
                </div>
                <h3 className="text-lg font-bold text-white">Cross-Document Comparison Matrix</h3>
                <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                  Select 2 to 5 ready documents—such as vendor contracts, insurance policies, or competitor RFPs—and generate an automated comparative attribute matrix.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-800/60 flex items-center justify-between text-xs text-teal-400 font-medium">
                <span>Side-by-Side Analysis</span>
                <span>&rarr;</span>
              </div>
            </div>

            {/* Service 3 */}
            <div className="p-6 rounded-2xl bg-slate-900/70 border border-slate-800 hover:border-cyan-500/40 transition-all hover:translate-y-[-2px] flex flex-col justify-between group">
              <div>
                <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center text-xl mb-4 group-hover:bg-blue-500/20 transition-colors">
                  📑
                </div>
                <h3 className="text-lg font-bold text-white">Executive Summaries & Insights</h3>
                <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                  Instantly distill 100-page regulatory filings or whitepapers into high-level overviews, section breakdowns, critical takeaway bullets, and audit risk caveats.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-800/60 flex items-center justify-between text-xs text-blue-400 font-medium">
                <span>Multi-Tier Summaries</span>
                <span>&rarr;</span>
              </div>
            </div>

            {/* Service 4 */}
            <div className="p-6 rounded-2xl bg-slate-900/70 border border-slate-800 hover:border-cyan-500/40 transition-all hover:translate-y-[-2px] flex flex-col justify-between group">
              <div>
                <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center text-xl mb-4 group-hover:bg-purple-500/20 transition-colors">
                  🔍
                </div>
                <h3 className="text-lg font-bold text-white">Layout-Aware Ingestion & OCR</h3>
                <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                  Support for complex PDF multi-column tables, DOCX, TXT, and scanned image documents. Automated fallback OCR extracts text even from scanned paper copies.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-800/60 flex items-center justify-between text-xs text-purple-400 font-medium">
                <span>PyMuPDF & Tesseract</span>
                <span>&rarr;</span>
              </div>
            </div>

            {/* Service 5 */}
            <div className="p-6 rounded-2xl bg-slate-900/70 border border-slate-800 hover:border-cyan-500/40 transition-all hover:translate-y-[-2px] flex flex-col justify-between group">
              <div>
                <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center text-xl mb-4 group-hover:bg-emerald-500/20 transition-colors">
                  🏢
                </div>
                <h3 className="text-lg font-bold text-white">Company Multi-Tenancy & Roles</h3>
                <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                  Create isolated organizational accounts with custom workspace slugs, invite team members, assign granular roles (Owner, Admin, Member, Viewer), and manage security.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-800/60 flex items-center justify-between text-xs text-emerald-400 font-medium">
                <span>Role Governance</span>
                <span>&rarr;</span>
              </div>
            </div>

            {/* Service 6 */}
            <div className="p-6 rounded-2xl bg-slate-900/70 border border-slate-800 hover:border-cyan-500/40 transition-all hover:translate-y-[-2px] flex flex-col justify-between group">
              <div>
                <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center text-xl mb-4 group-hover:bg-amber-500/20 transition-colors">
                  📊
                </div>
                <h3 className="text-lg font-bold text-white">Quota Metering & Storage Budgeting</h3>
                <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                  Real-time tracking of monthly questions, document count, and storage bytes. Configurable limits and immutable audit logs prevent runaway cloud or AI API costs.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-800/60 flex items-center justify-between text-xs text-amber-400 font-medium">
                <span>Cost Predictability</span>
                <span>&rarr;</span>
              </div>
            </div>
          </div>
        </section>

        {/* PRICING & TIERS */}
        <section id="pricing" className="py-20 px-6 max-w-7xl mx-auto border-t border-slate-800/60">
          <div className="text-center mb-16">
            <div className="inline-block px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-semibold uppercase tracking-wider mb-3">
              Transparent SaaS Pricing
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold text-white">
              Predictable Plans for Solos and Organizations
            </h2>
            <p className="mt-3 text-slate-400 max-w-xl mx-auto text-sm">
              Aligned with our strict cost-control and quota governance architecture.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto items-stretch">
            {/* Starter Tier */}
            <div className="p-8 rounded-3xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
              <div>
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Free Starter</div>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold text-white">$0</span>
                  <span className="text-xs text-slate-400">/ forever</span>
                </div>
                <p className="text-xs text-slate-400 mt-3">
                  Ideal for solo researchers, students, and evaluation testing.
                </p>

                <div className="mt-6 space-y-3 text-xs text-slate-300">
                  <div className="flex items-center gap-2">
                    <span className="text-cyan-400">✓</span> 1 Private Workspace
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-cyan-400">✓</span> 20 Active Documents (Max 20MB)
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-cyan-400">✓</span> 200 MB Storage Allowance
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-cyan-400">✓</span> 100 Grounded Questions / mo
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-cyan-400">✓</span> Exact Verifiable Citations
                  </div>
                </div>
              </div>

              <button
                onClick={() => onOpenAuth('signup', false)}
                className="mt-8 w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition-colors"
              >
                Get Started Free &rarr;
              </button>
            </div>

            {/* Company / Pro Tier (Featured) */}
            <div className="p-8 rounded-3xl bg-gradient-to-b from-slate-900 to-slate-950 border-2 border-cyan-500/60 flex flex-col justify-between relative shadow-2xl shadow-cyan-500/10">
              <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-gradient-to-r from-cyan-500 to-teal-400 text-slate-950 font-bold text-[10px] uppercase tracking-wider">
                Most Popular for Organizations
              </div>

              <div>
                <div className="text-xs font-bold text-cyan-400 uppercase tracking-wider">Company / Pro</div>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold text-white">$49</span>
                  <span className="text-xs text-slate-400">/ month</span>
                </div>
                <p className="text-xs text-slate-400 mt-3">
                  For law firms, financial analysts, and corporate research teams.
                </p>

                <div className="mt-6 space-y-3 text-xs text-slate-300">
                  <div className="flex items-center gap-2 font-semibold text-white">
                    <span className="text-cyan-400">✓</span> Multi-User Company Workspaces
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-cyan-400">✓</span> 500 Active Documents
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-cyan-400">✓</span> 10 GB Encrypted Storage
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-cyan-400">✓</span> 2,500 Grounded Questions / mo
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-cyan-400">✓</span> Multi-Doc Comparative Matrix
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-cyan-400">✓</span> Priority OCR Background Queue
                  </div>
                </div>
              </div>

              <button
                onClick={() => onOpenAuth('signup', true)}
                className="mt-8 w-full py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-400 hover:from-cyan-400 text-slate-950 font-bold text-xs shadow-lg shadow-cyan-500/20 transition-all"
              >
                Create Company Account &rarr;
              </button>
            </div>

            {/* Enterprise Tier */}
            <div className="p-8 rounded-3xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
              <div>
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Enterprise Dedicated</div>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold text-white">Custom</span>
                </div>
                <p className="text-xs text-slate-400 mt-3">
                  Custom VPC, on-premise deployment, and strict regulatory compliance.
                </p>

                <div className="mt-6 space-y-3 text-xs text-slate-300">
                  <div className="flex items-center gap-2">
                    <span className="text-cyan-400">✓</span> Unlimited Documents & Storage
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-cyan-400">✓</span> Dedicated Worker & OCR Fleet
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-cyan-400">✓</span> Custom SAML / SSO Authentication
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-cyan-400">✓</span> Self-Hosted / On-Premise VPC
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-cyan-400">✓</span> 99.99% Uptime SLA & Audit Logs
                  </div>
                </div>
              </div>

              <button
                onClick={() => alert('Contacting enterprise sales team: enterprise@docmind.ai')}
                className="mt-8 w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition-colors"
              >
                Contact Enterprise &rarr;
              </button>
            </div>
          </div>
        </section>

        {/* FAQ SECTION */}
        <section id="faq" className="py-20 px-6 max-w-4xl mx-auto border-t border-slate-800/60">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-white">Frequently Asked Questions</h2>
            <p className="mt-2 text-slate-400 text-sm">
              Answers regarding security, data retention, and how DocMind functions.
            </p>
          </div>

          <div className="space-y-4">
            {faqs.map((faq, idx) => (
              <div
                key={idx}
                className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 transition-colors"
              >
                <button
                  type="button"
                  onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                  className="w-full flex items-center justify-between text-left font-semibold text-sm text-white"
                >
                  <span>{faq.q}</span>
                  <span className="text-cyan-400 ml-4">{openFaq === idx ? '−' : '+'}</span>
                </button>
                {openFaq === idx && (
                  <p className="mt-3 text-xs leading-relaxed text-slate-300 pt-3 border-t border-slate-800/80">
                    {faq.a}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* BOTTOM CTA BANNER */}
        <section className="py-16 px-6 max-w-7xl mx-auto">
          <div className="p-10 rounded-3xl bg-gradient-to-r from-cyan-950/40 via-slate-900 to-teal-950/40 border border-cyan-500/30 text-center relative overflow-hidden">
            <div className="relative z-10 max-w-2xl mx-auto space-y-4">
              <h2 className="text-3xl font-extrabold text-white">
                Ready to Upgrade to Grounded Document Intelligence?
              </h2>
              <p className="text-sm text-slate-300">
                Join engineering leads, legal analysts, and compliance directors who verify facts with mathematical precision.
              </p>
              <div className="pt-4 flex flex-wrap justify-center gap-4">
                <button
                  onClick={() => onOpenAuth('signup', true)}
                  className="px-8 py-3.5 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-400 text-slate-950 font-bold text-sm shadow-xl shadow-cyan-500/20 hover:opacity-95 transition-all"
                >
                  Create Company Account Now &rarr;
                </button>
                <button
                  onClick={onLaunchApp}
                  className="px-6 py-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-sm transition-colors"
                >
                  Enter Workspace
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* FOOTER */}
        <footer className="py-12 border-t border-slate-800 text-slate-500 text-xs px-6 max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded bg-gradient-to-tr from-cyan-500 to-teal-400 text-slate-950 font-bold flex items-center justify-center text-xs">
              D
            </div>
            <span className="font-bold text-slate-300 text-sm">DocMind Intelligence</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">v1.0 Production</span>
          </div>

          <div className="flex flex-wrap items-center gap-6 text-slate-400">
            <a href="#what-is-docmind" className="hover:text-cyan-400 transition-colors">Overview</a>
            <a href="#services" className="hover:text-cyan-400 transition-colors">Services</a>
            <a href="#demo" className="hover:text-cyan-400 transition-colors">Interactive Demo</a>
            <a href="#pricing" className="hover:text-cyan-400 transition-colors">Pricing</a>
            <a href="#faq" className="hover:text-cyan-400 transition-colors">Security & FAQ</a>
          </div>

          <div>
            &copy; 2026 DocMind Systems. Built as per Technical Specification v1.0.
          </div>
        </footer>
      </div>
    </div>
  );
};

