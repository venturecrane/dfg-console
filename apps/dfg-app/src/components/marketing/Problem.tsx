export function Problem() {
  return (
    <section className="bg-gray-100 dark:bg-gray-800 py-16 px-4 sm:px-6">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-2xl sm:text-3xl font-semibold text-gray-900 dark:text-white mb-10">
          Scouting auctions by hand does not scale.
        </h2>
        <div className="grid gap-8 sm:grid-cols-2">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-4 font-mono">
              How it usually goes
            </h3>
            <ul className="space-y-3 text-gray-600 dark:text-gray-300">
              <li className="flex gap-3">
                <span className="shrink-0 mt-1 text-gray-400 dark:text-gray-500" aria-hidden="true">
                  ×
                </span>
                <span>Three browser tabs, two coffees, and you have looked at twenty lots.</span>
              </li>
              <li className="flex gap-3">
                <span className="shrink-0 mt-1 text-gray-400 dark:text-gray-500" aria-hidden="true">
                  ×
                </span>
                <span>Comp prices are guesses. So are the bid ceilings.</span>
              </li>
              <li className="flex gap-3">
                <span className="shrink-0 mt-1 text-gray-400 dark:text-gray-500" aria-hidden="true">
                  ×
                </span>
                <span>The lot you wanted closed while you were finishing the spreadsheet.</span>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-700 dark:text-gray-200 mb-4 font-mono">
              How Durgan Field Guide does it
            </h3>
            <ul className="space-y-3 text-gray-900 dark:text-white">
              <li className="flex gap-3">
                <span className="shrink-0 mt-1 text-blue-600 dark:text-blue-400" aria-hidden="true">
                  ✓
                </span>
                <span>Sources scraped continuously. Every new lot enters the inbox.</span>
              </li>
              <li className="flex gap-3">
                <span className="shrink-0 mt-1 text-blue-600 dark:text-blue-400" aria-hidden="true">
                  ✓
                </span>
                <span>AI-powered profit analysis with comp lookups and bid ceilings.</span>
              </li>
              <li className="flex gap-3">
                <span className="shrink-0 mt-1 text-blue-600 dark:text-blue-400" aria-hidden="true">
                  ✓
                </span>
                <span>Strike-zone alerts. Inspection checklists. A short list, not a backlog.</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}
