import type { Metadata } from 'next'
import { Footer } from '@/components/marketing/Footer'
import { Hero } from '@/components/marketing/Hero'
import { HowItWorks } from '@/components/marketing/HowItWorks'
import { Nav } from '@/components/marketing/Nav'
import { Problem } from '@/components/marketing/Problem'
import { WaitlistCTA } from '@/components/marketing/WaitlistCTA'
import { WhyDifferent } from '@/components/marketing/WhyDifferent'

export const metadata: Metadata = {
  title: 'Durgan Field Guide — Auction intelligence for resellers',
  description:
    'Automated scouting, AI-powered scoring, and a focused buy-or-pass list. In private alpha — request access.',
  openGraph: {
    title: 'Durgan Field Guide — Auction intelligence for resellers',
    description:
      'Automated scouting, AI-powered scoring, and a focused buy-or-pass list for resellers.',
    url: 'https://durganfieldguide.com',
    siteName: 'Durgan Field Guide',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Durgan Field Guide — Auction intelligence for resellers',
    description: 'In private alpha — request access.',
  },
}

export default function LandingPage() {
  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-gray-900">
      <Nav />
      <main>
        <Hero />
        <Problem />
        <HowItWorks />
        <WhyDifferent />
        <WaitlistCTA />
      </main>
      <Footer />
    </div>
  )
}
