'use client';

import { createContext, useContext } from 'react';
import { CitationDTO, ConversationDTO, DocumentDTO, KnowledgeSpaceDTO, UsageSummaryDTO } from '../../lib/api';
import { UserSession } from '../../lib/session';

export type TabId = 'dashboard' | 'library' | 'chat' | 'compare' | 'settings' | 'admin';

export interface WorkspaceContextValue {
  session: UserSession;
  usage: UsageSummaryDTO | null;
  documents: DocumentDTO[];
  documentsLoaded: boolean;
  conversations: ConversationDTO[];
  spaces: KnowledgeSpaceDTO[];
  starterPrompts: string[];
  loadError: string | null;

  refreshDocuments: () => Promise<void>;
  refreshUsage: () => Promise<void>;
  refreshConversations: () => Promise<void>;
  reloadAll: () => Promise<void>;

  tab: TabId;
  setTab: (tab: TabId) => void;
  chatScope: string[];
  setChatScope: (ids: string[]) => void;
  /** Open chat limited to the given documents. */
  askDocuments: (ids: string[]) => void;

  openUpload: () => void;
  openCitation: (c: CitationDTO) => void;
  openNotebook?: () => void;
  openShortcuts?: () => void;
  handleApiError: (err: unknown) => boolean;
  updateWorkspaceTitle: (name: string) => void;
  signOut: () => Promise<void>;

  role: UserSession['role'];
  canUpload: boolean;
  canAsk: boolean;
  canManageMembers: boolean;
  isOwner: boolean;
}

const Ctx = createContext<WorkspaceContextValue | null>(null);

export const WorkspaceProvider = Ctx.Provider;

export function useWorkspace(): WorkspaceContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useWorkspace must be used inside WorkspaceProvider');
  return v;
}
