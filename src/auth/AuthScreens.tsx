import { useState, type FormEvent, type ReactNode } from 'react'
import type { SupabaseConfigProblem } from '../lib/supabase'
import { useAuth } from './authContext'

/** Centered, branded card shared by every pre-app screen. */
function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="brand-mark" aria-hidden="true">
            TAE
          </span>
          <div>
            <p className="auth-product">TAE Social Media Manager</p>
            <p className="auth-org">Toronto Academy of Education</p>
          </div>
        </div>
        <div className="auth-body">
          <h1 className="auth-title">{title}</h1>
          {subtitle && <p className="auth-subtitle">{subtitle}</p>}
          {children}
        </div>
      </div>
    </div>
  )
}

export function LoadingScreen({ message }: { message: string }) {
  return (
    <AuthLayout title="One moment">
      <p className="auth-status" role="status">
        <span className="spinner" aria-hidden="true" />
        {message}
      </p>
    </AuthLayout>
  )
}

export function LoginScreen() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password) {
      setError('Enter your email and password.')
      return
    }
    setSubmitting(true)
    setError(null)
    const problem = await signIn(email, password)
    // On success the provider swaps this screen out; only failures land here.
    if (problem) {
      setError(problem)
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout title="Sign in" subtitle="For authorized TAE team members only.">
      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <label className="field">
          <span>Email</span>
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={Boolean(error)}
            autoFocus
          />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={Boolean(error)}
          />
        </label>
        {error && (
          <p className="alert" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="button button-primary auth-submit" disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p className="auth-footnote">
        Accounts are created by your administrator. Forgot your password? Ask your administrator to reset it.
      </p>
    </AuthLayout>
  )
}

export function AccessDeniedScreen({ email }: { email: string | undefined }) {
  const { signOut } = useAuth()
  return (
    <AuthLayout title="Access not granted">
      <p className="auth-text">
        You are signed in as <strong>{email ?? 'an unknown account'}</strong>, but this account has not been added
        to the TAE social media team, or it has been disabled.
      </p>
      <p className="auth-text muted">Ask your administrator to give you access, then sign in again.</p>
      <button type="button" className="button button-primary auth-submit" onClick={() => void signOut()}>
        Sign out
      </button>
    </AuthLayout>
  )
}

export function AccessErrorScreen({ message }: { message: string }) {
  const { signOut, retryAccessCheck } = useAuth()
  return (
    <AuthLayout title="Could not check your access">
      <p className="alert" role="alert">
        {message}
      </p>
      <div className="auth-actions">
        <button type="button" className="button button-ghost" onClick={() => void signOut()}>
          Sign out
        </button>
        <button type="button" className="button button-primary" onClick={retryAccessCheck}>
          Try again
        </button>
      </div>
    </AuthLayout>
  )
}

export function SetupRequiredScreen({ problem }: { problem: Exclude<SupabaseConfigProblem, null> }) {
  return (
    <AuthLayout title="Supabase setup required">
      {problem === 'secret-key' ? (
        <p className="alert" role="alert">
          VITE_SUPABASE_PUBLISHABLE_KEY contains a secret (service role) key. Secret keys must never be used in the
          browser. Replace it with the publishable key and rotate the secret key in Supabase.
        </p>
      ) : (
        <p className="auth-text">
          This app needs <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_PUBLISHABLE_KEY</code>. Copy{' '}
          <code>.env.example</code> to <code>.env.local</code>, fill in your project values and restart the dev
          server.
        </p>
      )}
      <p className="auth-text muted">See SUPABASE_SETUP.md for step-by-step instructions.</p>
    </AuthLayout>
  )
}
