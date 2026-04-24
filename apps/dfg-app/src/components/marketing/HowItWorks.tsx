const steps = [
  {
    number: '01',
    title: 'Scout pulls listings',
    body: 'A continuous scraper watches the major auction platforms and ingests every new lot into your inbox the moment it appears.',
  },
  {
    number: '02',
    title: 'Analyst scores each lot',
    body: 'Comp pricing, condition signals, photo analysis, freight estimates — the analyst layer scores every lot for expected margin and confidence.',
  },
  {
    number: '03',
    title: 'You see a short list',
    body: 'Strike-zone alerts surface only the lots worth your time. Verification gates flag the ones that need an in-person look. Pass on the rest with one tap.',
  },
]

export function HowItWorks() {
  return (
    <section className="py-16 px-4 sm:px-6">
      <div className="max-w-5xl mx-auto">
        <h2 className="text-2xl sm:text-3xl font-semibold text-gray-900 dark:text-white mb-12 text-center">
          How it works
        </h2>
        <div className="grid gap-10 sm:gap-12 md:grid-cols-3">
          {steps.map((step) => (
            <div key={step.number}>
              <div className="text-gray-400 dark:text-gray-500 text-2xl font-mono mb-3">
                {step.number}
              </div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                {step.title}
              </h3>
              <p className="text-gray-600 dark:text-gray-300 leading-relaxed">{step.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
