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
        {/* Skip Links for Accessibility */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-gray-900 focus:text-white focus:rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
        >
          Skip to main content
        </a>
        <Navigation>{children}</Navigation>
      </body>
    </html>
  );
}

