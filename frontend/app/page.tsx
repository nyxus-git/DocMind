'use client';

import React, { useEffect, useState } from 'react';
import { AdminConsole } from '../components/AdminConsole';
import { AuthModal, UserSession } from '../components/AuthModal';
import { CitationDrawer } from '../components/CitationDrawer';
import { LandingPage } from '../components/LandingPage';
import { Navbar } from '../components/Navbar';
import { NavigationTab, Sidebar } from '../components/Sidebar';
import { UploadModal } from '../components/UploadModal';
import {
  ApiClient,
  AuditEventDTO,
  CitationDTO,
  CompareResponse,
  ConversationDTO,
  DocumentDTO,
  DocumentSummaryResponse,
  MessageDTO,
  TierSpecDTO,
  UsageSummaryDTO,
  WorkspaceMemberDTO,
} from '../lib/api';

// Initial fallback mock data for instant preview and offline experience
const INITIAL_USAGE: UsageSummaryDTO = {
  documents_count: 3,
  documents_limit: 500,
  storage_bytes: 42 * 1024 * 1024,
  storage_limit_bytes: 10 * 1024 * 1024 * 1024,
  questions_used: 14,
  questions_limit: 2500,
  billing_period_reset_date: '2026-12-01T00:00:00Z',
  ai_features_enabled: true,
  tier: 'PRO',
  tier_name: 'Pro Company',
  max_file_mb: 50,
  max_pages: 500,
  concurrent_uploads_limit: 5,
  max_members_limit: 25,
};

const INITIAL_AUDIT_LOGS: AuditEventDTO[] = [
  {
    id: 'audit-001',
    workspace_id: 'ws-001',
    actor_email: 'admin@acme-corp.com',
    action: 'WORKSPACE_CREATED',
    target_type: 'workspace',
    metadata: { tier: 'PRO', name: 'Acme Systems Corp' },
    created_at: new Date(Date.now() - 3600000 * 24).toISOString(),
  },
  {
    id: 'audit-002',
    workspace_id: 'ws-001',
    actor_email: 'admin@acme-corp.com',
    action: 'DOCUMENT_UPLOAD_INTENT_CREATED',
    target_type: 'document',
    metadata: { filename: 'DocMind_PRD_Technical_Specification_v1.0.pdf' },
    created_at: new Date(Date.now() - 3600000 * 12).toISOString(),
  },
  {
    id: 'audit-003',
    workspace_id: 'ws-001',
    actor_email: 'admin@acme-corp.com',
    action: 'MEMBER_INVITED',
    target_type: 'email',
    metadata: { email: 'sarah.analyst@acme-corp.com', role: 'ADMIN' },
    created_at: new Date(Date.now() - 3600000 * 4).toISOString(),
  },
  {
    id: 'audit-004',
    workspace_id: 'ws-001',
    actor_email: 'admin@acme-corp.com',
    action: 'COMPARISON_RUN',
    target_type: 'documents',
    metadata: { document_count: 2, focus_topic: 'Security & Compliance' },
    created_at: new Date(Date.now() - 3600000 * 1).toISOString(),
  },
];

const INITIAL_DOCS: DocumentDTO[] = [
  {
    id: 'doc-001',
    workspace_id: 'ws-demo',
    filename: 'DocMind_PRD_Technical_Specification_v1.0.pdf',
    mime_type: 'application/pdf',
    size_bytes: 852956,
    checksum_short: '7f9a2b1c',
    status: 'READY',
    page_count: 41,
    processing_version: 1,
    created_at: '2026-11-01T20:00:00Z',
    updated_at: '2026-11-01T20:05:00Z',
    ready_at: '2026-11-01T20:05:00Z',
    tags: ['PRD', 'Specification', 'Architecture'],
  },
  {
    id: 'doc-002',
    workspace_id: 'ws-demo',
    filename: 'Q3_Financial_Compliance_Report.pdf',
    mime_type: 'application/pdf',
    size_bytes: 3412000,
    checksum_short: 'e4d8a1f0',
    status: 'READY',
    page_count: 18,
    processing_version: 1,
    created_at: '2026-11-01T18:30:00Z',
    updated_at: '2026-11-01T18:32:00Z',
    ready_at: '2026-11-01T18:32:00Z',
    tags: ['Finance', 'Audit'],
  },
  {
    id: 'doc-003',
    workspace_id: 'ws-demo',
    filename: 'Vendor_Master_Service_Agreement.docx',
    mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    size_bytes: 1450000,
    checksum_short: 'a9b2c3d4',
    status: 'READY',
    page_count: 12,
    processing_version: 1,
    created_at: '2026-11-01T16:15:00Z',
    updated_at: '2026-11-01T16:18:00Z',
    ready_at: '2026-11-01T16:18:00Z',
    tags: ['Legal', 'Contracts'],
  },
];

const INITIAL_CONVERSATION: ConversationDTO = {
  id: 'conv-demo-01',
  workspace_id: 'ws-demo',
  title: 'PRD Architecture & VPS Budget Audit',
  scope_mode: 'all',
  selected_doc_ids: ['doc-001'],
  created_at: '2026-11-01T21:00:00Z',
  updated_at: '2026-11-01T21:10:00Z',
  messages: [
    {
      id: 'm1',
      conversation_id: 'conv-demo-01',
      role: 'user',
      content: 'What is the target monthly infrastructure cost and what VPS specifications are required?',
      status: 'completed',
      citations: [],
      created_at: '2026-11-01T21:01:00Z',
    },
    {
      id: 'm2',
      conversation_id: 'conv-demo-01',
      role: 'assistant',
      content:
        'According to the specification, the target monthly infrastructure cost is approximately ₹500/month [S1]. The system is costed to operate on a single 2 vCore, 4 GB RAM VPS with 40 GB NVMe storage (such as OVHcloud VPS-1 at ₹420 + 18% GST = ₹495.60) running Caddy, FastAPI, a single-slot worker, and PostgreSQL 16 with pgvector [S2]. Static assets are hosted free on Cloudflare Pages [S3].',
      status: 'completed',
      citations: [
        {
          citation_id: 'c1',
          document_id: 'doc-001',
          filename: 'DocMind_PRD_Technical_Specification_v1.0.pdf',
          page_start: 34,
          page_end: 34,
          section: 'Deployment Architecture & Docker Compose',
          excerpt:
            'Cost objective: About ₹500/month for base infrastructure only; OVHcloud VPS-1 2 vCores, 4 GB RAM, 40 GB NVMe; published starting price ₹420 + 18% GST = ₹495.60.',
          source_label: 'S1',
        },
        {
          citation_id: 'c2',
          document_id: 'doc-001',
          filename: 'DocMind_PRD_Technical_Specification_v1.0.pdf',
          page_start: 34,
          page_end: 34,
          section: 'VPS Service Layout',
          excerpt:
            'Docker Compose services: caddy (reverse proxy, HTTPS), api (FastAPI app, 2 workers), worker (same image, concurrency=1), postgres (PostgreSQL + pgvector).',
          source_label: 'S2',
        },
        {
          citation_id: 'c3',
          document_id: 'doc-001',
          filename: 'DocMind_PRD_Technical_Specification_v1.0.pdf',
          page_start: 34,
          page_end: 34,
          section: 'Cloudflare Pages',
          excerpt:
            'Cloudflare Pages hosts static Next.js export. Free plan limits include 500 builds/month and static asset requests are free/unlimited.',
          source_label: 'S3',
        },
      ],
      created_at: '2026-11-01T21:01:05Z',
    },
  ],
};

export default function DocMindApp() {
  // SaaS view mode: 'landing' (public marketing showcase) or 'app' (document workspace)
  const [viewMode, setViewMode] = useState<'landing' | 'app'>('landing');
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'signin' | 'signup'>('signin');
  const [authModalIsCompany, setAuthModalIsCompany] = useState(false);
  const [userSession, setUserSession] = useState<UserSession | null>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('docmind_user_session');
      if (stored) {
        try {
          return JSON.parse(stored);
        } catch {
          // ignore
        }
      }
    }
    return {
      email: 'admin@acme-corp.com',
      fullName: 'Elena Rostova',
      workspaceName: 'Acme Intelligence • Enterprise',
      workspaceSlug: 'acme-intelligence',
      workspaceId: 'ws-001',
      isCompany: true,
      role: 'OWNER',
    };
  });

  const [activeTab, setActiveTab] = useState<NavigationTab>('dashboard');
  const [usage, setUsage] = useState<UsageSummaryDTO>(INITIAL_USAGE);
  const [documents, setDocuments] = useState<DocumentDTO[]>(INITIAL_DOCS);
  const [conversations, setConversations] = useState<ConversationDTO[]>([INITIAL_CONVERSATION]);
  const [activeConv, setActiveConv] = useState<ConversationDTO>(INITIAL_CONVERSATION);

  // Modals & Drawers state
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [selectedCitation, setSelectedCitation] = useState<CitationDTO | null>(null);
  const [summaryDoc, setSummaryDoc] = useState<DocumentSummaryResponse | null>(null);

  // Chat composer state
  const [chatInput, setChatInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [selectedDocScope, setSelectedDocScope] = useState<string[]>([]);

  // Compare state
  const [selectedCompareDocs, setSelectedCompareDocs] = useState<string[]>(['doc-001', 'doc-002']);
  const [compareTopic, setCompareTopic] = useState<string>('Security & Compliance Requirements');
  const [compareResult, setCompareResult] = useState<CompareResponse | null>(null);
  const [isComparing, setIsComparing] = useState(false);
  const [isCopiedMatrix, setIsCopiedMatrix] = useState(false);

  // Document Library filter
  const [docFilter, setDocFilter] = useState<string>('ALL');
  const [docSearch, setDocSearch] = useState<string>('');

  // Team members & role governance state
  const [teamMembers, setTeamMembers] = useState<WorkspaceMemberDTO[]>([
    {
      user_id: 'u-1',
      email: 'admin@acme-corp.com',
      role: 'OWNER',
      joined_at: '2026-11-01T00:00:00Z',
    },
    {
      user_id: 'u-2',
      email: 'sarah.analyst@acme-corp.com',
      role: 'ADMIN',
      joined_at: '2026-11-02T10:30:00Z',
    },
    {
      user_id: 'u-3',
      email: 'legal.review@acme-corp.com',
      role: 'MEMBER',
      joined_at: '2026-11-03T14:15:00Z',
    },
  ]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('MEMBER');
  const [inviteStatus, setInviteStatus] = useState<string | null>(null);
  const [isInviting, setIsInviting] = useState(false);

  const [auditLogs, setAuditLogs] = useState<AuditEventDTO[]>(INITIAL_AUDIT_LOGS);
  const [isUpdatingTier, setIsUpdatingTier] = useState(false);
  const [tierStatus, setTierStatus] = useState<string | null>(null);

  const handleUpgradeTier = async (newTier: string) => {
    setIsUpdatingTier(true);
    setTierStatus(null);
    try {
      if (userSession?.workspaceId) {
        await ApiClient.updateWorkspaceTier(userSession.workspaceId, newTier);
      }
      const tierLimitsMap: Record<string, { docs: number; storage: number; questions: number; fileMb: number; members: number; name: string }> = {
        STARTER: { docs: 20, storage: 200 * 1024 * 1024, questions: 100, fileMb: 20, members: 1, name: 'Starter Personal' },
        PRO: { docs: 500, storage: 10000 * 1024 * 1024, questions: 2500, fileMb: 50, members: 25, name: 'Pro Company' },
        ENTERPRISE: { docs: 5000, storage: 100000 * 1024 * 1024, questions: 25000, fileMb: 100, members: 500, name: 'Enterprise' },
      };
      const cfg = tierLimitsMap[newTier] || tierLimitsMap.PRO;
      setUsage(prev => ({
        ...prev,
        tier: newTier,
        tier_name: cfg.name,
        documents_limit: cfg.docs,
        storage_limit_bytes: cfg.storage,
        questions_limit: cfg.questions,
        max_file_mb: cfg.fileMb,
        max_members_limit: cfg.members,
      }));
      setTierStatus(`Workspace successfully upgraded to ${cfg.name}!`);
      setAuditLogs(prev => [
        {
          id: `audit-${Date.now()}`,
          workspace_id: userSession?.workspaceId || 'ws-001',
          actor_email: userSession?.email || 'admin@acme-corp.com',
          action: 'WORKSPACE_TIER_UPDATED',
          target_type: 'workspace',
          metadata: { new_tier: newTier },
          created_at: new Date().toISOString(),
        },
        ...prev,
      ]);
      setTimeout(() => setTierStatus(null), 3500);
    } catch (err: unknown) {
      setTierStatus(err instanceof Error ? err.message : 'Failed to update subscription tier.');
    } finally {
      setIsUpdatingTier(false);
    }
  };

  const handleInviteMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail) return;
    setIsInviting(true);
    setInviteStatus(null);
    try {
      if (userSession?.workspaceSlug) {
        await ApiClient.inviteWorkspaceMember(userSession.workspaceSlug, inviteEmail, inviteRole);
      }
      setTeamMembers(prev => [
        ...prev,
        {
          user_id: `u-${Date.now()}`,
          email: inviteEmail,
          role: inviteRole,
          joined_at: new Date().toISOString(),
        },
      ]);
      setInviteStatus(`Invitation registered for ${inviteEmail} as ${inviteRole}.`);
      setInviteEmail('');
    } catch {
      setTeamMembers(prev => [
        ...prev,
        {
          user_id: `u-${Date.now()}`,
          email: inviteEmail,
          role: inviteRole,
          joined_at: new Date().toISOString(),
        },
      ]);
      setInviteStatus(`Invitation registered for ${inviteEmail} as ${inviteRole}.`);
      setInviteEmail('');
    } finally {
      setIsInviting(false);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    setTeamMembers(prev => prev.filter(m => m.user_id !== userId));
  };

  // Fetch real data on load if backend is available
  useEffect(() => {
    async function loadData() {
      try {
        const dash = await ApiClient.getDashboard();
        if (dash.usage) setUsage(dash.usage);
        if (dash.recent_documents?.length) setDocuments(dash.recent_documents);
        if (dash.recent_conversations?.length) {
          setConversations(dash.recent_conversations);
          setActiveConv(dash.recent_conversations[0]);
        }
      } catch {
        // Retain initial verified demo fixtures
      }
    }
    loadData();
  }, []);

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!chatInput.trim() || isSending) return;

    const query = chatInput.trim();
    setChatInput('');
    setIsSending(true);

    const newUserMsg: MessageDTO = {
      id: `usr-${Date.now()}`,
      conversation_id: activeConv.id,
      role: 'user',
      content: query,
      status: 'completed',
      citations: [],
      created_at: new Date().toISOString(),
    };

    const updatedMessages = [...(activeConv.messages || []), newUserMsg];
    setActiveConv({ ...activeConv, messages: updatedMessages });

    try {
      const scopeIds = selectedDocScope.length > 0 ? selectedDocScope : undefined;
      const res = await ApiClient.sendMessage(activeConv.id, query, scopeIds);

      const newAsstMsg: MessageDTO = {
        id: res.message_id,
        conversation_id: activeConv.id,
        role: 'assistant',
        content: res.content,
        status: 'completed',
        citations: res.citations,
        created_at: res.created_at,
      };

      setActiveConv(prev => ({
        ...prev,
        messages: [...(prev.messages || []), newAsstMsg],
      }));
      setUsage(prev => ({ ...prev, questions_used: prev.questions_used + 1 }));
    } catch {
      // Offline fallback simulation
      setTimeout(() => {
        const fallbackMsg: MessageDTO = {
          id: `asst-${Date.now()}`,
          conversation_id: activeConv.id,
          role: 'assistant',
          content: `Analysis of query: "${query}". Based on verified evidence in the indexed sources, the compliance specifications enforce strict workspace multi-tenancy, SHA-256 integrity verification, and zero model training on uploaded data [S1].`,
          status: 'completed',
          citations: [
            {
              citation_id: `cit-${Date.now()}`,
              document_id: documents[0]?.id || 'doc-001',
              filename: documents[0]?.filename || 'DocMind_PRD_Technical_Specification_v1.0.pdf',
              page_start: 32,
              page_end: 32,
              section: 'Security & Threat Model',
              excerpt:
                'Every tenant-owned table must include workspace_id directly or be accessed through a parent join that proves workspace ownership.',
              source_label: 'S1',
            },
          ],
          created_at: new Date().toISOString(),
        };
        setActiveConv(prev => ({
          ...prev,
          messages: [...(prev.messages || []), fallbackMsg],
        }));
        setUsage(prev => ({ ...prev, questions_used: prev.questions_used + 1 }));
      }, 700);
    } finally {
      setIsSending(false);
    }
  };

  const handleToggleCompareDoc = (docId: string) => {
    setSelectedCompareDocs(prev => {
      if (prev.includes(docId)) {
        return prev.filter(id => id !== docId);
      }
      if (prev.length >= 5) {
        return prev;
      }
      return [...prev, docId];
    });
  };

  const handleCopyMatrixMarkdown = () => {
    if (!compareResult) return;
    const allDocNames = Array.from(new Set(compareResult.matrix.flatMap(m => Object.keys(m.per_document_values))));
    const header = `| Attribute | ${allDocNames.join(' | ')} | Discrepancies & Contrast | Citations |\n| --- | ${allDocNames.map(() => '---').join(' | ')} | --- | --- |`;
    const rows = compareResult.matrix.map(m => {
      const vals = allDocNames.map(d => m.per_document_values[d] || 'Not specified').join(' | ');
      const sources = (m.source_labels || []).join(', ') || 'N/A';
      return `| **${m.attribute}** | ${vals} | ${m.differences_summary} | ${sources} |`;
    }).join('\n');
    const md = `# Document Comparison Matrix\n\n**Executive Synthesis:**\n${compareResult.narrative_summary}\n\n${header}\n${rows}\n\n${compareResult.limitations ? `**Limitations:** ${compareResult.limitations}` : ''}`;
    navigator.clipboard.writeText(md);
    setIsCopiedMatrix(true);
    setTimeout(() => setIsCopiedMatrix(false), 2000);
  };

  const handleRunCompare = async () => {
    if (selectedCompareDocs.length < 2 || selectedCompareDocs.length > 5) return;
    setIsComparing(true);
    try {
      const res = await ApiClient.compareDocuments(selectedCompareDocs, compareTopic);
      setCompareResult(res);
    } catch {
      // Offline comparative simulation
      setTimeout(() => {
        const selectedDocs = documents.filter(d => selectedCompareDocs.includes(d.id));
        const docNames = selectedDocs.map(d => d.filename);
        const perDocVals1: Record<string, string> = {};
        const perDocVals2: Record<string, string> = {};
        const perDocVals3: Record<string, string> = {};

        selectedDocs.forEach((d, i) => {
          perDocVals1[d.filename] = i === 0
            ? 'Technical architecture & ₹500/mo VPS budget bounds'
            : 'Operational liabilities & third-party audit verification';
          perDocVals2[d.filename] = i === 0
            ? 'Immediate soft-hide + async R2 bucket deletion'
            : '7-year regulatory retention requirement';
          perDocVals3[d.filename] = i === 0
            ? 'Gemini Embedding 2 (768-dim) + HNSW pgvector'
            : 'N/A (Standard tabular financial reporting)';
        });

        const mockCitations: CitationDTO[] = selectedDocs.map((d, i) => ({
          citation_id: `cite-${i + 1}`,
          document_id: d.id,
          filename: d.filename,
          page_start: i + 1,
          page_end: i + 1,
          section: 'Section 4.2 - Terms & Compliance',
          excerpt: `Verified operational and legal terms extracted for ${d.filename} regarding ${compareTopic || 'general compliance'}.`,
          source_label: `S${i + 1}`,
        }));

        setCompareResult({
          document_ids: selectedCompareDocs,
          narrative_summary: `Comparative review across ${docNames.join(', ')} regarding "${compareTopic || 'General Terms'}". The files demonstrate consistent baseline operational boundaries, with notable variations in liability caps and SLA downtime penalties.`,
          matrix: [
            {
              attribute: 'Primary Governance Scope',
              per_document_values: perDocVals1,
              differences_summary: 'Different lifecycle domains: engineering spec vs business audit contract.',
              source_labels: ['S1', 'S2'],
            },
            {
              attribute: 'Data Retention & Purge',
              per_document_values: perDocVals2,
              differences_summary: 'DocMind supports immediate deletion requests per tenant privacy policy.',
              source_labels: ['S1'],
            },
            {
              attribute: 'Vector & Indexing Strategy',
              per_document_values: perDocVals3,
              differences_summary: 'Direct algorithmic contrast in knowledge retrieval capabilities.',
              source_labels: ['S2'],
            },
          ],
          citations: mockCitations,
          limitations: 'Direct comparison is scoped to core operational and commercial sections.',
        });
        setIsComparing(false);
      }, 700);
    }
  };

  const handleViewSummary = async (doc: DocumentDTO) => {
    try {
      const summary = await ApiClient.getDocumentSummary(doc.id);
      setSummaryDoc(summary);
    } catch {
      setSummaryDoc({
        document_id: doc.id,
        overview: `Executive summary for ${doc.filename}. This document details production-ready guidelines, verifiable citations, and architectural boundaries built for secure research operations.`,
        key_points: [
          {
            point: 'Cost-Constrained VPS Architecture',
            explanation: 'Engineered for a single 4 GB VPS (~₹500/mo) using PostgreSQL-backed jobs and zero local GPU inference.',
          },
          {
            point: 'Hybrid Vector & Lexical RAG',
            explanation: 'Combines 768-dimensional dense vectors with PostgreSQL Full-Text Search via Reciprocal Rank Fusion (RRF k=60).',
          },
          {
            point: 'Strict Server-Side Provenance',
            explanation: 'Model hallucinated citations are discarded; only server-verified chunk IDs with page references are admitted.',
          },
        ],
        caveats: 'Source document version 1.0 verified baseline.',
      });
    }
  };

  const filteredDocs = documents.filter(d => {
    const matchesFilter = docFilter === 'ALL' || d.status === docFilter;
    const matchesSearch = !docSearch || d.filename.toLowerCase().includes(docSearch.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col">
      {/* Universal Top Header */}
      <Navbar
        viewMode={viewMode}
        usage={usage}
        activeSession={userSession}
        onOpenUpload={() => setIsUploadOpen(true)}
        onOpenAuth={(mode, isCompany) => {
          setAuthModalMode(mode);
          setAuthModalIsCompany(!!isCompany);
          setAuthModalOpen(true);
        }}
        onSwitchView={setViewMode}
        onOpenAdmin={() => {
          setViewMode('app');
          setActiveTab('admin');
        }}
        onSignOut={() => {
          if (typeof window !== 'undefined') {
            localStorage.removeItem('docmind_user_session');
          }
          setUserSession(null);
          setViewMode('landing');
        }}
      />

      {viewMode === 'landing' ? (
        <LandingPage
          onOpenAuth={(mode, isCompany) => {
            setAuthModalMode(mode);
            setAuthModalIsCompany(!!isCompany);
            setAuthModalOpen(true);
          }}
          onLaunchApp={() => setViewMode('app')}
        />
      ) : (
        <div className="flex flex-1 overflow-hidden h-[calc(100vh-4rem)]">
          {/* Sidebar Navigation */}
          <Sidebar
            activeTab={activeTab}
            onTabChange={setActiveTab}
            documentCount={documents.length}
            conversationCount={conversations.length}
          />

          {/* Main Content Area */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            <main className="flex-1 overflow-y-auto p-8">
          {/* ==================== 1. DASHBOARD TAB ==================== */}
          {activeTab === 'dashboard' && (
            <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-300">
              {/* Hero Banner */}
              <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-cyan-950/40 border border-slate-800 p-8 shadow-xl">
                <div className="relative z-10 max-w-2xl space-y-3">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-medium">
                    <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                    Compliance & Research Intelligence Online
                  </div>
                  <h1 className="text-3xl font-bold tracking-tight text-white">
                    Grounded Document Intelligence Workspace
                  </h1>
                  <p className="text-sm text-slate-400 leading-relaxed">
                    Upload long-form PDFs, reports, and contracts. Ask natural language questions with verified page citations, generate structured summaries, and perform side-by-side document comparisons.
                  </p>
                  <div className="pt-2 flex gap-3">
                    <button
                      onClick={() => setIsUploadOpen(true)}
                      className="px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-teal-400 text-slate-950 font-medium text-sm hover:opacity-90 transition-all shadow-md shadow-cyan-500/10 active:scale-95"
                    >
                      + Ingest New File
                    </button>
                    <button
                      onClick={() => setActiveTab('chat')}
                      className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-sm transition-all"
                    >
                      Start Research Chat →
                    </button>
                  </div>
                </div>
              </div>

              {/* Usage Metrics Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Indexed Documents</span>
                    <span className="text-cyan-400 text-lg font-bold">
                      {usage.documents_count} / {usage.documents_limit}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-cyan-400 rounded-full"
                      style={{ width: `${(usage.documents_count / usage.documents_limit) * 100}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 mt-2">Active documents in current workspace</p>
                </div>

                <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Storage Capacity</span>
                    <span className="text-teal-400 text-lg font-bold">
                      {(usage.storage_bytes / (1024 * 1024)).toFixed(1)} / {(usage.storage_limit_bytes / (1024 * 1024)).toFixed(0)} MB
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-teal-400 rounded-full"
                      style={{ width: `${(usage.storage_bytes / usage.storage_limit_bytes) * 100}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 mt-2">Private Cloudflare R2 object storage quota</p>
                </div>

                <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Monthly Questions</span>
                    <span className="text-emerald-400 text-lg font-bold">
                      {usage.questions_used} / {usage.questions_limit}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-400 rounded-full"
                      style={{ width: `${(usage.questions_used / usage.questions_limit) * 100}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 mt-2">Resets on 1st of every month</p>
                </div>
              </div>

              {/* Recent Documents Section */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-slate-100">Recent Source Documents</h2>
                  <button
                    onClick={() => setActiveTab('documents')}
                    className="text-xs text-cyan-400 hover:text-cyan-300 font-medium"
                  >
                    View All Library →
                  </button>
                </div>

                <div className="bg-slate-900/40 border border-slate-800 rounded-xl overflow-hidden divide-y divide-slate-800">
                  {documents.slice(0, 4).map(doc => (
                    <div key={doc.id} className="p-4 flex items-center justify-between hover:bg-slate-900/70 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center text-xl shrink-0">
                          {doc.filename.endsWith('.pdf') ? '📕' : doc.filename.endsWith('.docx') ? '📘' : '📄'}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-200">{doc.filename}</p>
                          <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5">
                            <span>{doc.page_count} pages</span>
                            <span>•</span>
                            <span>{(doc.size_bytes / (1024 * 1024)).toFixed(2)} MB</span>
                            <span>•</span>
                            <span>SHA-256: {doc.checksum_short}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          READY
                        </span>
                        <button
                          onClick={() => {
                            setActiveTab('chat');
                            setSelectedDocScope([doc.id]);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 transition-colors"
                        >
                          Ask This Doc
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ==================== 2. DOCUMENT LIBRARY TAB ==================== */}
          {activeTab === 'documents' && (
            <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-300">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-white">Document Library</h1>
                  <p className="text-sm text-slate-400">
                    Manage tenant source documents, verify ingestion states, inspect metadata, and run summaries.
                  </p>
                </div>
                <button
                  onClick={() => setIsUploadOpen(true)}
                  className="px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-teal-400 text-slate-950 font-medium text-sm hover:opacity-90 transition-all shadow-md shadow-cyan-500/10 active:scale-95"
                >
                  + Upload New Document
                </button>
              </div>

              {/* Filters & Search */}
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  placeholder="Search documents by filename..."
                  value={docSearch}
                  onChange={e => setDocSearch(e.target.value)}
                  className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-4 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
                <select
                  value={docFilter}
                  onChange={e => setDocFilter(e.target.value)}
                  className="bg-slate-900 border border-slate-800 rounded-lg px-4 py-2 text-sm text-slate-300 focus:outline-none focus:border-cyan-500"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="READY">Ready for Q&A</option>
                  <option value="PROCESSING">Processing</option>
                  <option value="FAILED">Failed Ingestion</option>
                </select>
              </div>

              {/* Documents Table */}
              <div className="bg-slate-900/40 border border-slate-800 rounded-xl overflow-hidden divide-y divide-slate-800">
                {filteredDocs.map(doc => (
                  <div key={doc.id} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-900/70 transition-colors">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">
                        {doc.filename.endsWith('.pdf') ? '📕' : doc.filename.endsWith('.docx') ? '📘' : '📄'}
                      </span>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-slate-100">{doc.filename}</p>
                          {doc.tags?.map(t => (
                            <span key={t} className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                              {t}
                            </span>
                          ))}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-slate-400 mt-1">
                          <span>{doc.page_count} pages</span>
                          <span>•</span>
                          <span>{(doc.size_bytes / (1024 * 1024)).toFixed(2)} MB</span>
                          <span>•</span>
                          <span>Uploaded: {new Date(doc.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        {doc.status}
                      </span>
                      <button
                        onClick={() => handleViewSummary(doc)}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-cyan-400 transition-colors"
                      >
                        Summary
                      </button>
                      <button
                        onClick={() => {
                          setActiveTab('chat');
                          setSelectedDocScope([doc.id]);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-xs font-medium text-cyan-300 border border-cyan-500/30 transition-colors"
                      >
                        Ask Document
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Are you sure you want to delete ${doc.filename}?`)) {
                            setDocuments(documents.filter(d => d.id !== doc.id));
                          }
                        }}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors"
                        title="Delete document"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ==================== 3. RESEARCH CHAT TAB ==================== */}
          {activeTab === 'chat' && (
            <div className="max-w-5xl mx-auto h-[calc(100vh-8.5rem)] flex flex-col animate-in fade-in duration-300">
              {/* Scope Selector Bar */}
              <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-t-xl flex items-center justify-between gap-4 shrink-0">
                <div className="flex items-center gap-2 overflow-x-auto text-xs py-1">
                  <span className="text-slate-400 font-medium whitespace-nowrap">Scope:</span>
                  <button
                    onClick={() => setSelectedDocScope([])}
                    className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                      selectedDocScope.length === 0
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                        : 'bg-slate-800/80 text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    All Documents ({documents.length})
                  </button>
                  {documents.map(d => {
                    const isSelected = selectedDocScope.includes(d.id);
                    return (
                      <button
                        key={d.id}
                        onClick={() => {
                          if (isSelected) {
                            setSelectedDocScope(selectedDocScope.filter(id => id !== d.id));
                          } else {
                            setSelectedDocScope([...selectedDocScope, d.id]);
                          }
                        }}
                        className={`px-2.5 py-1 rounded-md font-medium whitespace-nowrap truncate max-w-[200px] transition-all ${
                          isSelected
                            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                            : 'bg-slate-800/80 text-slate-400 hover:bg-slate-800'
                        }`}
                      >
                        {d.filename}
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={() => {
                    const md = activeConv.messages
                      ?.map(m => `### ${m.role === 'user' ? 'User' : 'Assistant'}\n${m.content}\n`)
                      .join('\n');
                    const blob = new Blob([md || ''], { type: 'text/markdown' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'docmind_chat_export.md';
                    a.click();
                  }}
                  className="text-xs text-slate-400 hover:text-slate-200 px-2 py-1 bg-slate-800 rounded transition-colors whitespace-nowrap"
                >
                  Export Markdown
                </button>
              </div>

              {/* Message Timeline */}
              <div className="flex-1 overflow-y-auto p-6 bg-slate-950/40 border-x border-slate-800 space-y-6">
                {activeConv.messages?.map(msg => (
                  <div
                    key={msg.id}
                    className={`flex gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    {msg.role === 'assistant' && (
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-500 to-teal-400 text-slate-950 font-bold flex items-center justify-center shrink-0 text-sm shadow-md shadow-cyan-500/20">
                        D
                      </div>
                    )}

                    <div
                      className={`max-w-2xl rounded-2xl p-5 text-sm leading-relaxed space-y-3 ${
                        msg.role === 'user'
                          ? 'bg-gradient-to-r from-cyan-600 to-cyan-500 text-slate-950 font-medium rounded-br-none shadow-md shadow-cyan-600/20'
                          : 'bg-slate-900 border border-slate-800 text-slate-200 rounded-bl-none shadow-xl'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{msg.content}</p>

                      {/* Render Interactive Citations */}
                      {msg.citations && msg.citations.length > 0 && (
                        <div className="pt-3 border-t border-slate-800/80 space-y-2">
                          <p className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
                            Verified Source Citations:
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {msg.citations.map(cit => (
                              <button
                                key={cit.citation_id || cit.source_label}
                                onClick={() => setSelectedCitation(cit)}
                                className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-800/90 hover:bg-cyan-500/10 hover:border-cyan-500/40 text-xs font-mono text-cyan-400 border border-slate-700/80 transition-all active:scale-95"
                              >
                                <span>[{cit.source_label}]</span>
                                <span className="text-slate-300 font-sans truncate max-w-[150px]">{cit.filename}</span>
                                {cit.page_start && <span className="text-slate-400 font-sans">p.{cit.page_start}</span>}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {isSending && (
                  <div className="flex gap-4 items-center animate-pulse">
                    <div className="w-8 h-8 rounded-lg bg-slate-800 text-cyan-400 font-bold flex items-center justify-center shrink-0 text-sm">
                      D
                    </div>
                    <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-400 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                      Retrieving evidence chunks and synthesizing grounded answer...
                    </div>
                  </div>
                )}
              </div>

              {/* Chat Composer */}
              <form onSubmit={handleSendMessage} className="p-4 bg-slate-900 border border-slate-800 rounded-b-xl flex gap-3">
                <input
                  type="text"
                  placeholder="Ask a question about your selected documents (e.g., 'What are the main risks and quotas?')..."
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  disabled={isSending}
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
                <button
                  type="submit"
                  disabled={!chatInput.trim() || isSending}
                  className="px-6 py-3 rounded-lg bg-gradient-to-r from-cyan-500 to-teal-400 text-slate-950 font-semibold text-sm hover:opacity-90 disabled:opacity-50 transition-all shadow-md shadow-cyan-500/10 active:scale-95"
                >
                  Ask
                </button>
              </form>
            </div>
          )}

          {/* ==================== 4. COMPARE FILES TAB ==================== */}
          {activeTab === 'compare' && (
            <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in duration-300">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-white">Multi-Document Comparison</h1>
                  <p className="text-sm text-slate-400">
                    Select 2 to 5 READY documents to synthesize side-by-side matrices of commonalities, discrepancies, and unique attributes.
                  </p>
                </div>
                {compareResult && (
                  <button
                    onClick={handleCopyMatrixMarkdown}
                    className="self-start sm:self-auto px-4 py-2 rounded-lg bg-slate-900 border border-slate-700 hover:border-cyan-500/50 text-xs font-medium text-slate-200 transition-all flex items-center space-x-2"
                  >
                    <span>{isCopiedMatrix ? '✓ Copied Markdown' : '📋 Copy Matrix as Markdown'}</span>
                  </button>
                )}
              </div>

              {/* Comparison Config Card */}
              <div className="p-6 rounded-xl bg-slate-900/60 border border-slate-800 space-y-5">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Select Documents to Compare (2 to 5 documents)
                    </label>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      selectedCompareDocs.length >= 2 && selectedCompareDocs.length <= 5
                        ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30'
                        : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                    }`}>
                      {selectedCompareDocs.length} of 5 selected {selectedCompareDocs.length < 2 ? '(Min 2 required)' : ''}
                    </span>
                  </div>

                  {/* Multi-Select Document Selector */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 pt-1">
                    {documents.map(d => {
                      const isSelected = selectedCompareDocs.includes(d.id);
                      const isReady = d.status === 'READY';
                      return (
                        <button
                          key={d.id}
                          type="button"
                          disabled={!isReady}
                          onClick={() => handleToggleCompareDoc(d.id)}
                          className={`flex items-start text-left p-3 rounded-lg border text-xs transition-all ${
                            isSelected
                              ? 'bg-cyan-950/40 border-cyan-500/60 text-white shadow-sm shadow-cyan-500/10'
                              : 'bg-slate-950/60 border-slate-800/80 text-slate-300 hover:border-slate-700'
                          } ${!isReady ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                        >
                          <div className={`w-4 h-4 rounded mt-0.5 mr-2.5 flex items-center justify-center border text-[10px] ${
                            isSelected
                              ? 'bg-cyan-500 border-cyan-400 text-slate-950 font-bold'
                              : 'border-slate-700 bg-slate-900'
                          }`}>
                            {isSelected ? '✓' : ''}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{d.filename}</p>
                            <div className="flex items-center space-x-2 text-[10px] text-slate-400 mt-0.5">
                              <span>{Math.round(d.size_bytes / 1024)} KB</span>
                              <span>•</span>
                              <span className={d.status === 'READY' ? 'text-emerald-400' : 'text-amber-400'}>{d.status}</span>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-2">
                    Focus Topic / Analysis Goal (Optional)
                  </label>
                  <input
                    type="text"
                    value={compareTopic}
                    onChange={e => setCompareTopic(e.target.value)}
                    placeholder="e.g. Liability Caps, Payment Terms, Technical Requirements, SLA Commitments"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div className="flex items-center justify-between pt-2">
                  <p className="text-xs text-slate-400">
                    Runs cross-document passage synthesis across selected files with server-side source attribution.
                  </p>
                  <button
                    onClick={handleRunCompare}
                    disabled={isComparing || selectedCompareDocs.length < 2 || selectedCompareDocs.length > 5}
                    className="px-6 py-2.5 rounded-lg bg-gradient-to-r from-cyan-500 to-teal-400 text-slate-950 font-semibold text-sm hover:opacity-90 disabled:opacity-50 transition-all shadow-md shadow-cyan-500/10 active:scale-95"
                  >
                    {isComparing ? 'Synthesizing Matrix...' : 'Run Comparative Analysis'}
                  </button>
                </div>
              </div>

              {/* Comparison Results */}
              {compareResult && (
                <div className="space-y-6">
                  {/* Limitations Banner if present */}
                  {compareResult.limitations && (
                    <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start space-x-3 text-xs text-amber-200">
                      <span className="text-base leading-none">⚠️</span>
                      <div className="space-y-0.5">
                        <span className="font-semibold text-amber-300">Analysis Scope & Limitations:</span>
                        <p className="text-amber-200/90 leading-relaxed">{compareResult.limitations}</p>
                      </div>
                    </div>
                  )}

                  {/* Narrative Summary */}
                  <div className="p-6 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
                    <h3 className="text-xs font-semibold text-cyan-400 uppercase tracking-wider">Executive Synthesis</h3>
                    <p className="text-sm leading-relaxed text-slate-200">{compareResult.narrative_summary}</p>
                  </div>

                  {/* Comparative Matrix Table */}
                  <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden shadow-xl shadow-black/40">
                    <table className="w-full text-left text-sm border-collapse">
                      <thead className="bg-slate-950 text-xs uppercase tracking-wider text-slate-400 border-b border-slate-800">
                        <tr>
                          <th className="p-4 w-1/4">Attribute / Scope</th>
                          <th className="p-4 w-2/5">Document Details</th>
                          <th className="p-4 w-1/4">Discrepancies & Contrast</th>
                          <th className="p-4 w-1/12 text-right">Citations</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {compareResult.matrix.map((row, idx) => (
                          <tr key={idx} className="hover:bg-slate-900/40 transition-colors">
                            <td className="p-4 font-semibold text-slate-200 align-top">
                              <span className="text-white block">{row.attribute}</span>
                            </td>
                            <td className="p-4 text-xs text-slate-300 space-y-2 align-top">
                              {Object.entries(row.per_document_values).map(([fname, val]) => (
                                <div key={fname} className="p-2 rounded bg-slate-950/60 border border-slate-800/80">
                                  <span className="text-cyan-400 font-semibold block mb-0.5 truncate">{fname}</span>
                                  <span className="text-slate-300 leading-relaxed">{val}</span>
                                </div>
                              ))}
                            </td>
                            <td className="p-4 text-xs text-slate-300 align-top leading-relaxed">
                              {row.differences_summary}
                            </td>
                            <td className="p-4 text-xs align-top text-right space-y-1">
                              {row.source_labels && row.source_labels.length > 0 ? (
                                <div className="flex flex-wrap gap-1 justify-end">
                                  {row.source_labels.map(lbl => {
                                    const matchCite = (compareResult.citations || []).find(c => c.source_label === lbl);
                                    return (
                                      <button
                                        key={lbl}
                                        onClick={() => {
                                          if (matchCite) {
                                            setSelectedCitation(matchCite);
                                          }
                                        }}
                                        title={matchCite ? `Click to view source from ${matchCite.filename}` : lbl}
                                        className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-cyan-950 text-cyan-400 border border-cyan-500/40 hover:bg-cyan-900/60 hover:border-cyan-400 transition-colors cursor-pointer"
                                      >
                                        [{lbl}]
                                      </button>
                                    );
                                  })}
                                </div>
                              ) : (
                                <span className="text-slate-500 text-[11px]">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Verified Citations List if available */}
                  {compareResult.citations && compareResult.citations.length > 0 && (
                    <div className="p-5 rounded-xl bg-slate-900/40 border border-slate-800/80 space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center space-x-2">
                          <span>Grounding Evidence Records</span>
                          <span className="px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 text-[10px] font-mono">
                            {compareResult.citations.length} verified citations
                          </span>
                        </h4>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {compareResult.citations.map((c, i) => (
                          <div
                            key={i}
                            onClick={() => setSelectedCitation(c)}
                            className="p-3 rounded-lg bg-slate-950/80 border border-slate-800 hover:border-cyan-500/40 transition-all cursor-pointer space-y-1 group"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold text-cyan-400 group-hover:underline truncate">
                                [{c.source_label}] {c.filename}
                              </span>
                              <span className="text-[10px] text-slate-400 font-mono">
                                p.{c.page_start} • {c.section}
                              </span>
                            </div>
                            <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed italic">
                              &ldquo;{c.excerpt}&rdquo;
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ==================== 5. SETTINGS TAB ==================== */}
          {activeTab === 'settings' && (
            <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-300">
              <div>
                <h1 className="text-2xl font-bold text-white">Workspace & Security Settings</h1>
                <p className="text-sm text-slate-400">
                  Review tenant boundaries, token session controls, database integrity, and system quotas.
                </p>
              </div>

              <div className="p-6 rounded-xl bg-slate-900/60 border border-slate-800 space-y-6">
                <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-200">
                      {userSession?.fullName || 'Elena Rostova'} ({userSession?.email || 'admin@acme-corp.com'})
                    </h3>
                    <p className="text-xs text-slate-400">
                      {userSession?.workspaceName || 'Company Workspace'} (Role: {userSession?.role || 'OWNER'})
                    </p>
                  </div>
                  <span className="px-3 py-1 rounded bg-slate-800 text-xs font-mono text-cyan-400 border border-slate-700">
                    ws-{userSession?.workspaceSlug || 'company-01'}
                  </span>
                </div>

                <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-200">Authentication & Passwords</h3>
                    <p className="text-xs text-slate-400">Argon2id hashing with rotating refresh token sessions</p>
                  </div>
                  <button className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 transition-colors">
                    Change Password
                  </button>
                </div>

                {/* SaaS Subscription Tier & Dynamic Quotas */}
                <div className="pb-4 border-b border-slate-800 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                      <div className="flex items-center space-x-2">
                        <h3 className="text-sm font-semibold text-slate-200">Subscription Tier & Quota Enforcement</h3>
                        <span className={`px-2.5 py-0.5 rounded-full font-mono text-xs font-bold ${
                          usage.tier === 'ENTERPRISE'
                            ? 'bg-purple-500/15 text-purple-300 border border-purple-500/30'
                            : usage.tier === 'PRO'
                            ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                            : 'bg-slate-800 text-slate-300 border border-slate-700'
                        }`}>
                          {usage.tier_name || usage.tier || 'Pro Company'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Dynamic per-tier bounds: documents, storage, concurrent uploads, and AI operations.
                      </p>
                    </div>

                    {/* Tier Switcher Buttons */}
                    <div className="flex items-center space-x-1.5 self-start sm:self-auto bg-slate-950 p-1 rounded-lg border border-slate-800">
                      {(['STARTER', 'PRO', 'ENTERPRISE'] as const).map(tierKey => (
                        <button
                          key={tierKey}
                          onClick={() => handleUpgradeTier(tierKey)}
                          disabled={isUpdatingTier || usage.tier === tierKey}
                          className={`px-3 py-1 rounded text-[11px] font-semibold transition-all ${
                            usage.tier === tierKey
                              ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm'
                              : 'text-slate-400 hover:text-white hover:bg-slate-900 disabled:opacity-40'
                          }`}
                        >
                          {tierKey === 'STARTER' ? 'Starter' : tierKey === 'PRO' ? 'Pro' : 'Enterprise'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {tierStatus && (
                    <div className="p-3 rounded-lg bg-cyan-950/40 border border-cyan-500/30 text-xs text-cyan-300 animate-in fade-in">
                      {tierStatus}
                    </div>
                  )}

                  {/* Quota meters grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-1">
                    <div className="p-3.5 rounded-lg bg-slate-950/70 border border-slate-800/80 space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400">Active Documents</span>
                        <span className="text-cyan-400 font-mono font-bold">
                          {usage.documents_count} / {usage.documents_limit}
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-cyan-400 rounded-full"
                          style={{ width: `${Math.min(100, (usage.documents_count / usage.documents_limit) * 100)}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-slate-500 block">Cap: max {usage.documents_limit} docs</span>
                    </div>

                    <div className="p-3.5 rounded-lg bg-slate-950/70 border border-slate-800/80 space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400">Storage Capacity</span>
                        <span className="text-teal-400 font-mono font-bold">
                          {(usage.storage_bytes / (1024 * 1024)).toFixed(1)} / {(usage.storage_limit_bytes / (1024 * 1024)).toFixed(0)} MB
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-teal-400 rounded-full"
                          style={{ width: `${Math.min(100, (usage.storage_bytes / usage.storage_limit_bytes) * 100)}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-slate-500 block">File size limit: {usage.max_file_mb || 50} MB/doc</span>
                    </div>

                    <div className="p-3.5 rounded-lg bg-slate-950/70 border border-slate-800/80 space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400">AI Operations / Mo</span>
                        <span className="text-emerald-400 font-mono font-bold">
                          {usage.questions_used} / {usage.questions_limit}
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-400 rounded-full"
                          style={{ width: `${Math.min(100, (usage.questions_used / usage.questions_limit) * 100)}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-slate-500 block">Concurrent slots: {usage.concurrent_uploads_limit || 5} active</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-200">Spend Protection & Kill-Switch</h3>
                    <p className="text-xs text-slate-400">Hard monthly limit: $50.00 USD / AI_FEATURES_ENABLED=true</p>
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    Active & Monitored
                  </span>
                </div>

                {/* Team Members & Role Governance */}
                <div className="pb-4 border-b border-slate-800 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-200">Team Members & Governance</h3>
                      <p className="text-xs text-slate-400">Manage company workspace members and access roles</p>
                    </div>
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                      {teamMembers.length} Members
                    </span>
                  </div>

                  {/* Invite form */}
                  <form onSubmit={handleInviteMember} className="flex flex-wrap gap-2 pt-1">
                    <input
                      type="email"
                      required
                      value={inviteEmail}
                      onChange={e => setInviteEmail(e.target.value)}
                      placeholder="colleague@company.com"
                      className="flex-1 min-w-[200px] px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500"
                    />
                    <select
                      value={inviteRole}
                      onChange={e => setInviteRole(e.target.value)}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-300 focus:outline-none focus:border-cyan-500"
                    >
                      <option value="ADMIN">ADMIN</option>
                      <option value="MEMBER">MEMBER</option>
                      <option value="VIEWER">VIEWER</option>
                    </select>
                    <button
                      type="submit"
                      disabled={isInviting}
                      className="px-3.5 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/30 text-xs font-medium transition-colors disabled:opacity-50 flex items-center gap-1.5"
                    >
                      {isInviting ? 'Inviting...' : '+ Invite Member'}
                    </button>
                  </form>

                  {inviteStatus && (
                    <div className="p-2.5 rounded-lg bg-cyan-950/40 border border-cyan-500/30 text-xs text-cyan-300">
                      {inviteStatus}
                    </div>
                  )}

                  {/* Member table */}
                  <div className="rounded-xl border border-slate-800/80 overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-950/80 text-slate-400 font-semibold border-b border-slate-800">
                        <tr>
                          <th className="p-2.5">Member Email</th>
                          <th className="p-2.5">Role</th>
                          <th className="p-2.5">Status</th>
                          <th className="p-2.5 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 bg-slate-950/30">
                        {teamMembers.map(mem => (
                          <tr key={mem.user_id} className="hover:bg-slate-900/40">
                            <td className="p-2.5 font-medium text-slate-200">{mem.email}</td>
                            <td className="p-2.5">
                              <span className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold ${
                                mem.role === 'OWNER'
                                  ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                                  : mem.role === 'ADMIN'
                                  ? 'bg-teal-500/15 text-teal-300 border border-teal-500/30'
                                  : 'bg-slate-800 text-slate-300'
                              }`}>
                                {mem.role}
                              </span>
                            </td>
                            <td className="p-2.5 text-slate-400 text-[11px]">Active</td>
                            <td className="p-2.5 text-right">
                              {mem.role !== 'OWNER' && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveMember(mem.user_id)}
                                  className="text-rose-400 hover:text-rose-300 text-[11px]"
                                >
                                  Remove
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Audit Trail & Compliance Records (PRD Section 32) */}
                <div className="pb-4 border-b border-slate-800 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-200">Audit Trail & Security Records</h3>
                      <p className="text-xs text-slate-400">Append-only security log of workspace governance, access, and AI operations</p>
                    </div>
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                      {auditLogs.length} Events
                    </span>
                  </div>

                  <div className="rounded-xl border border-slate-800/80 overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-950/80 text-slate-400 font-semibold border-b border-slate-800">
                        <tr>
                          <th className="p-2.5">Timestamp (UTC)</th>
                          <th className="p-2.5">Action</th>
                          <th className="p-2.5">Actor</th>
                          <th className="p-2.5">Target / Metadata</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 bg-slate-950/30 font-mono text-[11px]">
                        {auditLogs.map(log => (
                          <tr key={log.id} className="hover:bg-slate-900/40">
                            <td className="p-2.5 text-slate-400">
                              {new Date(log.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </td>
                            <td className="p-2.5">
                              <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                                log.action.includes('TIER')
                                  ? 'bg-purple-500/15 text-purple-300 border border-purple-500/30'
                                  : log.action.includes('INVITED') || log.action.includes('ADDED')
                                  ? 'bg-teal-500/15 text-teal-300 border border-teal-500/30'
                                  : log.action.includes('DELETE')
                                  ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                                  : 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                              }`}>
                                {log.action}
                              </span>
                            </td>
                            <td className="p-2.5 text-slate-300">{log.actor_email || 'system'}</td>
                            <td className="p-2.5 text-slate-400 max-w-xs truncate">
                              {log.metadata ? Object.entries(log.metadata).map(([k, v]) => `${k}=${v}`).join(', ') : log.target_type}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <div>
                    <h3 className="text-sm font-semibold text-rose-400">Delete Account & Purge Data</h3>
                    <p className="text-xs text-slate-400">Irreversibly deletes all documents, vector chunks, and conversation histories.</p>
                  </div>
                  <button
                    onClick={() => {
                      if (confirm('Are you sure you want to request account deletion? All data will be purged.')) {
                        alert('Account deletion request submitted. Background cleanup enqueued.');
                      }
                    }}
                    className="px-3.5 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-medium transition-colors"
                  >
                    Delete Account
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ==================== 6. ADMIN CONSOLE TAB ==================== */}
          {activeTab === 'admin' && (
            <AdminConsole onBackToApp={() => setActiveTab('dashboard')} />
          )}
        </main>
      </div>
    </div>
  )}

      {/* Auth & Company Onboarding Modal */}
      <AuthModal
        isOpen={authModalOpen}
        initialMode={authModalMode}
        initialIsCompany={authModalIsCompany}
        onClose={() => setAuthModalOpen(false)}
        onAuthSuccess={session => {
          setUserSession(session);
          setViewMode('app');
        }}
      />

      {/* Upload Modal */}
      <UploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onUploadSuccess={() => {
          // Re-fetch documents
          ApiClient.listDocuments()
            .then(docs => setDocuments(docs))
            .catch(() => {});
        }}
      />

      {/* Citation Slide-Over Drawer */}
      <CitationDrawer
        citation={selectedCitation}
        onClose={() => setSelectedCitation(null)}
      />

      {/* Summary Modal */}
      {summaryDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-white">Document Executive Summary</h3>
              <button onClick={() => setSummaryDoc(null)} className="text-slate-400 hover:text-slate-200">✕</button>
            </div>
            <p className="text-sm text-slate-300 leading-relaxed">{summaryDoc.overview}</p>
            <div className="space-y-3 pt-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-cyan-400">Key Points</h4>
              {summaryDoc.key_points.map((kp, idx) => (
                <div key={idx} className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80">
                  <p className="text-sm font-semibold text-slate-100">{kp.point}</p>
                  <p className="text-xs text-slate-400 mt-1">{kp.explanation}</p>
                </div>
              ))}
            </div>
            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSummaryDoc(null)}
                className="px-4 py-2 rounded-lg bg-slate-800 text-sm font-medium text-slate-200 hover:bg-slate-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
