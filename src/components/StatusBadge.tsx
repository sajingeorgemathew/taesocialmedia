import { STATUSES, type PostStatus } from '../types'
import { statusSlug } from '../utils/posts'

export function StatusBadge({ status }: { status: PostStatus }) {
  return <span className={`status-badge status-${statusSlug(status)}`}>{status}</span>
}

interface StatusSelectProps {
  status: PostStatus
  onChange: (status: PostStatus) => void
  label?: string
}

/** Compact dropdown for changing a post's status outside the editor. */
export function StatusSelect({ status, onChange, label = 'Change status' }: StatusSelectProps) {
  return (
    <select
      className={`status-select status-${statusSlug(status)}`}
      value={status}
      aria-label={label}
      onChange={(e) => onChange(e.target.value as PostStatus)}
      onClick={(e) => e.stopPropagation()}
    >
      {STATUSES.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  )
}
