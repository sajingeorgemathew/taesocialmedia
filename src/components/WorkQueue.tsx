import { PROGRAM_SHORT, type PostStatus, type SocialPost } from '../types'
import { formatLongDate, relativeDayLabel } from '../utils/date'
import { designerLabel, getWorkQueue, isOverdue, nextStatus } from '../utils/posts'
import { StatusSelect } from './StatusBadge'

interface WorkQueueProps {
  posts: SocialPost[]
  today: string
  onOpen: (post: SocialPost) => void
  onStatusChange: (post: SocialPost, status: PostStatus) => void
  /** Statuses the signed-in person may choose for a post. */
  statusOptions: (post: SocialPost) => readonly PostStatus[]
}

/** Unfinished posts in date order, with overdue items listed first. */
export function WorkQueue({ posts, today, onOpen, onStatusChange, statusOptions }: WorkQueueProps) {
  const queue = getWorkQueue(posts)
  const overdue = queue.filter((p) => isOverdue(p, today))
  const upcoming = queue.filter((p) => !isOverdue(p, today))

  if (queue.length === 0) {
    return <p className="empty-state">Nothing left to do — all matching posts are published.</p>
  }

  const renderItem = (post: SocialPost, position: number) => {
    const options = statusOptions(post)
    const next = nextStatus(post.status)
    const advanceTo = next && options.includes(next) ? next : null
    return (
      <li key={post.id} className={`queue-item${position === 0 ? ' is-next' : ''}`}>
        <span className="queue-position" aria-hidden="true">
          {position + 1}
        </span>
        <button type="button" className="queue-main" onClick={() => onOpen(post)}>
          <span className="queue-date">
            {formatLongDate(post.publishDate)} · {relativeDayLabel(post.publishDate, today)}
          </span>
          <span className="queue-title">{post.title}</span>
          <span className="queue-meta">
            {PROGRAM_SHORT[post.program]} · {post.format} · {designerLabel(post, 'Designer unassigned')}
          </span>
        </button>
        <div className="queue-actions">
          <StatusSelect status={post.status} options={options} onChange={(status) => onStatusChange(post, status)} />
          {advanceTo && (
            <button
              type="button"
              className="button button-secondary button-small"
              onClick={() => onStatusChange(post, advanceTo)}
            >
              {advanceTo === 'Published' ? 'Mark Published' : `→ ${advanceTo}`}
            </button>
          )}
        </div>
      </li>
    )
  }

  return (
    <div className="work-queue">
      {overdue.length > 0 && (
        <section>
          <h3 className="queue-heading queue-heading-danger">Overdue ({overdue.length})</h3>
          <ol className="queue-list">{overdue.map((post, i) => renderItem(post, i))}</ol>
        </section>
      )}
      {upcoming.length > 0 && (
        <section>
          <h3 className="queue-heading">Upcoming ({upcoming.length})</h3>
          <ol className="queue-list">
            {upcoming.map((post, i) => renderItem(post, overdue.length + i))}
          </ol>
        </section>
      )}
    </div>
  )
}
