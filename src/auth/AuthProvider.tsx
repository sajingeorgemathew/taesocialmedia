import type { Session } from '@supabase/supabase-js'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { getSupabase } from '../lib/supabase'
import { toAppError } from '../storage/supabasePostRepository'
import { AuthContext, type AuthContextValue, type AuthState, type TeamMember, type TeamRole } from './authContext'

type AccessCheck =
  | { userId: string; status: 'checking' }
  | { userId: string; status: 'authorized'; member: TeamMember }
  | { userId: string; status: 'unauthorized' }
  | { userId: string; status: 'error'; message: string }

interface MemberRow {
  user_id: string
  email: string
  display_name: string
  role: TeamRole
  active: boolean
}

function signInErrorMessage(message: string): string {
  if (/invalid login credentials/i.test(message)) return 'Incorrect email or password.'
  if (/email not confirmed/i.test(message)) {
    return 'This account has not been confirmed yet. Ask your administrator to confirm it.'
  }
  if (/rate limit|too many/i.test(message)) return 'Too many sign-in attempts. Please wait a minute and try again.'
  return toAppError(new Error(message)).message
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // undefined while the stored session is being restored.
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [access, setAccess] = useState<AccessCheck | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const auth = getSupabase().auth
    let active = true
    auth
      .getSession()
      .then(({ data }) => {
        if (active) setSession(data.session)
      })
      .catch(() => {
        if (active) setSession(null)
      })
    // Keep this callback synchronous: Supabase warns against awaiting inside it.
    const { data } = auth.onAuthStateChange((_event, next) => setSession(next))
    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [])

  const userId = session?.user.id

  // Membership is checked per user, not per token refresh.
  useEffect(() => {
    if (!userId) return
    let active = true
    getSupabase()
      .from('team_members')
      .select('user_id, email, display_name, role, active')
      .eq('user_id', userId)
      .maybeSingle<MemberRow>()
      .then(({ data, error }) => {
        if (!active) return
        if (error) setAccess({ userId, status: 'error', message: toAppError(error).message })
        else if (!data || data.active === false) setAccess({ userId, status: 'unauthorized' })
        else
          setAccess({
            userId,
            status: 'authorized',
            member: { userId, email: data.email, displayName: data.display_name, role: data.role },
          })
      })
    return () => {
      active = false
    }
  }, [userId, attempt])

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      const { error } = await getSupabase().auth.signInWithPassword({ email: email.trim(), password })
      return error ? signInErrorMessage(error.message) : null
    } catch (err) {
      return signInErrorMessage(err instanceof Error ? err.message : '')
    }
  }, [])

  const signOut = useCallback(async () => {
    const { error } = await getSupabase().auth.signOut()
    // Even if the server call fails, the local session is cleared.
    if (error) console.warn('Sign-out did not reach the server.', error)
    setSession(null)
    setAccess(null)
  }, [])

  const retryAccessCheck = useCallback(() => {
    setAccess((prev) => (prev ? { userId: prev.userId, status: 'checking' } : prev))
    setAttempt((n) => n + 1)
  }, [])

  const state: AuthState = useMemo(() => {
    if (session === undefined) return { status: 'loading', message: 'Restoring your session…' }
    if (session === null) return { status: 'signed-out' }
    const user = session.user
    if (!access || access.userId !== user.id || access.status === 'checking') {
      return { status: 'loading', message: 'Checking your team access…' }
    }
    if (access.status === 'error') return { status: 'error', user, message: access.message }
    if (access.status === 'unauthorized') return { status: 'unauthorized', user }
    return { status: 'authorized', user, member: access.member }
  }, [session, access])

  const value: AuthContextValue = useMemo(
    () => ({ state, signIn, signOut, retryAccessCheck }),
    [state, signIn, signOut, retryAccessCheck],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
