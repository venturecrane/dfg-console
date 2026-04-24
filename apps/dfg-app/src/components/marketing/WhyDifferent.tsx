const differentiators = [
  {
    title: 'Built by an operator, not a vendor',
    body: 'Durgan Field Guide started as the internal tool we use to run our own arbitrage operation. Every feature exists because we needed it ourselves. It is not a SaaS dashboard with auction data bolted on.',
  },
  {
    title: 'Scoring you can audit',
    body: 'Every lot score is traceable: comp source, condition signals, freight assumptions, AI reasoning. No black box. When the model says pass, you can see why.',
  },
  {
    title: 'No platform lock-in',
    body: 'Your watchlist, your notes, your bidding history — exportable any time. The product is the leverage, not the hostage.',
  },
]

export function WhyDifferent() {
  return (
    <section className="bg-gray-100 dark:bg-gray-800 py-16 px-4 sm:px-6">
      <div className="max-w-5xl mx-auto">
        <h2 className="text-2xl sm:text-3xl font-semibold text-gray-900 dark:text-white mb-12 text-center">
          Why it is different
        </h2>
        <div className="grid gap-6 md:grid-cols-3">
          {differentiators.map((item) => (
            <div
              key={item.title}
              className="bg-white dark:bg-gray-900 p-6 rounded-lg border border-gray-200 dark:border-gray-700"
            >
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                {item.title}
              </h3>
              <p className="text-gray-600 dark:text-gray-300 leading-relaxed">{item.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
