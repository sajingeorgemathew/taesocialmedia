import type { User } from '@supabase/supabase-js'
import { createContext, useContext } from 'react'

export interface TeamMember {
  userId: string
  email: string
  displayName: string
  role: 'admin' | 'member'
}

export type AuthState =
  | { status: 'loading'; message: string }
  | { status: 'signed-out' }
  /** Signed in, but not on the TAE team list. */
  | { status: 'unauthorized'; user: User }
  | { status: 'error'; user: User; message: string }
  | { status: 'authorized'; user: User; member: TeamMember }

export interface AuthContextValue {
  state: AuthState
  /** Resolves to an error message, or null on success. */
  signIn: (email: string, password: string) => Promise<string | null>
  signOut: () => Promise<void>
  retryAccessCheck: () => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>.')
  return value
}

/** The signed-in team member. Only call below <AuthGate>, where access is confirmed. */
export function useTeamMember(): TeamMember {
  const { state } = useAuth()
  if (state.status !== 'authorized') throw new Error('useTeamMember requires an authorized session.')
  return state.member
}
