import { Suspense } from 'react';
import type { Metadata } from 'next';
import { AuthShell } from '../../components/auth/AuthShell';
import { AuthForm } from '../../components/auth/AuthForm';

export const metadata: Metadata = { title: 'Create your workspace' };

export default function SignupPage() {
  return (
    <AuthShell>
      <Suspense fallback={null}>
        <AuthForm initialMode="signup" />
      </Suspense>
    </AuthShell>
  );
}
