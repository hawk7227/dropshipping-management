// app/layout.tsx
// Root layout with navigation sidebar, header, and global styles

import type { Metadata } from 'next';
import './globals.css';
import { Navigation } from '@/components/navigation/Navigation';

export const metadata: Metadata = {
  title: 'Dropshipping Platform',
  description: 'Complete e-commerce management platform with membership, price intelligence, and multi-channel selling',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <Navigation>{children}</Navigation>
      </body>
    </html>
  );
}
