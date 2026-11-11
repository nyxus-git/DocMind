import type { Metadata } from 'next';
import { EmployeePortal } from '../../components/employee/EmployeePortal';

export const metadata: Metadata = {
  title: 'Employee Knowledge Portal — DocMind',
};

export default function EmployeePage() {
  return <EmployeePortal />;
}

