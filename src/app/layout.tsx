import type { Metadata, Viewport } from 'next';
import './globals.css';
import AppShell from '@/components/AppShell';

export const metadata: Metadata = {
  title: 'Sync Worship',
  description: '教會敬拜詩歌庫與即時同步',
  applicationName: 'Sync Worship',
  appleWebApp: { capable: true, title: 'Sync Worship', statusBarStyle: 'default' },
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon.svg', apple: '/icon.svg' },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f4f1ea' },
    { media: '(prefers-color-scheme: dark)', color: '#0d1117' },
  ],
};

// Runs before paint so dark mode doesn't flash white (static export: no middleware).
const themeInit = `try{var d=localStorage.getItem('worship_dark_mode')==='1';if(d){document.documentElement.classList.add('dark');document.documentElement.style.colorScheme='dark'}}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant-HK" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body className="font-sans antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
