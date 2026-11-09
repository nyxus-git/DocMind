import type { Metadata } from 'next';
import { WorkspaceApp } from '../../components/workspace/WorkspaceApp';

export const metadata: Metadata = { title: 'Workspace' };

export default function WorkspacePage() {
  return <WorkspaceApp />;
}
