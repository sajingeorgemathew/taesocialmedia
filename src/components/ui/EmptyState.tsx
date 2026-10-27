import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

interface EmptyStateProps {
  icon?: LucideIcon
  title?: string
  children?: ReactNode
  action?: ReactNode
  role?: 'status'
}

/** A friendly placeholder for lists and panels with nothing to show. */
export function EmptyState({ icon: Icon, title, children, action, role }: EmptyStateProps) {
  return (
    <div className="empty-state" role={role}>
      {Icon && (
        <span className="empty-state-icon" aria-hidden="true">
          <Icon />
        </span>
      )}
      {title && <p className="empty-state-title">{title}</p>}
      {children && <p>{children}</p>}
      {action && <div className="empty-state-action">{action}</div>}
    </div>
  )
}
