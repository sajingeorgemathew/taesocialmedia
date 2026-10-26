import type { ReactNode } from 'react'
import { useAuth } from './authContext'
import { AccessDeniedScreen, AccessErrorScreen, LoadingScreen, LoginScreen } from './AuthScreens'

/** Renders the app only for signed-in, authorized team members. */
export function AuthGate({ children }: { children: ReactNode }) {
  const { state } = useAuth()
  switch (state.status) {
    case 'loading':
      return <LoadingScreen message={state.message} />
    case 'signed-out':
      return <LoginScreen />
    case 'unauthorized':
      return <AccessDeniedScreen email={state.user.email} />
    case 'error':
      return <AccessErrorScreen message={state.message} />
    case 'authorized':
      return <>{children}</>
  }
}
