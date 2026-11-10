import type { Metadata } from 'next';
import { AdminPortalClient } from '../../components/AdminPortalClient';

export const metadata: Metadata = {
  title: 'Admin Console — DocMind Platform Control Center',
};

export default function AdminPage() {
  return <AdminPortalClient />;
}
