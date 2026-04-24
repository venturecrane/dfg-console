import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { ClerkProvider } from '@clerk/nextjs'
import { Providers } from '@/components/Providers'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'DFG Operator Console',
  description: 'Durgan Field Guide - Auction opportunity management',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'DFG',
  },
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#1f2937',
  // iOS Safari: viewport-fit=cover allows content to extend into safe areas (#78)
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en" className="overflow-x-hidden">
        <body className={`${inter.className} overflow-x-hidden w-full max-w-[100vw]`}>
          <Providers>
            <div className="min-h-screen bg-gray-50 dark:bg-gray-900 w-full max-w-[100vw] overflow-x-hidden">
              {children}
            </div>
          </Providers>
        </body>
      </html>
    </ClerkProvider>
  )
}
