import { STATUSES } from '../types'
import type { PostStats } from '../utils/posts'
import { statusSlug } from '../utils/posts'

const STATUS_LABELS: Record<(typeof STATUSES)[number], string> = {
  Planned: 'Planned',
  'In Design': 'In design',
  'Ready for Review': 'Awaiting review',
  Approved: 'Approved',
  Published: 'Published',
}

export function StatsGrid({ stats }: { stats: PostStats }) {
  return (
    <section className="stats-grid" aria-label="Dashboard statistics">
      <div className="stat-card stat-total">
        <span className="stat-label">Total planned posts</span>
        <span className="stat-value">{stats.total}</span>
        <span className="stat-hint">
          {stats.overdue > 0 ? `${stats.overdue} overdue` : 'Nothing overdue'}
        </span>
      </div>
      {STATUSES.map((status) => (
        <div key={status} className={`stat-card status-${statusSlug(status)}`}>
          <span className="stat-label">
            <span className="status-dot" aria-hidden="true" />
            {STATUS_LABELS[status]}
          </span>
          <span className="stat-value">{stats.byStatus[status]}</span>
        </div>
      ))}
    </section>
  )
}
