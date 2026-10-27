import { useEffect, useRef, useState } from 'react'
import type { TeamMember } from '../auth/authContext'

interface UserMenuProps {
  member: TeamMember
  onRefresh: () => void
  onImport: () => void
  onEmailReminders: () => void
  onSignOut: () => void
}

function initials(member: TeamMember): string {
  const source = member.displayName.trim() || member.email
  const parts = source.split(/[\s@._-]+/).filter(Boolean)
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : source.slice(0, 2)).toUpperCase()
}

export function UserMenu({ member, onRefresh, onImport, onEmailReminders, onSignOut }: UserMenuProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const closeOnOutside = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const closeOnEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', closeOnOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOnOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  const choose = (action: () => void) => () => {
    setOpen(false)
    action()
  }

  return (
    <div className="user-menu" ref={rootRef}>
      <button
        type="button"
        className="user-menu-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        title={member.email}
      >
        <span className="user-avatar" aria-hidden="true">
          {initials(member)}
        </span>
        <span className="user-menu-name">{member.displayName || member.email}</span>
      </button>
      {open && (
        <div className="user-menu-panel" role="menu">
          <div className="user-menu-identity">
            <span className="user-menu-email">{member.email}</span>
            <span className="muted small">{member.role === 'admin' ? 'Administrator' : 'Team member'}</span>
          </div>
          <button type="button" role="menuitem" className="user-menu-item" onClick={choose(onRefresh)}>
            Refresh posts
          </button>
          {member.role === 'admin' && (
            <button type="button" role="menuitem" className="user-menu-item" onClick={choose(onImport)}>
              Import posts from this browser…
            </button>
          )}
          {member.role === 'admin' && (
            <button type="button" role="menuitem" className="user-menu-item" onClick={choose(onEmailReminders)}>
              Email reminders
            </button>
          )}
          <button type="button" role="menuitem" className="user-menu-item" onClick={choose(onSignOut)}>
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
