import type { Metadata } from 'next';
import { CompanyPortalShell } from '../../components/org/CompanyPortalShell';

export const metadata: Metadata = {
  title: 'Company Knowledge Portal — DocMind',
};

export default function CompanyPortalPage() {
  return <CompanyPortalShell />;
}
