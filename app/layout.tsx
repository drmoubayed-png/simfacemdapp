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
  // Set so any relative URLs in og/twitter metadata resolve to the
  // production domain instead of localhost. Update if the canonical
  // host ever changes.
  metadataBase: new URL('https://www.simfacemd.com'),
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
    url: 'https://www.simfacemd.com',
    siteName: 'SimFaceMD',
    type: 'website'
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SimFaceMD — See it before you do it.',
    description:
      'AI-powered aesthetic simulation. Free. 60 seconds. Clinique Face MD, Montréal.'
  },
  formatDetection: {
    telephone: false
  },
  // Custom "F" mark sourced from the official Face MD wordmark. Used for
  // the browser tab favicon, the iOS home-screen icon (Apple Touch Icon),
  // and the Android / PWA manifest icons.
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icons/favicon-32.png', type: 'image/png', sizes: '32x32' },
      { url: '/icons/favicon-16.png', type: 'image/png', sizes: '16x16' }
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }
    ]
  },
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'SimFaceMD',
    statusBarStyle: 'black-translucent'
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
