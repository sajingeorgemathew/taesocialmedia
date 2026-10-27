import { BellRing, CalendarDays, CircleAlert, LoaderCircle, Lock, Palette, Settings2, ShieldAlert } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import type { SupabaseConfigProblem } from '../lib/supabase'
import { useAuth } from './authContext'

const HIGHLIGHTS = [
  { icon: CalendarDays, text: 'One shared calendar for every program and platform' },
  { icon: Palette, text: 'Clear briefs, artwork and review for designers' },
  { icon: BellRing, text: 'Digests and workflow emails keep the office in step' },
]

/** Branded two-panel layout shared by every pre-app screen. */
function AuthLayout({
  title,
  subtitle,
  icon,
  tone,
  children,
}: {
  title: string
  subtitle?: string
  icon?: ReactNode
  tone?: 'danger' | 'neutral'
  children: ReactNode
}) {
  return (
    <div className="auth-screen">
      <aside className="auth-aside" aria-hidden="true">
        <div className="auth-aside-brand">
          <img src="/logo_final_T.png" alt="" width={40} height={40} />
          <div>
            <p className="auth-product">TAE Social Media Manager</p>
            <p className="auth-org">Toronto Academy of Education</p>
          </div>
        </div>
        <div className="auth-aside-body">
          <p className="auth-aside-title">Plan, design and publish — together.</p>
          <ul className="auth-highlights">
            {HIGHLIGHTS.map(({ icon: Icon, text }) => (
              <li key={text}>
                <Icon />
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="auth-aside-footer">Internal tool for the TAE team</p>
      </aside>
      <main className="auth-panel">
        <div className="auth-card">
          <div className="auth-card-brand">
            <img src="/logo_final_T.png" alt="TAE" width={36} height={36} />
            <span>TAE Social Media Manager</span>
          </div>
          {icon && <span className={`auth-icon${tone ? ` is-${tone}` : ''}`}>{icon}</span>}
          <h1 className="auth-title">{title}</h1>
          {subtitle && <p className="auth-subtitle">{subtitle}</p>}
          <div className="auth-body">{children}</div>
        </div>
      </main>
    </div>
  )
}

export function LoadingScreen({ message }: { message: string }) {
  return (
    <AuthLayout title="One moment" icon={<LoaderCircle className="spin" aria-hidden="true" />} tone="neutral">
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
    <AuthLayout title="Sign in" subtitle="Welcome back. For authorized TAE team members only.">
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
            <CircleAlert aria-hidden="true" />
            {error}
          </p>
        )}
        <button type="submit" className="button button-primary auth-submit" disabled={submitting}>
          {submitting && <span className="spinner" aria-hidden="true" />}
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p className="auth-footnote">
        <Lock aria-hidden="true" />
        Accounts are created by your administrator. Forgot your password? Ask your administrator to reset it.
      </p>
    </AuthLayout>
  )
}

export function AccessDeniedScreen({ email }: { email: string | undefined }) {
  const { signOut } = useAuth()
  return (
    <AuthLayout title="Access not granted" icon={<ShieldAlert aria-hidden="true" />} tone="danger">
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
    <AuthLayout title="Could not check your access" icon={<CircleAlert aria-hidden="true" />} tone="danger">
      <p className="alert" role="alert">
        <CircleAlert aria-hidden="true" />
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
    <AuthLayout title="Supabase setup required" icon={<Settings2 aria-hidden="true" />} tone="neutral">
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
