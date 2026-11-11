export interface AdminOverviewDTO {
  total_workspaces: number;
  total_users: number;
  total_documents: number;
  total_chunks: number;
  total_storage_bytes: number;
  total_questions: number;
  monthly_ai_cost_usd?: number;
  pending_jobs?: number;
  failed_jobs?: number;
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
  monthly_ai_cost_usd?: number;
}

export interface AdminJobSummaryDTO {
  id: string;
  workspace_id: string;
  workspace_name: string;
  job_type: string;
  status: string;
  attempts: number;
  max_attempts: number;
  last_error?: string;
  created_at: string;
  updated_at: string;
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

export interface AdminUserSummaryDTO {
  id: string;
  email: string;
  status: string;
  verified: boolean;
  is_superadmin: boolean;
  workspace_count: number;
  created_at: string;
}

export interface PendingJoinRequestDTO {
  workspace_id: string;
  company_name: string;
  company_slug?: string;
  status: string;
  created_at: string;
}

export interface CompanyPortalPublicDTO {
  exists: boolean;
  company_name: string;
  slug: string;
  join_policy: 'INVITE_ONLY' | 'DOMAIN_APPROVAL' | 'DOMAIN_AUTO_JOIN';
  allowed_domains: string[];
}

export interface PortalAccessRequestResult {
  status: 'JOINED' | 'PENDING' | 'ALREADY_MEMBER';
  company_name: string;
  slug: string;
  role?: string;
}

export interface CompanyDomainLookupDTO {
  matched: boolean;
  workspace_id?: string;
  company_name?: string;
  slug?: string;
  domain?: string;
  join_policy?: string;
}

export interface KnowledgeSpaceDTO {
  id: string;
  workspace_id: string;
  name: string;
  slug: string;
  description?: string;
  visibility: 'ALL_MEMBERS' | 'RESTRICTED';
  allowed_roles: string[];
  member_user_ids: string[];
  document_count: number;
  created_at: string;
}

export interface CompanyJoinRequestDTO {
  id: string;
  workspace_id: string;
  user_id: string;
  email: string;
  department_note?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  assigned_role: string;
  created_at: string;
  reviewed_at?: string;
}

export interface CompanySettingsDTO {
  workspace_id: string;
  name: string;
  slug: string;
  tier: string;
  workspace_type: string;
  allowed_domains: string[];
  join_policy: 'INVITE_ONLY' | 'DOMAIN_APPROVAL' | 'DOMAIN_AUTO_JOIN';
  default_join_role: 'EMPLOYEE' | 'MEMBER' | 'VIEWER';
  starter_prompts: string[];
}

export interface KnowledgeGapDTO {
  id: string;
  message_id: string;
  conversation_id: string;
  question: string;
  answer_excerpt: string;
  reason: string;
  comment?: string;
  user_email: string;
  created_at: string;
}

export interface CompanyOverviewDTO {
  workspace_id: string;
  company_name: string;
  slug: string;
  tier: string;
  member_count: number;
  pending_join_requests: number;
  total_documents: number;
  ready_documents: number;
  storage_bytes: number;
  monthly_questions: number;
  monthly_questions_limit: number;
  helpful_rate_pct?: number;
  total_feedback_count: number;
  spaces_count: number;
  recent_gaps: KnowledgeGapDTO[];
}

export interface EmployeePortalInfoDTO {
  workspace_id?: string;
  company_name: string;
  slug?: string;
  workspace_type: string;
  role: string;
  starter_prompts: string[];
  spaces: KnowledgeSpaceDTO[];
  pending_company_name?: string;
  pending_company_slug?: string;
}

export interface BulkInviteResponse {
  results: Array<{ email: string; status: string; detail: string }>;
  invited_count: number;
  added_count: number;
  skipped_count: number;
}

export interface ProvisionEmployeeResultItem {
  email: string;
  status: string;
  email_sent: boolean;
  detail: string;
}

export interface ProvisionEmployeesResponse {
  results: ProvisionEmployeeResultItem[];
  created_count: number;
  added_count: number;
  updated_count?: number;
  skipped_count: number;
  emails_sent_count: number;
}

export interface UserProfileDTO {
  id: string;
  email: string;
  status: string;
  verified: boolean;
  is_superadmin: boolean;
  created_at: string;
  active_workspace?: {
    id: string;
    name: string;
    slug: string;
    role: string;
    workspace_type?: 'PERSONAL' | 'COMPANY';
  };
  pending_join_request?: PendingJoinRequestDTO;
}

export interface DocumentDTO {
  id: string;
  workspace_id: string;
  space_id?: string | null;
  space_name?: string | null;
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
  user_feedback?: number | null;
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
  workspace_type?: 'PERSONAL' | 'COMPANY';
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

export interface PendingInviteDTO {
  id: string;
  workspace_id: string;
  email: string;
  role: string;
  status: string;
  expires_at: string;
  created_at: string;
}

export interface ApiKeyDTO {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  last_used_at?: string;
  created_at: string;
}

export interface CreateApiKeyResponse extends ApiKeyDTO {
  secret_key: string;
}

export interface SearchResultItemDTO {
  document_id: string;
  filename: string;
  page_start?: number;
  page_end?: number;
  section?: string;
  snippet: string;
  score: number;
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

  private static refreshPromise: Promise<string | null> | null = null;

  private static async tryRefreshToken(): Promise<string | null> {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = (async () => {
      try {
        const res = await fetch(`${getApiBase()}/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
        });
        if (!res.ok) return null;
        const data = (await res.json()) as { access_token?: string };
        if (data.access_token) {
          this.setToken(data.access_token);
          return data.access_token;
        }
        return null;
      } catch {
        return null;
      } finally {
        this.refreshPromise = null;
      }
    })();
    return this.refreshPromise;
  }

  private static async request<T>(endpoint: string, options: RequestInit = {}, isRetry = false): Promise<T> {
    const token = this.getToken();

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
    const isAuthMutation =
      endpoint.startsWith('/auth/login') ||
      endpoint.startsWith('/auth/register') ||
      endpoint.startsWith('/auth/refresh') ||
      endpoint.startsWith('/auth/demo-login') ||
      endpoint.startsWith('/auth/logout');

    try {
      const res = await fetch(url, {
        ...options,
        headers,
        credentials: 'include',
      });

      if (res.status === 401 && !isRetry && !isAuthMutation) {
        const refreshed = await this.tryRefreshToken();
        if (refreshed) {
          return this.request<T>(endpoint, options, true);
        }
      }

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

  static async lookupCompanyByEmail(email: string): Promise<CompanyDomainLookupDTO> {
    return this.request<CompanyDomainLookupDTO>(`/auth/company-lookup?email=${encodeURIComponent(email)}`);
  }

  static async getCompanyPortalBySlug(slug: string): Promise<CompanyPortalPublicDTO> {
    return this.request<CompanyPortalPublicDTO>(`/auth/company-portal/${encodeURIComponent(slug)}`);
  }

  static async requestCompanyPortalAccess(slug: string, departmentNote?: string): Promise<PortalAccessRequestResult> {
    return this.request<PortalAccessRequestResult>(`/auth/company-portal/${encodeURIComponent(slug)}/request-access`, {
      method: 'POST',
      body: JSON.stringify({ department_note: departmentNote || undefined }),
    });
  }

  static async register(
    email: string,
    password: string,
    opts?: {
      account_type?: 'personal' | 'company' | 'employee';
      company_name?: string;
      company_slug?: string;
      target_company_slug?: string;
      claim_domain?: boolean;
      department_note?: string;
    },
  ): Promise<{
    id: string;
    email: string;
    active_workspace?: { id: string; name: string; slug: string; role: string; workspace_type?: string } | null;
  }> {
    return this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, ...opts }),
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

  static async getDashboard(limit: number = 50) {
    return this.request<{
      usage: UsageSummaryDTO;
      recent_documents: DocumentDTO[];
      recent_conversations: ConversationDTO[];
      is_superadmin?: boolean;
      workspace_type?: 'PERSONAL' | 'COMPANY';
      role?: string;
    }>(`/dashboard/summary?limit=${limit}`);
  }

  static async listDocuments(status?: string, search?: string, spaceId?: string): Promise<DocumentDTO[]> {
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (search) params.append('q', search);
    if (spaceId) params.append('space_id', spaceId);
    return this.request<DocumentDTO[]>(`/documents?${params.toString()}`);
  }

  static async createUploadIntent(
    filename: string,
    declared_mime: string,
    size_bytes: number,
    checksum_sha256: string,
    space_id?: string,
  ) {
    return this.request<{
      document_id: string;
      upload_url: string;
      method: string;
      headers: Record<string, string>;
      expires_at: string;
    }>('/documents/upload-intents', {
      method: 'POST',
      body: JSON.stringify({ filename, declared_mime, size_bytes, checksum_sha256, ...(space_id ? { space_id } : {}) }),
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

  static async sendMessage(conversation_id: string, content: string, document_ids?: string[], space_id?: string) {
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
      body: JSON.stringify({ content, document_ids, ...(space_id ? { space_id } : {}) }),
    });
  }

  static async submitMessageFeedback(
    conversationId: string,
    messageId: string,
    rating: 1 | -1,
    comment?: string,
  ): Promise<{ message_id: string; rating: number }> {
    return this.request<{ message_id: string; rating: number }>(
      `/conversations/${conversationId}/messages/${messageId}/feedback`,
      {
        method: 'POST',
        body: JSON.stringify({ rating, comment }),
      },
    );
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

  static async getMyProfile(): Promise<UserProfileDTO> {
    return this.request<UserProfileDTO>('/me');
  }

  // Admin Platform Methods
  static async getAdminOverview(): Promise<AdminOverviewDTO> {
    return this.request<AdminOverviewDTO>('/admin/overview');
  }

  static async getAdminWorkspaces(): Promise<AdminWorkspaceSummaryDTO[]> {
    return this.request<AdminWorkspaceSummaryDTO[]>('/admin/workspaces');
  }

  static async deleteAdminWorkspace(workspaceId: string): Promise<void> {
    return this.request<void>(`/admin/workspaces/${workspaceId}`, {
      method: 'DELETE',
    });
  }

  static async updateAdminWorkspaceTier(workspaceId: string, tier: string): Promise<AdminWorkspaceSummaryDTO> {
    return this.request<AdminWorkspaceSummaryDTO>(`/admin/workspaces/${workspaceId}/tier`, {
      method: 'PATCH',
      body: JSON.stringify({ tier }),
    });
  }

  static async getAdminUsers(): Promise<AdminUserSummaryDTO[]> {
    return this.request<AdminUserSummaryDTO[]>('/admin/users');
  }

  static async updateAdminUserStatus(userId: string, status: string): Promise<AdminUserSummaryDTO> {
    return this.request<AdminUserSummaryDTO>(`/admin/users/${userId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
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

  static async exportAdminAuditLogsCsv(): Promise<Blob> {
    const res = await fetch(`${getApiBase()}/admin/audit-logs/export`, {
      headers: this.getToken() ? { Authorization: `Bearer ${this.getToken()}` } : {},
      credentials: 'include',
    });
    if (!res.ok) throw new ApiError('Failed to export platform audit logs.', res.status);
    return res.blob();
  }

  static async createAdminWorkspace(payload: { name: string; owner_email: string; owner_password?: string; tier: string }): Promise<AdminWorkspaceSummaryDTO> {
    return this.request<AdminWorkspaceSummaryDTO>('/admin/workspaces', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  static async getAdminJobs(status?: string): Promise<AdminJobSummaryDTO[]> {
    const query = status ? `?status=${encodeURIComponent(status)}` : '';
    return this.request<AdminJobSummaryDTO[]>(`/admin/jobs${query}`);
  }

  static async retryAdminJob(jobId: string): Promise<AdminJobSummaryDTO> {
    return this.request<AdminJobSummaryDTO>(`/admin/jobs/${jobId}/retry`, {
      method: 'POST',
    });
  }

  static async getAdminSystemDiagnostics(): Promise<AdminSystemDiagnosticsDTO> {
    return this.request<AdminSystemDiagnosticsDTO>('/admin/system');
  }

  // Self-Service SaaS Endpoints
  static async resendVerification(email: string): Promise<{ message: string }> {
    return this.request<{ message: string }>('/auth/resend-verification', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }

  static async changePassword(currentPassword: string, newPassword: string): Promise<{ message: string }> {
    return this.request<{ message: string }>('/change-password', {
      method: 'POST',
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    });
  }

  static async deleteAccount(): Promise<void> {
    return this.request<void>('/delete-account', { method: 'POST' });
  }

  static async updateDocument(
    documentId: string,
    data: { filename?: string; tags?: string[]; space_id?: string; clear_space?: boolean },
  ): Promise<DocumentDTO> {
    return this.request<DocumentDTO>(`/documents/${documentId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  static async searchWorkspace(
    query: string,
    document_ids?: string[],
    limit: number = 10,
    space_id?: string,
  ): Promise<{ query: string; results: SearchResultItemDTO[]; total_found: number }> {
    return this.request<{ query: string; results: SearchResultItemDTO[]; total_found: number }>('/search', {
      method: 'POST',
      body: JSON.stringify({ query, document_ids, limit, ...(space_id ? { space_id } : {}) }),
    });
  }

  static async updateWorkspaceName(workspaceId: string, name: string): Promise<WorkspaceDetailDTO> {
    return this.request<WorkspaceDetailDTO>(`/workspaces/${workspaceId}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    });
  }

  static async listPendingInvites(workspaceId: string): Promise<PendingInviteDTO[]> {
    return this.request<PendingInviteDTO[]>(`/workspaces/${workspaceId}/invites`);
  }

  static async revokePendingInvite(workspaceId: string, inviteId: string): Promise<void> {
    return this.request<void>(`/workspaces/${workspaceId}/invites/${inviteId}`, { method: 'DELETE' });
  }

  static async transferWorkspaceOwnership(workspaceId: string, newOwnerUserId: string): Promise<WorkspaceMemberDTO> {
    return this.request<WorkspaceMemberDTO>(`/workspaces/${workspaceId}/transfer-ownership`, {
      method: 'POST',
      body: JSON.stringify({ new_owner_user_id: newOwnerUserId }),
    });
  }

  static async exportWorkspaceAuditLogsCsv(workspaceId: string): Promise<Blob> {
    const headers: Record<string, string> = {};
    if (this.getToken()) headers['Authorization'] = `Bearer ${this.getToken()}`;
    headers['X-Workspace-ID'] = workspaceId;
    const res = await fetch(`${getApiBase()}/workspaces/${workspaceId}/audit-logs/export`, {
      headers,
      credentials: 'include',
    });
    if (!res.ok) throw new ApiError('Failed to export audit logs.', res.status);
    return res.blob();
  }

  static async listApiKeys(workspaceId: string): Promise<ApiKeyDTO[]> {
    return this.request<ApiKeyDTO[]>(`/workspaces/${workspaceId}/api-keys`);
  }

  static async createApiKey(workspaceId: string, name: string, scopes: string[] = ['read', 'write']): Promise<CreateApiKeyResponse> {
    return this.request<CreateApiKeyResponse>(`/workspaces/${workspaceId}/api-keys`, {
      method: 'POST',
      body: JSON.stringify({ name, scopes }),
    });
  }

  static async revokeApiKey(workspaceId: string, keyId: string): Promise<void> {
    return this.request<void>(`/workspaces/${workspaceId}/api-keys/${keyId}`, { method: 'DELETE' });
  }

  // Enterprise Company & Employee Portal Methods
  static async getEmployeePortalInfo(): Promise<EmployeePortalInfoDTO> {
    return this.request<EmployeePortalInfoDTO>('/company/portal-info');
  }

  static async getCompanyOverview(): Promise<CompanyOverviewDTO> {
    return this.request<CompanyOverviewDTO>('/company/overview');
  }

  static async getCompanySettings(): Promise<CompanySettingsDTO> {
    return this.request<CompanySettingsDTO>('/company/settings');
  }

  static async updateCompanySettings(payload: {
    name?: string;
    allowed_domains?: string[];
    join_policy?: string;
    default_join_role?: string;
    starter_prompts?: string[];
  }): Promise<CompanySettingsDTO> {
    return this.request<CompanySettingsDTO>('/company/settings', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  }

  static async listCompanyJoinRequests(status?: string): Promise<CompanyJoinRequestDTO[]> {
    const q = status ? `?status=${encodeURIComponent(status)}` : '';
    return this.request<CompanyJoinRequestDTO[]>(`/company/join-requests${q}`);
  }

  static async decideJoinRequest(
    requestId: string,
    decision: 'APPROVE' | 'REJECT',
    role: string = 'EMPLOYEE',
    spaceIds?: string[],
  ): Promise<CompanyJoinRequestDTO> {
    return this.request<CompanyJoinRequestDTO>(`/company/join-requests/${requestId}/decision`, {
      method: 'POST',
      body: JSON.stringify({ decision, role, space_ids: spaceIds }),
    });
  }

  static async bulkInviteEmployees(emails: string[], role: string = 'EMPLOYEE'): Promise<BulkInviteResponse> {
    return this.request<BulkInviteResponse>('/company/invites/bulk', {
      method: 'POST',
      body: JSON.stringify({ emails, role }),
    });
  }

  static async provisionCompanyEmployees(payload: {
    emails: string[];
    password: string;
    role?: string;
    reset_existing_password?: boolean;
  }): Promise<ProvisionEmployeesResponse> {
    return this.request<ProvisionEmployeesResponse>('/company/employees/provision', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  static async listCompanySpaces(): Promise<KnowledgeSpaceDTO[]> {
    return this.request<KnowledgeSpaceDTO[]>('/company/spaces');
  }

  static async createCompanySpace(payload: {
    name: string;
    description?: string;
    visibility: 'ALL_MEMBERS' | 'RESTRICTED';
    allowed_roles: string[];
    member_user_ids?: string[];
  }): Promise<KnowledgeSpaceDTO> {
    return this.request<KnowledgeSpaceDTO>('/company/spaces', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  static async updateCompanySpace(
    spaceId: string,
    payload: {
      name?: string;
      description?: string;
      visibility?: 'ALL_MEMBERS' | 'RESTRICTED';
      allowed_roles?: string[];
      member_user_ids?: string[];
    },
  ): Promise<KnowledgeSpaceDTO> {
    return this.request<KnowledgeSpaceDTO>(`/company/spaces/${spaceId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  }

  static async deleteCompanySpace(spaceId: string): Promise<void> {
    return this.request<void>(`/company/spaces/${spaceId}`, { method: 'DELETE' });
  }

  static async listCompanyKnowledgeGaps(limit: number = 50): Promise<KnowledgeGapDTO[]> {
    return this.request<KnowledgeGapDTO[]>(`/company/knowledge-gaps?limit=${limit}`);
  }
}
