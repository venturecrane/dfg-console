'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Inbox,
  Eye,
  Search,
  TrendingUp,
  CheckCircle,
  XCircle,
  RefreshCw,
  Target,
  ShieldQuestion,
} from 'lucide-react'
import { Navigation } from '@/components/Navigation'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { AttentionRequiredList } from '@/components/features/attention-required-list'
import { EndingSoonList } from '@/components/features/ending-soon-list'
import { cn, STATUS_LABELS, STATUS_COLORS } from '@/lib/utils'
import { getStats } from '@/lib/api'
import type { DashboardStats, OpportunityStatus } from '@dfg/types'

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchStats()
  }, [])

  const fetchStats = async () => {
    setLoading(true)
    try {
      const data = await getStats()
      setStats(data)
    } catch (error) {
      console.error('Failed to fetch stats:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col md:flex-row min-h-screen">
        <Navigation />
        <main className="flex-1 flex items-center justify-center">
          <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
        </main>
      </div>
    )
  }

  const activeStatuses: OpportunityStatus[] = ['inbox', 'qualifying', 'watch', 'inspect', 'bid']
  const totalActive = activeStatuses.reduce(
    (sum, status) => sum + (stats?.by_status[status] || 0),
    0
  )

  return (
    <div className="flex flex-col md:flex-row min-h-screen w-full max-w-[100vw] overflow-x-hidden">
      <Navigation />

      <main className="flex-1 pb-4 min-w-0 w-full max-w-[100vw] overflow-x-hidden">
        {/* Header - hidden on mobile, Navigation provides mobile header (#82) */}
        <header className="hidden md:block sticky top-0 z-40 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 overflow-hidden max-w-full">
          <div className="flex items-center justify-between px-3 sm:px-4 h-14 gap-2 min-w-0 max-w-full">
            <h1 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white shrink-0 truncate">
              Dashboard
            </h1>
            <Button variant="ghost" size="sm" onClick={fetchStats} disabled={loading}>
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            </Button>
          </div>
        </header>

        <div className="p-4 space-y-4">
          {/* Attention Required List - Priority-sorted staleness indicators */}
          <AttentionRequiredList limit={5} />

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 gap-3">
            {/* Inbox: New opportunities to triage (#71) */}
            <Link href="/opportunities?status=inbox">
              <Card
                hover
                className={
                  stats?.by_status.inbox && stats.by_status.inbox > 0
                    ? 'border-blue-300 dark:border-blue-600'
                    : ''
                }
              >
                <CardContent className="text-center">
                  <div className="flex justify-center mb-2">
                    <Inbox className="h-6 w-6 text-blue-500" />
                  </div>
                  <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                    {stats?.by_status.inbox || 0}
                  </p>
                  <p className="text-sm text-gray-500">Inbox</p>
                </CardContent>
              </Card>
            </Link>

            {/* Strike Zone: High-value opportunities ready for action */}
            <Link href="/opportunities?strike_zone=true">
              <Card
                hover
                className={
                  stats?.strike_zone && stats.strike_zone > 0
                    ? 'border-orange-300 dark:border-orange-600'
                    : ''
                }
              >
                <CardContent className="text-center">
                  <div className="flex justify-center mb-2">
                    <Target className="h-6 w-6 text-orange-500" />
                  </div>
                  <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                    {stats?.strike_zone || 0}
                  </p>
                  <p className="text-sm text-gray-500">Strike Zone</p>
                </CardContent>
              </Card>
            </Link>

            {/* Verification Needed: Opportunities with open critical gates */}
            <Link href="/opportunities?verification_needed=true">
              <Card
                hover
                className={
                  stats?.verification_needed && stats.verification_needed > 0
                    ? 'border-purple-300 dark:border-purple-600'
                    : ''
                }
              >
                <CardContent className="text-center">
                  <div className="flex justify-center mb-2">
                    <ShieldQuestion className="h-6 w-6 text-purple-500" />
                  </div>
                  <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                    {stats?.verification_needed || 0}
                  </p>
                  <p className="text-sm text-gray-500">Verify</p>
                </CardContent>
              </Card>
            </Link>

            <Link href="/opportunities?status=qualifying">
              <Card hover>
                <CardContent className="text-center">
                  <div className="flex justify-center mb-2">
                    <Search className="h-6 w-6 text-amber-500" />
                  </div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
                    {stats?.by_status.qualifying || 0}
                  </p>
                  <p className="text-sm text-gray-500">Qualifying</p>
                </CardContent>
              </Card>
            </Link>

            <Link href="/opportunities?status=watch">
              <Card hover>
                <CardContent className="text-center">
                  <div className="flex justify-center mb-2">
                    <Eye className="h-6 w-6 text-blue-500" />
                  </div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
                    {stats?.by_status.watch || 0}
                  </p>
                  <p className="text-sm text-gray-500">Watching</p>
                </CardContent>
              </Card>
            </Link>

            <Link href="/opportunities?status=bid">
              <Card hover>
                <CardContent className="text-center">
                  <div className="flex justify-center mb-2">
                    <TrendingUp className="h-6 w-6 text-green-500" />
                  </div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
                    {stats?.by_status.bid || 0}
                  </p>
                  <p className="text-sm text-gray-500">Bidding</p>
                </CardContent>
              </Card>
            </Link>
          </div>

          {/* Ending Soon List - Full items with countdown timers */}
          <EndingSoonList limit={5} />

          {/* Pipeline Summary */}
          <Card>
            <CardHeader>
              <h2 className="font-medium text-gray-900 dark:text-white">Pipeline Overview</h2>
            </CardHeader>
            <CardContent className="space-y-2">
              {Object.entries(stats?.by_status || {}).map(([status, count]) => (
                <Link
                  key={status}
                  href={`/opportunities?status=${status}`}
                  className="flex items-center justify-between py-1 hover:bg-gray-50 dark:hover:bg-gray-700 -mx-4 px-4 rounded"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'px-2 py-0.5 rounded text-xs font-medium',
                        STATUS_COLORS[status as OpportunityStatus]
                      )}
                    >
                      {STATUS_LABELS[status as OpportunityStatus]}
                    </span>
                  </div>
                  <span className="text-gray-600 dark:text-gray-300">{count}</span>
                </Link>
              ))}
            </CardContent>
          </Card>

          {/* New Today (#71 - deep-linked) */}
          {stats?.new_today !== undefined && stats.new_today > 0 && (
            <Link href="/opportunities?new_today=true">
              <Card hover>
                <CardContent className="flex items-center justify-between">
                  <span className="text-gray-600 dark:text-gray-300">New opportunities today</span>
                  <span className="font-bold text-blue-600">{stats.new_today}</span>
                </CardContent>
              </Card>
            </Link>
          )}
        </div>

        {/* Results Summary Footer - Relocated for visibility */}
        <footer className="sticky bottom-0 md:bottom-auto md:relative mt-4 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-4 py-3">
          <div className="flex justify-around text-center max-w-md mx-auto">
            <Link href="/opportunities?status=won" className="flex-1 group">
              <div className="flex items-center justify-center gap-1">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span className="text-lg font-bold text-green-600 group-hover:underline">
                  {stats?.by_status.won || 0}
                </span>
              </div>
              <p className="text-xs text-gray-500">Won</p>
            </Link>
            <div className="w-px bg-gray-200 dark:bg-gray-700" />
            <Link href="/opportunities?status=lost" className="flex-1 group">
              <div className="flex items-center justify-center gap-1">
                <XCircle className="h-4 w-4 text-red-500" />
                <span className="text-lg font-bold text-red-600 group-hover:underline">
                  {stats?.by_status.lost || 0}
                </span>
              </div>
              <p className="text-xs text-gray-500">Lost</p>
            </Link>
            <div className="w-px bg-gray-200 dark:bg-gray-700" />
            <Link href="/opportunities?status=rejected" className="flex-1 group">
              <div className="flex items-center justify-center gap-1">
                <XCircle className="h-4 w-4 text-gray-400" />
                <span className="text-lg font-bold text-gray-600 group-hover:underline">
                  {stats?.by_status.rejected || 0}
                </span>
              </div>
              <p className="text-xs text-gray-500">Rejected</p>
            </Link>
          </div>
        </footer>
      </main>
    </div>
  )
}
