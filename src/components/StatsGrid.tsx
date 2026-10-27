import { Layers } from 'lucide-react'
import { STATUSES, type PostStatus } from '../types'
import type { PostStats } from '../utils/posts'
import { statusSlug } from '../utils/posts'

const STATUS_LABELS: Record<(typeof STATUSES)[number], string> = {
  Planned: 'Planned',
  'In Design': 'In design',
  'Ready for Review': 'Awaiting review',
  Approved: 'Approved',
  Published: 'Published',
}

interface StatsGridProps {
  stats: PostStats
  /** Optional: make each status card open the matching posts. */
  onSelectStatus?: (status: PostStatus) => void
}

export function StatsGrid({ stats, onSelectStatus }: StatsGridProps) {
  return (
    <section className="stats-grid" aria-label="Dashboard statistics">
      <div className="stat-card stat-total">
        <span className="stat-label">
          <Layers aria-hidden="true" />
          Total planned posts
        </span>
        <span className="stat-value">{stats.total}</span>
        <span className={`stat-hint${stats.overdue > 0 ? ' is-danger' : ''}`}>
          {stats.overdue > 0 ? `${stats.overdue} overdue` : 'Nothing overdue'}
        </span>
      </div>
      {STATUSES.map((status) => {
        const content = (
          <>
            <span className="stat-label">
              <span className="status-dot" aria-hidden="true" />
              {STATUS_LABELS[status]}
            </span>
            <span className="stat-value">{stats.byStatus[status]}</span>
            <span className="stat-bar" aria-hidden="true">
              <span style={{ width: `${stats.total ? (stats.byStatus[status] / stats.total) * 100 : 0}%` }} />
            </span>
          </>
        )
        return onSelectStatus ? (
          <button
            key={status}
            type="button"
            className={`stat-card status-${statusSlug(status)} is-clickable`}
            onClick={() => onSelectStatus(status)}
            aria-label={`${STATUS_LABELS[status]}: ${stats.byStatus[status]} — show these posts`}
          >
            {content}
          </button>
        ) : (
          <div key={status} className={`stat-card status-${statusSlug(status)}`}>
            {content}
          </div>
        )
      })}
    </section>
  )
}
