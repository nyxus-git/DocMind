import { Suspense } from 'react';
import type { Metadata } from 'next';
import { AuthShell } from '../../components/auth/AuthShell';
import { AuthForm } from '../../components/auth/AuthForm';

export const metadata: Metadata = { title: 'Sign in' };

export default function LoginPage() {
  return (
    <AuthShell>
      <Suspense fallback={null}>
        <AuthForm initialMode="signin" />
      </Suspense>
    </AuthShell>
  );
}
