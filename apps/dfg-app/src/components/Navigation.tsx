'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { LayoutDashboard, Search, Settings, Menu, X, ArrowLeft, Database } from 'lucide-react'

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Opportunities', href: '/opportunities', icon: Search },
  { name: 'Sources', href: '/sources', icon: Database },
  { name: 'Settings', href: '/settings', icon: Settings },
]

interface NavigationProps {
  /** Show back button instead of hamburger (for detail pages) */
  showBack?: boolean
  /** Custom back URL (defaults to history.back()) */
  backUrl?: string
  /** Page title to show in header */
  title?: string
}

export function Navigation({ showBack, backUrl, title }: NavigationProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)

  // Close menu on route change
  useEffect(() => {
    setMenuOpen(false)
  }, [pathname])

  // Close menu on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [])

  // Prevent body scroll when menu is open
  useEffect(() => {
    if (menuOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [menuOpen])

  const handleBack = () => {
    if (backUrl) {
      router.push(backUrl)
    } else {
      router.back()
    }
  }

  // Determine if we're on a detail page (has ID in path)
  const isDetailPage = /\/opportunities\/[^/]+$/.test(pathname)
  const shouldShowBack = showBack ?? isDetailPage

  return (
    <>
      {/* Mobile Header - fixed at top, full width (#91) */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 md:hidden">
        <div className="flex items-center justify-between h-14 px-4">
          {/* Left: Back button or Hamburger */}
          {shouldShowBack ? (
            <button
              onClick={handleBack}
              className="p-2 -ml-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
              aria-label="Go back"
            >
              <ArrowLeft className="h-6 w-6" />
            </button>
          ) : (
            <button
              onClick={() => setMenuOpen(true)}
              className="p-2 -ml-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
              aria-label="Open menu"
            >
              <Menu className="h-6 w-6" />
            </button>
          )}

          {/* Center: Logo or Title */}
          {title ? (
            <h1 className="text-base font-semibold text-gray-900 dark:text-white truncate max-w-[200px]">
              {title}
            </h1>
          ) : (
            <Link href="/dashboard" className="flex items-center">
              <Image
                src="/logo.svg"
                alt="DFG"
                width={50}
                height={40}
                className="h-8 w-auto"
                priority
              />
            </Link>
          )}

          {/* Right: Placeholder for balance (or future actions) */}
          <div className="w-10" />
        </div>
      </header>

      {/* Mobile Header Spacer - reserves space for fixed header (#91) */}
      <div className="h-14 shrink-0 md:hidden" aria-hidden="true" />

      {/* Mobile Menu Overlay (#82, #91) */}
      {menuOpen && (
        <div className="fixed inset-0 z-[60] md:hidden">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50" onClick={() => setMenuOpen(false)} />

          {/* Menu Panel - slides in from left, overlays content */}
          <div className="absolute left-0 top-0 bottom-0 w-72 bg-white dark:bg-gray-800 shadow-xl">
            {/* Menu Header */}
            <div className="flex items-center justify-between h-14 px-4 border-b border-gray-200 dark:border-gray-700">
              <Image src="/logo.svg" alt="DFG" width={50} height={40} className="h-8 w-auto" />
              <button
                onClick={() => setMenuOpen(false)}
                className="p-2 -mr-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
                aria-label="Close menu"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            {/* Menu Items */}
            <nav className="px-3 py-4 space-y-1">
              {navigation.map((item) => {
                const isActive =
                  (item.href === '/' && pathname === '/') ||
                  (item.href !== '/' && pathname.startsWith(item.href.split('?')[0]))
                const Icon = item.icon

                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={() => setMenuOpen(false)}
                    className={cn(
                      'flex items-center px-3 py-3 rounded-lg text-base font-medium transition-colors',
                      isActive
                        ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
                        : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
                    )}
                  >
                    <Icon className="h-5 w-5 mr-3" />
                    {item.name}
                  </Link>
                )
              })}
            </nav>

            {/* Menu Footer */}
            <div className="absolute bottom-0 left-0 right-0 px-6 py-4 border-t border-gray-200 dark:border-gray-700 pb-safe">
              <p className="text-xs text-gray-500 dark:text-gray-400">Durgan Field Guide v0.1</p>
            </div>
          </div>
        </div>
      )}

      {/* Desktop Sidebar - fixed width, sticky for scroll */}
      <nav className="hidden md:flex md:flex-col md:sticky md:top-0 md:h-screen md:w-64 md:shrink-0 md:border-r md:border-gray-200 dark:md:border-gray-700 md:bg-white dark:md:bg-gray-800">
        {/* Logo */}
        <div className="flex items-center h-16 px-6 border-b border-gray-200 dark:border-gray-700">
          <Link href="/dashboard" className="flex items-center">
            <Image src="/logo.svg" alt="DFG" width={60} height={48} className="h-10 w-auto" />
          </Link>
        </div>

        {/* Nav items */}
        <div className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navigation.map((item) => {
            const isActive =
              (item.href === '/' && pathname === '/') ||
              (item.href !== '/' && pathname.startsWith(item.href.split('?')[0]))
            const Icon = item.icon

            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
                    : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
                )}
              >
                <Icon className="h-5 w-5 mr-3" />
                {item.name}
              </Link>
            )
          })}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400">Durgan Field Guide v0.1</p>
        </div>
      </nav>
    </>
  )
}
