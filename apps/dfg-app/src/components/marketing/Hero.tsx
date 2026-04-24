export function Hero() {
  return (
    <section className="pt-28 pb-16 px-4 sm:px-6 max-w-5xl mx-auto">
      <p className="text-xs uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-5 font-mono">
        Private alpha — invite only
      </p>
      <h1 className="text-4xl sm:text-5xl md:text-6xl font-semibold tracking-tight text-gray-900 dark:text-white leading-[1.1] mb-6">
        Auction intelligence for resellers.
      </h1>
      <p className="text-lg sm:text-xl text-gray-600 dark:text-gray-300 leading-relaxed mb-10 max-w-2xl">
        Solo resellers spend hours scanning auction listings, missing good deals and overpaying on
        bad ones. Durgan Field Guide automates the scouting, scores every lot, and surfaces a
        focused buy-or-pass list. Built first for our own arbitrage operation; opening to others as
        a subscription product.
      </p>
      <a
        href="#waitlist"
        className="inline-flex items-center gap-2 px-6 py-3 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg font-semibold text-base hover:bg-gray-700 dark:hover:bg-gray-200 transition-colors min-h-[44px]"
      >
        Request access
        <svg
          className="w-4 h-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M5 12h14M13 5l7 7-7 7" />
        </svg>
      </a>
    </section>
  )
}
