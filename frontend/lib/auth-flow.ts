import { ApiClient, UserProfileDTO, WorkspaceDetailDTO } from './api';
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
 * sign-up, pick the active workspace (preferring COMPANY workspaces over Personal), and save the session.
 */
export async function establishSession(
  email: string,
  fullName?: string,
  preferredSlug?: string,
): Promise<UserSession> {
  const pending = takePendingWorkspace();
  if (pending) {
    try {
      const created = await ApiClient.createCompanyWorkspace(pending.name, pending.slug);
      ApiClient.setActiveWorkspaceId(created.id);
    } catch {
      // The existing workspace still works; the user can create a company workspace later.
    }
  }

  let workspaces: WorkspaceDetailDTO[] = [];
  let profile: UserProfileDTO | null = null;
  try {
    const [wsList, me] = await Promise.all([
      ApiClient.listWorkspaces(),
      ApiClient.getMyProfile().catch(() => null),
    ]);
    workspaces = wsList;
    profile = me;
  } catch {
    // fall through with a minimal session
  }

  const savedId = ApiClient.getActiveWorkspaceId();
  const normalizedPreferred = preferredSlug?.trim().toLowerCase();
  const ws =
    (normalizedPreferred ? workspaces.find(w => w.slug.toLowerCase() === normalizedPreferred) : undefined) ??
    workspaces.find(w => w.id === savedId) ??
    workspaces.find(w => w.workspace_type === 'COMPANY' || !/personal/i.test(w.name)) ??
    workspaces[0];
  ApiClient.setActiveWorkspaceId(ws ? ws.id : null);

  const previous = loadSession();
  const name = fullName || (previous && previous.email === email ? previous.fullName : '') || nameFromEmail(email);

  const pendingReq = !ws && profile?.pending_join_request
    ? {
        workspaceId: profile.pending_join_request.workspace_id,
        companyName: profile.pending_join_request.company_name,
        companySlug: profile.pending_join_request.company_slug,
      }
    : null;

  const isCompanyWs = ws ? ws.workspace_type === 'COMPANY' || !/personal/i.test(ws.name) : Boolean(pendingReq);

  const session: UserSession = {
    email,
    fullName: name,
    workspaceName: ws?.name ?? pendingReq?.companyName ?? 'Personal workspace',
    workspaceSlug: ws?.slug ?? 'personal',
    workspaceId: ws?.id,
    workspaceType: ws?.workspace_type ?? (isCompanyWs ? 'COMPANY' : 'PERSONAL'),
    isCompany: isCompanyWs,
    role: ws ? (ws.role as UserSession['role']) : pendingReq ? 'PENDING' : 'OWNER',
    isSuperAdmin: Boolean(profile?.is_superadmin),
    pendingJoinCompany: pendingReq,
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
