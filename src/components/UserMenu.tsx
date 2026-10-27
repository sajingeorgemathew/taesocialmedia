import { ChevronsUpDown, Download, LogOut, Mail, RefreshCw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { TeamMember } from '../auth/authContext'

interface UserMenuProps {
  member: TeamMember
  onRefresh: () => void
  onImport: () => void
  onEmailReminders: () => void
  onSignOut: () => void
  /** Collapsed sidebar: show only the avatar. */
  compact?: boolean
}

function initials(member: TeamMember): string {
  const source = member.displayName.trim() || member.email
  const parts = source.split(/[\s@._-]+/).filter(Boolean)
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : source.slice(0, 2)).toUpperCase()
}

function roleLabel(member: TeamMember): string {
  return member.role === 'admin' ? 'Administrator' : 'Designer'
}

export function UserMenu({ member, onRefresh, onImport, onEmailReminders, onSignOut, compact = false }: UserMenuProps) {
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
    <div className={`user-menu${compact ? ' is-compact' : ''}`} ref={rootRef}>
      <button
        type="button"
        className="user-menu-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={compact ? `Account menu for ${member.displayName || member.email}` : undefined}
        onClick={() => setOpen((v) => !v)}
        title={member.email}
      >
        <span className="user-avatar" aria-hidden="true">
          {initials(member)}
        </span>
        {!compact && (
          <>
            <span className="user-menu-text">
              <span className="user-menu-name">{member.displayName || member.email}</span>
              <span className="user-menu-role">{roleLabel(member)}</span>
            </span>
            <ChevronsUpDown className="user-menu-chevron" aria-hidden="true" />
          </>
        )}
      </button>
      {open && (
        <div className="menu user-menu-panel" role="menu">
          <div className="user-menu-identity">
            <span className="user-avatar user-avatar-large" aria-hidden="true">
              {initials(member)}
            </span>
            <span className="user-menu-identity-text">
              <span className="user-menu-identity-name">{member.displayName || member.email}</span>
              <span className="user-menu-email">{member.email}</span>
              <span className={`role-badge${member.role === 'admin' ? '' : ' is-designer'}`}>{roleLabel(member)}</span>
            </span>
          </div>
          <div className="menu-separator" />
          <button type="button" role="menuitem" className="menu-item" onClick={choose(onRefresh)}>
            <RefreshCw aria-hidden="true" />
            Refresh posts
          </button>
          {member.role === 'admin' && (
            <button type="button" role="menuitem" className="menu-item" onClick={choose(onImport)}>
              <Download aria-hidden="true" />
              Import posts from this browser…
            </button>
          )}
          {member.role === 'admin' && (
            <button type="button" role="menuitem" className="menu-item" onClick={choose(onEmailReminders)}>
              <Mail aria-hidden="true" />
              Email reminders
            </button>
          )}
          <div className="menu-separator" />
          <button type="button" role="menuitem" className="menu-item" onClick={choose(onSignOut)}>
            <LogOut aria-hidden="true" />
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
