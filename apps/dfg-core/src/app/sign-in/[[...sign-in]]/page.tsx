import { SignIn } from '@clerk/nextjs'
import { Terminal } from 'lucide-react'

export default function SignInPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <div className="bg-blue-100 dark:bg-blue-900/30 p-3 rounded-full mb-4">
            <Terminal className="h-8 w-8 text-blue-600 dark:text-blue-400" />
          </div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
            DFG Command Center
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Sign in to access internal tooling
          </p>
        </div>
        <div className="flex justify-center">
          <SignIn signUpUrl="/sign-in" forceRedirectUrl="/" />
        </div>
        <p className="text-xs text-center text-gray-500 dark:text-gray-400 mt-6">
          Restricted access · Dev Team only
        </p>
      </div>
    </div>
  )
}
