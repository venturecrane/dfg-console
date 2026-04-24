'use client'

// Auth context is provided by ClerkProvider in app/layout.tsx.
// This component remains as a place to add cross-cutting client providers
// (theme, toast, query client, etc.) without churning the layout each time.
export function Providers({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
