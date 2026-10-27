import { STATUSES, type PostStatus } from '../types'
import { statusSlug } from '../utils/posts'

export function StatusBadge({ status }: { status: PostStatus }) {
  return <span className={`status-badge status-${statusSlug(status)}`}>{status}</span>
}

interface StatusSelectProps {
  status: PostStatus
  onChange: (status: PostStatus) => void
  label?: string
  /** Statuses the person may choose; defaults to all. */
  options?: readonly PostStatus[]
}

/** Compact dropdown for changing a post's status outside the editor. */
export function StatusSelect({ status, onChange, label = 'Change status', options = STATUSES }: StatusSelectProps) {
  const choices = STATUSES.filter((s) => s === status || options.includes(s))
  return (
    <select
      className={`status-select status-${statusSlug(status)}`}
      value={status}
      aria-label={label}
      disabled={choices.length <= 1}
      onChange={(e) => onChange(e.target.value as PostStatus)}
      onClick={(e) => e.stopPropagation()}
    >
      {choices.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  )
}
