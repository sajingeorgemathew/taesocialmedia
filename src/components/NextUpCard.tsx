import { PROGRAM_SHORT, type PostStatus, type SocialPost } from '../types'
import { formatLongDate, relativeDayLabel } from '../utils/date'
import { isOverdue, nextStatus } from '../utils/posts'
import { StatusBadge } from './StatusBadge'

interface NextUpCardProps {
  post: SocialPost | null
  today: string
  onOpen: (post: SocialPost) => void
  onStatusChange: (post: SocialPost, status: PostStatus) => void
  onViewQueue: () => void
}

export function NextUpCard({ post, today, onOpen, onStatusChange, onViewQueue }: NextUpCardProps) {
  if (!post) {
    return (
      <section className="panel next-up next-up-empty">
        <h2 className="panel-title">Next up</h2>
        <p>Every post is published. Add a new post to keep the calendar going.</p>
      </section>
    )
  }

  const overdue = isOverdue(post, today)
  const advanceTo = nextStatus(post.status)

  return (
    <section className={`panel next-up${overdue ? ' is-overdue' : ''}`}>
      <div className="panel-heading">
        <h2 className="panel-title">Next up</h2>
        <button type="button" className="link-button" onClick={onViewQueue}>
          View queue
        </button>
      </div>
      <p className="next-up-date">
        {formatLongDate(post.publishDate)}
        <span className={`pill${overdue ? ' pill-danger' : ''}`}>
          {overdue ? `Overdue · ${relativeDayLabel(post.publishDate, today)}` : relativeDayLabel(post.publishDate, today)}
        </span>
      </p>
      <h3 className="next-up-title">{post.title}</h3>
      <p className="next-up-meta">
        {PROGRAM_SHORT[post.program]} · {post.format} · {post.platforms.join(', ') || 'No platforms'}
      </p>
      <div className="next-up-status">
        <StatusBadge status={post.status} />
        <span className="muted">{post.designer ? `Designer: ${post.designer}` : 'Designer unassigned'}</span>
      </div>
      <div className="next-up-actions">
        <button type="button" className="button button-secondary" onClick={() => onOpen(post)}>
          Open post
        </button>
        {advanceTo && (
          <button
            type="button"
            className="button button-primary"
            onClick={() => onStatusChange(post, advanceTo)}
          >
            {advanceTo === 'Published' ? 'Mark Published' : `Move to ${advanceTo}`}
          </button>
        )}
      </div>
    </section>
  )
}
