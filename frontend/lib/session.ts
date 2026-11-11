export interface UserSession {
  email: string;
  fullName: string;
  workspaceName: string;
  workspaceSlug: string;
  workspaceId?: string;
  workspaceType?: 'PERSONAL' | 'COMPANY';
  isCompany: boolean;
  role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'EMPLOYEE' | 'VIEWER' | 'PENDING';
  isSuperAdmin?: boolean;
  pendingJoinCompany?: { workspaceId: string; companyName: string } | null;
}

export function portalHomeForSession(session: UserSession): string {
  if (session.isSuperAdmin) return '/admin/';
  if (!session.workspaceId && session.pendingJoinCompany) return '/employee/';
  if (session.workspaceType === 'COMPANY' || session.isCompany) {
    if (session.role === 'EMPLOYEE') return '/employee/';
    if (session.role === 'OWNER' || session.role === 'ADMIN') return '/company/';
  }
  return '/app/';
}

const SESSION_KEY = 'docmind_user_session';
const PENDING_WS_KEY = 'docmind_pending_workspace';

export function loadSession(): UserSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as UserSession) : null;
  } catch {
    return null;
  }
}

/** Raw stored session string ('' when none). Used with useSyncExternalStore, which needs a stable primitive snapshot. */
export function readRawSession(): string {
  try {
    return localStorage.getItem(SESSION_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveSession(session: UserSession) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // storage unavailable (private mode); session lives in memory only
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem('docmind_active_ws_id');
  } catch {
    // ignore
  }
}

/** A company workspace requested at sign-up, created after the first successful sign-in. */
export function savePendingWorkspace(value: { name: string; slug: string }) {
  try {
    localStorage.setItem(PENDING_WS_KEY, JSON.stringify(value));
  } catch {
    // ignore
  }
}

export function takePendingWorkspace(): { name: string; slug: string } | null {
  try {
    const raw = localStorage.getItem(PENDING_WS_KEY);
    if (!raw) return null;
    localStorage.removeItem(PENDING_WS_KEY);
    return JSON.parse(raw) as { name: string; slug: string };
  } catch {
    return null;
  }
}

export function nameFromEmail(email: string): string {
  const local = email.split('@')[0] || 'User';
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map(p => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');
}
