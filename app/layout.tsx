import type { Metadata, Viewport } from 'next';
import { Cormorant_Garamond, Inter } from 'next/font/google';
import { LanguageProvider } from './lib/i18n';
import './globals.css';

const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['400', '500'],
  style: ['italic', 'normal'],
  variable: '--font-cormorant',
  display: 'swap'
});

const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-inter',
  display: 'swap'
});

export const metadata: Metadata = {
  title: 'SimFaceMD — See it before you do it.',
  description:
    'AI-powered aesthetic simulation by Clinique Face MD, Montréal. Free 60-second preview of botox, lip filler, jawline filler, cheek filler & rhinoplasty.',
  applicationName: 'SimFaceMD',
  authors: [{ name: 'Clinique Face MD' }],
  keywords: [
    'aesthetic simulation',
    'AI cosmetic preview',
    'lip filler simulator',
    'rhinoplasty preview',
    'botox preview',
    'Clinique Face MD',
    'Montréal medical aesthetics'
  ],
  openGraph: {
    title: 'SimFaceMD — See it before you do it.',
    description:
      'AI-powered aesthetic simulation. Free. 60 seconds. Clinique Face MD, Montréal.',
    type: 'website'
  },
  formatDetection: {
    telephone: false
  }
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#000000'
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${cormorant.variable} ${inter.variable}`}>
      <body className="min-h-screen bg-bg text-white antialiased">
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
