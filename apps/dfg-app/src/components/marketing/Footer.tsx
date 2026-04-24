import Link from 'next/link'

export function Footer() {
  const year = new Date().getFullYear()
  return (
    <footer className="bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 py-10 px-4 sm:px-6">
      <div className="max-w-5xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-5">
        <div className="flex flex-col items-center sm:items-start gap-1">
          <span className="text-base font-semibold text-gray-900 dark:text-white">
            Durgan Field Guide
          </span>
          <p className="text-gray-500 dark:text-gray-400 text-xs">
            © {year} Durgan Field Guide. All rights reserved.
          </p>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap justify-center gap-6">
          <a
            href="#waitlist"
            className="text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            Join the list
          </a>
          <Link
            href="/sign-in"
            className="text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            Sign in
          </Link>
        </nav>
      </div>
    </footer>
  )
}
