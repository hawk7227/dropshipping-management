// app/login/layout.tsx
// Layout for login page without navigation sidebar

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign In - Dropshipping Platform',
  description: 'Sign in to your dropshipping platform account',
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
