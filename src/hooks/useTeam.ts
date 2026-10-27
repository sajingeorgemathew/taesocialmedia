import { useCallback, useEffect, useState } from 'react'
import { errorMessage } from '../storage'
import { listTeam, type TeamAccount } from '../team/teamRepository'

/** Loads the team list once; used for the designer dropdown and names. */
export function useTeam() {
  const [team, setTeam] = useState<TeamAccount[]>([])
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      setTeam(await listTeam())
      setError(null)
    } catch (err) {
      setError(errorMessage(err, 'Could not load the team list.'))
    }
  }, [])

  useEffect(() => {
    let active = true
    listTeam()
      .then((loaded) => {
        if (active) setTeam(loaded)
      })
      .catch((err: unknown) => {
        if (active) setError(errorMessage(err, 'Could not load the team list.'))
      })
    return () => {
      active = false
    }
  }, [])

  return { team, error, reload }
}
