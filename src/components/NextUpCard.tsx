import { ArrowRight, Sparkles } from 'lucide-react'
import { PROGRAM_SHORT, type PostStatus, type SocialPost } from '../types'
import { formatLongDate, relativeDayLabel } from '../utils/date'
import { designerLabel, isOverdue, nextStatus } from '../utils/posts'
import { StatusBadge } from './StatusBadge'
import { PlatformMarks } from './ui/PlatformMarks'

interface NextUpCardProps {
  post: SocialPost | null
  today: string
  onOpen: (post: SocialPost) => void
  onStatusChange: (post: SocialPost, status: PostStatus) => void
  onViewQueue: () => void
  /** Statuses the signed-in person may choose for a post. */
  statusOptions: (post: SocialPost) => readonly PostStatus[]
  emptyMessage?: string
}

export function NextUpCard({
  post,
  today,
  onOpen,
  onStatusChange,
  onViewQueue,
  statusOptions,
  emptyMessage = 'Every post is published. Add a new post to keep the calendar going.',
}: NextUpCardProps) {
  if (!post) {
    return (
      <section className="panel next-up next-up-empty">
        <h2 className="panel-title">
          <Sparkles aria-hidden="true" />
          Next up
        </h2>
        <p className="muted small">{emptyMessage}</p>
      </section>
    )
  }

  const overdue = isOverdue(post, today)
  const next = nextStatus(post.status)
  const advanceTo = next && statusOptions(post).includes(next) ? next : null

  return (
    <section className={`panel next-up${overdue ? ' is-overdue' : ''}`}>
      <div className="panel-heading">
        <h2 className="panel-title">
          <Sparkles aria-hidden="true" />
          Next up
        </h2>
        <button type="button" className="link-button" onClick={onViewQueue}>
          View queue <ArrowRight aria-hidden="true" />
        </button>
      </div>
      <p className="next-up-date">
        {formatLongDate(post.publishDate)}
        <span className={`pill${overdue ? ' pill-danger' : ' pill-navy'}`}>
          {overdue ? `Overdue · ${relativeDayLabel(post.publishDate, today)}` : relativeDayLabel(post.publishDate, today)}
        </span>
      </p>
      <h3 className="next-up-title">{post.title}</h3>
      <p className="next-up-meta">
        <span>
          {PROGRAM_SHORT[post.program]} · {post.format}
        </span>
        <PlatformMarks platforms={post.platforms} size="small" />
      </p>
      <div className="next-up-status">
        <StatusBadge status={post.status} />
        <span className="muted small">{post.designer ? `Primary designer: ${designerLabel(post)}` : 'Designer unassigned'}</span>
      </div>
      <div className="next-up-actions">
        <button type="button" className="button button-secondary button-small" onClick={() => onOpen(post)}>
          Open post
        </button>
        {advanceTo && (
          <button type="button" className="button button-primary button-small" onClick={() => onStatusChange(post, advanceTo)}>
            {advanceTo === 'Published' ? 'Mark Published' : `Move to ${advanceTo}`}
          </button>
        )}
      </div>
    </section>
  )
}
