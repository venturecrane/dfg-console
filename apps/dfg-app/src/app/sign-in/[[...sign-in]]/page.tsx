import { SignIn } from '@clerk/nextjs'

export default function SignInPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
            Durgan Field Guide
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Sign in to access the operator console
          </p>
        </div>
        <div className="flex justify-center">
          <SignIn signUpUrl="/sign-in" forceRedirectUrl="/dashboard" />
        </div>
      </div>
    </div>
  )
}
