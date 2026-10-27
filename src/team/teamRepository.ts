import type { TeamRole } from '../auth/authContext'
import { getSupabase } from '../lib/supabase'
import { toAppError } from '../storage/supabasePostRepository'

/** A TAE account from public.team_members. */
export interface TeamAccount {
  userId: string
  email: string
  displayName: string
  role: TeamRole
  active: boolean
}

interface TeamRow {
  user_id: string
  email: string
  display_name: string
  role: TeamRole
  active: boolean
}

/** The name shown for an account: display name, or the email when none is set. */
export function accountLabel(account: Pick<TeamAccount, 'displayName' | 'email'>): string {
  return account.displayName.trim() || account.email
}

/** Every team account (team members can read the team list; see RLS). */
export async function listTeam(): Promise<TeamAccount[]> {
  const { data, error } = await getSupabase()
    .from('team_members')
    .select('user_id, email, display_name, role, active')
  if (error) throw toAppError(error)
  return (data as TeamRow[])
    .map((row) => ({
      userId: row.user_id,
      email: row.email,
      displayName: row.display_name,
      role: row.role,
      active: row.active,
    }))
    .sort((a, b) => accountLabel(a).localeCompare(accountLabel(b)))
}
