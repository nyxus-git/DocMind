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
  limitations?: string;
}

export interface DocumentSummaryResponse {
  document_id: string;
  overview: string;
  sections?: Array<{ title: string; content: string }>;
  key_points: Array<{ point: string; explanation: string; source_labels?: string[] }>;
  caveats?: string;
  is_cached?: boolean;
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000/api/v1';

export class ApiClient {
  private static token: string | null = null;

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

  static async ensureSession(): Promise<string> {
    const existing = this.getToken();
    if (existing) return existing;
    try {
      const res = await fetch(`${API_BASE}/auth/demo-login`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.access_token) {
          this.setToken(data.access_token);
          return data.access_token;
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn('[DocMind API] Auto-session initialization failed:', msg);
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

    try {
      const res = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers,
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || errorData.title || `API error ${res.status}`);
      }

      if (res.status === 204) {
        return {} as T;
      }

      return await res.json();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[DocMind API] Request to ${endpoint} failed:`, msg);
      throw err;
    }
  }

  static async register(email: string, password: string): Promise<{ id: string; email: string; active_workspace: { id: string; name: string; slug: string; role: string } }> {
    return this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
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
}
