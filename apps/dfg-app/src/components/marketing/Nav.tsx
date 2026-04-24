import Link from 'next/link'

// Sign-in CTA is intentionally hidden during private alpha. The /sign-in
// route still exists; just unlinked from the public marketing surface.
// Re-add when public beta opens.
export function Nav() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-gray-50/90 dark:bg-gray-900/90 backdrop-blur-sm border-b border-gray-200 dark:border-gray-800">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex justify-between items-center">
        <Link href="/" className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-gray-800 text-white text-xs font-bold tracking-tight dark:bg-gray-200 dark:text-gray-900">
            DFG
          </span>
          <span className="text-base font-semibold text-gray-900 dark:text-white tracking-tight">
            Durgan Field Guide
          </span>
        </Link>
        <a
          href="#waitlist"
          className="text-sm font-medium text-gray-900 dark:text-white hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
        >
          Join the list
        </a>
      </div>
    </nav>
  )
}
