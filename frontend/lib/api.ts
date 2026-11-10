export interface AdminOverviewDTO {
  total_workspaces: number;
  total_users: number;
  total_documents: number;
  total_chunks: number;
  total_storage_bytes: number;
  total_questions: number;
  active_tiers: Record<string, number>;
  document_status_breakdown: Record<string, number>;
  worker_health: string;
  cloudflare_r2_status: string;
  gemini_api_status: string;
  smtp_status: string;
}

export interface AdminWorkspaceSummaryDTO {
  id: string;
  name: string;
  slug: string;
  tier: string;
  created_at: string;
  owner_email?: string;
  member_count: number;
  document_count: number;
  storage_bytes: number;
}

export interface AdminDocumentSummaryDTO {
  id: string;
  workspace_id: string;
  workspace_name: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  status: string;
  page_count: number;
  created_at: string;
  error_code?: string;
  error_message?: string;
}

export interface AdminSystemDiagnosticsDTO {
  app_env: string;
  storage_provider: string;
  r2_bucket: string;
  llm_provider: string;
  llm_model: string;
  embedding_model: string;
  embedding_dimension: number;
  email_enabled: boolean;
  smtp_host: string;
  smtp_from_email: string;
  worker_concurrency: number;
  public_app_url: string;
  api_base_url: string;
}

export interface DocumentDTO {
  id: string;
  workspace_id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  checksum_short: string;
  status: 'UPLOADING' | 'QUEUED' | 'PROCESSING' | 'READY' | 'FAILED' | 'DELETING';
  page_count: number;
  processing_version: number;
  created_at: string;
  updated_at: string;
  ready_at?: string;
  tags: string[];
  safe_error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
}

export interface CitationDTO {
  citation_id: string;
  document_id: string;
  filename: string;
  page_start?: number;
  page_end?: number;
  section?: string;
  excerpt: string;
  source_label: string;
  is_source_deleted?: boolean;
}

export interface MessageDTO {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  status: string;
  citations: CitationDTO[];
  suggested_followups?: string[];
  created_at: string;
}

export interface ConversationDTO {
  id: string;
  workspace_id: string;
  title: string;
  scope_mode: string;
  selected_doc_ids: string[];
  created_at: string;
  updated_at: string;
  messages?: MessageDTO[];
}

export interface UsageSummaryDTO {
  documents_count: number;
  documents_limit: number;
  storage_bytes: number;
  storage_limit_bytes: number;
  questions_used: number;
  questions_limit: number;
  billing_period_reset_date: string;
  ai_features_enabled: boolean;
  tier?: string;
  tier_name?: string;
  max_file_mb?: number;
  max_pages?: number;
  concurrent_uploads_limit?: number;
  max_members_limit?: number;
}

export interface TierSpecDTO {
  tier: string;
  name: string;
  max_docs: number;
  max_storage_mb: number;
  monthly_questions: number;
  max_file_mb: number;
  max_pages: number;
  concurrent_uploads: number;
  max_members: number;
  priority: string;
  features: string[];
}

export interface AuditEventDTO {
  id: string;
  workspace_id: string;
  actor_user_id?: string;
  actor_email?: string;
  action: string;
  target_type: string;
  target_id?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface CompareMatrixRow {
  attribute: string;
  per_document_values: Record<string, string>;
  differences_summary: string;
  source_labels?: string[];
}

export interface CompareResponse {
  document_ids: string[];
  matrix: CompareMatrixRow[];
  narrative_summary: string;
  citations?: CitationDTO[];
  limitations?: string;
}

export interface ExtractionResponse {
  document_id: string;
  preset_id: string;
  extracted_data: Record<string, unknown>;
  confidence_note: string;
  citations: CitationDTO[];
}

export interface DocumentSummaryResponse {
  document_id: string;
  overview: string;
  sections?: Array<{ title: string; content: string }>;
  key_points: Array<{ point: string; explanation: string; source_labels?: string[] }>;
  caveats?: string;
  is_cached?: boolean;
}

export interface WorkspaceDetailDTO {
  id: string;
  name: string;
  slug: string;
  tier?: string;
  role: string;
  created_at: string;
  member_count: number;
}

export interface WorkspaceMemberDTO {
  user_id: string;
  email: string;
  role: string;
  joined_at: string;
}

export interface InviteMemberResponse {
  workspace_id: string;
  email: string;
  role: string;
  status: string;
  message: string;
}

/**
 * Normalizes an API base URL ensuring no trailing slashes and appending /api/v1 if omitted.
 */
export function normalizeApiBase(url: string): string {
  let trimmed = (url || '').trim().replace(/\/+$/, '');
  if (!trimmed) return '/api/v1';
  if (!trimmed.endsWith('/api/v1')) {
    trimmed = `${trimmed}/api/v1`;
  }
  return trimmed;
}

/**
 * Dynamically resolves the API base URL in priority order:
 * 1. Runtime URL search query parameter: ?api_base_url=... or ?api_url=...
 * 2. Runtime localStorage override: 'docmind_api_base_url'
 * 3. Build-time environment variable: NEXT_PUBLIC_API_BASE_URL
 * 4. Production browser fallback: same-origin `${window.location.origin}/api/v1`
 * 5. Local development fallback: 'http://localhost:8000/api/v1'
 */
export function getApiBase(): string {
  if (typeof window !== 'undefined') {
    // 1. Query parameter override (?api_base_url=... or ?api_url=...)
    try {
      const params = new URLSearchParams(window.location.search);
      const queryApi = params.get('api_base_url') || params.get('api_url');
      if (queryApi && queryApi.trim()) {
        const norm = normalizeApiBase(queryApi);
        localStorage.setItem('docmind_api_base_url', norm);
        return norm;
      }
    } catch {
      // ignore
    }

    // 2. Stored user override
    try {
      const stored = localStorage.getItem('docmind_api_base_url');
      if (stored && stored.trim()) {
        return normalizeApiBase(stored);
      }
    } catch {
      // ignore
    }
  }

  // 3. Build-time environment variable
  const envUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (envUrl && envUrl.trim()) {
    // Detect HTTPS mixed content block if env was baked with http://localhost
    if (
      typeof window !== 'undefined' &&
      window.location.protocol === 'https:' &&
      (envUrl.includes('localhost') || envUrl.includes('127.0.0.1'))
    ) {
      console.warn(
        `[DocMind API] Build-time NEXT_PUBLIC_API_BASE_URL ("${envUrl}") cannot be fetched over HTTPS from ${window.location.origin}. Falling back to same-origin /api/v1.`
      );
      return `${window.location.origin}/api/v1`;
    }
    return normalizeApiBase(envUrl);
  }

  // 4. Production browser fallback
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    const isLocal = host === 'localhost' || host === '127.0.0.1';
    if (!isLocal) {
      return `${window.location.origin}/api/v1`;
    }
  }

  return 'http://localhost:8000/api/v1';
}

/** Error thrown for non-2xx API responses. `status` lets the UI react to 401 (expired session), 402/429 (quota), etc. */
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

function describeApiError(body: unknown, status: number): string {
  const b = (body ?? {}) as { detail?: unknown; title?: unknown };
  if (typeof b.detail === 'string') return b.detail;
  if (Array.isArray(b.detail)) {
    const msgs = b.detail
      .map(d => (d && typeof d === 'object' && 'msg' in d ? String((d as { msg: unknown }).msg) : ''))
      .filter(Boolean);
    if (msgs.length) return msgs.join('; ');
  }
  if (typeof b.title === 'string') return b.title;
  return `API error ${status}`;
}

export class ApiClient {
  private static token: string | null = null;
  private static activeWorkspaceId: string | null = null;

  static setActiveWorkspaceId(id: string | null) {
    this.activeWorkspaceId = id;
    if (typeof window !== 'undefined') {
      if (id) {
        localStorage.setItem('docmind_active_ws_id', id);
      } else {
        localStorage.removeItem('docmind_active_ws_id');
      }
    }
  }

  static getActiveWorkspaceId(): string | null {
    if (this.activeWorkspaceId) return this.activeWorkspaceId;
    if (typeof window !== 'undefined') {
      return localStorage.getItem('docmind_active_ws_id');
    }
    return null;
  }

  static setToken(token: string) {
    this.token = token;
    if (typeof window !== 'undefined') {
      localStorage.setItem('docmind_token', token);
    }
  }

  static getToken(): string | null {
    if (this.token) return this.token;
    if (typeof window !== 'undefined') {
      return localStorage.getItem('docmind_token');
    }
    return null;
  }

  static getBaseUrl(): string {
    return getApiBase();
  }

  static setBaseUrl(url: string): void {
    if (typeof window !== 'undefined') {
      if (url && url.trim()) {
        localStorage.setItem('docmind_api_base_url', normalizeApiBase(url));
      } else {
        localStorage.removeItem('docmind_api_base_url');
      }
    }
  }

  static resetBaseUrl(): void {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('docmind_api_base_url');
    }
  }

  static async testConnection(targetUrl?: string): Promise<{ ok: boolean; status?: number; error?: string }> {
    const base = targetUrl ? normalizeApiBase(targetUrl) : getApiBase();
    try {
      const rootUrl = base.replace(/\/api\/v1\/?$/, '');
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      try {
        const res = await fetch(`${rootUrl}/health/ready`, { method: 'GET', signal: controller.signal });
        clearTimeout(timer);
        if (res && (res.ok || res.status < 500)) {
          return { ok: true, status: res.status };
        }
      } catch {
        // try root
      }
      const controller2 = new AbortController();
      const timer2 = setTimeout(() => controller2.abort(), 6000);
      const rootRes = await fetch(`${rootUrl}/`, { method: 'GET', signal: controller2.signal });
      clearTimeout(timer2);
      if (rootRes && (rootRes.ok || rootRes.status < 500)) {
        return { ok: true, status: rootRes.status };
      }
      return { ok: false, error: 'Server did not respond with a healthy status.' };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: msg };
    }
  }

  static async ensureSession(): Promise<string> {
    const existing = this.getToken();
    if (existing) return existing;
    const base = getApiBase();
    try {
      const res = await fetch(`${base}/auth/demo-login`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.access_token) {
          this.setToken(data.access_token);
          return data.access_token;
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[DocMind API] Auto-session initialization failed (${base}):`, msg);
    }
    return '';
  }

  private static async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    let token = this.getToken();
    if (!token && !endpoint.startsWith('/auth/')) {
      token = await this.ensureSession();
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const wsId = this.getActiveWorkspaceId();
    if (wsId) {
      headers['X-Workspace-ID'] = wsId;
    }

    const apiBase = getApiBase();
    const url = `${apiBase}${endpoint}`;

    try {
      const res = await fetch(url, {
        ...options,
        headers,
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new ApiError(describeApiError(errorData, res.status), res.status);
      }

      if (res.status === 204) {
        return {} as T;
      }

      return await res.json();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[DocMind API] Request to ${url} failed:`, msg);
      throw err;
    }
  }

  static async register(email: string, password: string): Promise<{ id: string; email: string; active_workspace: { id: string; name: string; slug: string; role: string } }> {
    return this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  static async verifyEmail(token: string): Promise<{ message: string }> {
    return this.request('/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
  }

  static async forgotPassword(email: string): Promise<{ message: string }> {
    return this.request('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }

  static async resetPassword(token: string, newPassword: string): Promise<void> {
    return this.request('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, new_password: newPassword }),
    });
  }

  static async login(email: string, password: string): Promise<{ access_token: string; token_type: string; expires_in: number }> {
    const res = await this.request<{ access_token: string; token_type: string; expires_in: number }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (res.access_token) {
      this.setToken(res.access_token);
    }
    return res;
  }

  static async logout(): Promise<void> {
    try {
      await this.request('/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    this.token = null;
    if (typeof window !== 'undefined') {
      localStorage.removeItem('docmind_token');
    }
  }

  static async listWorkspaces(): Promise<WorkspaceDetailDTO[]> {
    return this.request<WorkspaceDetailDTO[]>('/workspaces');
  }

  static async createCompanyWorkspace(name: string, slug?: string): Promise<WorkspaceDetailDTO> {
    return this.request<WorkspaceDetailDTO>('/workspaces/company', {
      method: 'POST',
      body: JSON.stringify({ name, slug }),
    });
  }

  static async getWorkspaceMembers(workspaceId: string): Promise<WorkspaceMemberDTO[]> {
    return this.request<WorkspaceMemberDTO[]>(`/workspaces/${workspaceId}/members`);
  }

  static async inviteWorkspaceMember(workspaceId: string, email: string, role: string = 'MEMBER'): Promise<InviteMemberResponse> {
    return this.request<InviteMemberResponse>(`/workspaces/${workspaceId}/invites`, {
      method: 'POST',
      body: JSON.stringify({ email, role }),
    });
  }

  static async updateMemberRole(workspaceId: string, userId: string, role: string): Promise<WorkspaceMemberDTO> {
    return this.request<WorkspaceMemberDTO>(`/workspaces/${workspaceId}/members/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    });
  }

  static async removeWorkspaceMember(workspaceId: string, userId: string): Promise<void> {
    return this.request<void>(`/workspaces/${workspaceId}/members/${userId}`, {
      method: 'DELETE',
    });
  }

  static async getUsage(): Promise<UsageSummaryDTO> {
    return this.request<UsageSummaryDTO>('/usage');
  }

  static async getDashboard() {
    return this.request<{
      usage: UsageSummaryDTO;
      recent_documents: DocumentDTO[];
      recent_conversations: ConversationDTO[];
    }>('/dashboard/summary');
  }

  static async listDocuments(status?: string, search?: string): Promise<DocumentDTO[]> {
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (search) params.append('q', search);
    return this.request<DocumentDTO[]>(`/documents?${params.toString()}`);
  }

  static async createUploadIntent(filename: string, declared_mime: string, size_bytes: number, checksum_sha256: string) {
    return this.request<{
      document_id: string;
      upload_url: string;
      method: string;
      headers: Record<string, string>;
      expires_at: string;
    }>('/documents/upload-intents', {
      method: 'POST',
      body: JSON.stringify({ filename, declared_mime, size_bytes, checksum_sha256 }),
    });
  }

  static async completeUpload(document_id: string) {
    return this.request<{ document_id: string; status: string; job_id: string }>(`/documents/${document_id}/complete`, {
      method: 'POST',
    });
  }

  static async deleteDocument(document_id: string): Promise<void> {
    return this.request<void>(`/documents/${document_id}`, { method: 'DELETE' });
  }

  static async getDownloadUrl(document_id: string): Promise<{ download_url: string }> {
    return this.request<{ download_url: string }>(`/documents/${document_id}/download-url`, { method: 'POST' });
  }

  static async retryDocument(document_id: string) {
    return this.request(`/documents/${document_id}/retry`, { method: 'POST' });
  }

  static async getDocumentSummary(document_id: string): Promise<DocumentSummaryResponse> {
    return this.request<DocumentSummaryResponse>(`/documents/${document_id}/summary`);
  }

  static async listConversations(): Promise<ConversationDTO[]> {
    return this.request<ConversationDTO[]>('/conversations');
  }

  static async getConversation(id: string): Promise<ConversationDTO> {
    return this.request<ConversationDTO>(`/conversations/${id}`);
  }

  static async createConversation(title?: string, scope_mode: string = 'all', selected_doc_ids: string[] = []): Promise<ConversationDTO> {
    return this.request<ConversationDTO>('/conversations', {
      method: 'POST',
      body: JSON.stringify({ title, scope_mode, selected_doc_ids }),
    });
  }

  static isUUID(str: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
  }

  static async sendMessage(conversation_id: string, content: string, document_ids?: string[]) {
    let targetConvId = conversation_id;
    if (!this.isUUID(targetConvId)) {
      const conv = await this.createConversation('DocMind Research Chat');
      targetConvId = conv.id;
    }

    return this.request<{
      message_id: string;
      role: string;
      content: string;
      insufficient_evidence: boolean;
      citations: CitationDTO[];
      suggested_followups: string[];
      created_at: string;
    }>(`/conversations/${targetConvId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content, document_ids }),
    });
  }

  static async compareDocuments(document_ids: string[], focus_topic?: string): Promise<CompareResponse> {
    return this.request<CompareResponse>('/documents/compare', {
      method: 'POST',
      body: JSON.stringify({ document_ids, focus_topic }),
    });
  }

  static async extractPreset(document_id: string, preset_id: string): Promise<ExtractionResponse> {
    return this.request<ExtractionResponse>(`/documents/${document_id}/extract`, {
      method: 'POST',
      body: JSON.stringify({ preset_id }),
    });
  }

  static async updateWorkspaceTier(workspaceId: string, tier: string): Promise<WorkspaceDetailDTO> {
    return this.request<WorkspaceDetailDTO>(`/workspaces/${workspaceId}/tier`, {
      method: 'PATCH',
      body: JSON.stringify({ tier }),
    });
  }

  static async getWorkspaceAuditLogs(workspaceId: string, limit: number = 50): Promise<AuditEventDTO[]> {
    return this.request<AuditEventDTO[]>(`/workspaces/${workspaceId}/audit-logs?limit=${limit}`);
  }

  static async getTiers(): Promise<TierSpecDTO[]> {
    return this.request<TierSpecDTO[]>('/tiers');
  }

  // Admin Platform Methods
  static async getAdminOverview(): Promise<AdminOverviewDTO> {
    return this.request<AdminOverviewDTO>('/admin/overview');
  }

  static async getAdminWorkspaces(): Promise<AdminWorkspaceSummaryDTO[]> {
    return this.request<AdminWorkspaceSummaryDTO[]>('/admin/workspaces');
  }

  static async updateAdminWorkspaceTier(workspaceId: string, tier: string): Promise<AdminWorkspaceSummaryDTO> {
    return this.request<AdminWorkspaceSummaryDTO>(`/admin/workspaces/${workspaceId}/tier`, {
      method: 'PATCH',
      body: JSON.stringify({ tier }),
    });
  }

  static async getAdminDocuments(status?: string): Promise<AdminDocumentSummaryDTO[]> {
    const query = status ? `?status=${encodeURIComponent(status)}` : '';
    return this.request<AdminDocumentSummaryDTO[]>(`/admin/documents${query}`);
  }

  static async retryAdminDocument(documentId: string): Promise<{ message: string; job_id: string }> {
    return this.request<{ message: string; job_id: string }>(`/admin/documents/${documentId}/retry`, {
      method: 'POST',
    });
  }

  static async getAdminAuditLogs(limit: number = 100): Promise<AuditEventDTO[]> {
    return this.request<AuditEventDTO[]>(`/admin/audit-logs?limit=${limit}`);
  }

  static async getAdminSystemDiagnostics(): Promise<AdminSystemDiagnosticsDTO> {
    return this.request<AdminSystemDiagnosticsDTO>('/admin/system');
  }
}
