import type { Metadata } from 'next';
import { Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/layout/Providers';

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-jakarta',
  display: 'swap',
});

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-jetbrains',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'RackLite — Lightweight Linux Server Panel',
  description:
    'Panel manajemen server Linux ringan berbasis Next.js App Router dan SQLite dengan Web Terminal, File Manager, Nginx, Database, Firewall, dan Backup.',
  openGraph: {
    title: 'RackLite — Lightweight Linux Server Panel',
    description:
      'Panel manajemen server Linux ringan berbasis Next.js App Router dan SQLite.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'RackLite — Lightweight Linux Server Panel',
    description:
      'Panel manajemen server Linux ringan berbasis Next.js App Router dan SQLite.',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="id"
      className={`${jakarta.variable} ${jetbrains.variable} dark`}
      suppressHydrationWarning
    >
      <body
        className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 antialiased selection:bg-sky-500/20"
        suppressHydrationWarning
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
