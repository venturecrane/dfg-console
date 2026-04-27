import type { Metadata } from 'next'
import { ClerkProvider } from '@clerk/nextjs'
import './globals.css'

export const metadata: Metadata = {
  title: 'DFG Core - Command Center',
  description: 'Internal development tooling for DFG',
}

const CLERK_CONFIGURED = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY)

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const body = (
    <html lang="en">
      <body>{children}</body>
    </html>
  )

  return CLERK_CONFIGURED ? <ClerkProvider>{body}</ClerkProvider> : body
}
