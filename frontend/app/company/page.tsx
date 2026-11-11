import type { Metadata } from 'next';
import { CompanyConsole } from '../../components/company/CompanyConsole';

export const metadata: Metadata = {
  title: 'Company Console — DocMind Enterprise',
};

export default function CompanyPage() {
  return <CompanyConsole />;
}

