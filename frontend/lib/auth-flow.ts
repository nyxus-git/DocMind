import { ApiClient, WorkspaceDetailDTO } from './api';
import { loadSession, nameFromEmail, saveSession, takePendingWorkspace, UserSession } from './session';

/** Turn an error from ApiClient into a sentence a person can act on. */
export function friendlyError(err: unknown, fallback: string): string {
  if (err instanceof TypeError) {
    return 'Cannot reach the DocMind server. Check your connection and try again.';
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

/**
 * After a successful sign-in: create a pending company workspace if one was requested at
 * sign-up, pick the active workspace, and save the session.
 */
export async function establishSession(email: string, fullName?: string): Promise<UserSession> {
  const pending = takePendingWorkspace();
  if (pending) {
    try {
      const created = await ApiClient.createCompanyWorkspace(pending.name, pending.slug);
      ApiClient.setActiveWorkspaceId(created.id);
    } catch {
      // The personal workspace still works; the user can create a company workspace later.
    }
  }

  let workspaces: WorkspaceDetailDTO[] = [];
  let isSuperAdmin = false;
  try {
    const [wsList, profile] = await Promise.all([
      ApiClient.listWorkspaces(),
      ApiClient.getMyProfile().catch(() => null),
    ]);
    workspaces = wsList;
    isSuperAdmin = Boolean(profile?.is_superadmin);
  } catch {
    // fall through with a minimal session
  }

  const savedId = ApiClient.getActiveWorkspaceId();
  const ws = workspaces.find(w => w.id === savedId) ?? workspaces[0];
  ApiClient.setActiveWorkspaceId(ws ? ws.id : null);

  const previous = loadSession();
  const name = fullName || (previous && previous.email === email ? previous.fullName : '') || nameFromEmail(email);

  const session: UserSession = {
    email,
    fullName: name,
    workspaceName: ws?.name ?? 'Personal workspace',
    workspaceSlug: ws?.slug ?? 'personal',
    workspaceId: ws?.id,
    isCompany: ws ? !/personal/i.test(ws.name) : false,
    role: (ws?.role as UserSession['role']) ?? 'OWNER',
    isSuperAdmin,
  };
  saveSession(session);
  return session;
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
