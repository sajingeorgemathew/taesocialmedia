import { PROGRAM_SHORT, type PostStatus, type SocialPost } from '../types'
import { formatLongDate, relativeDayLabel } from '../utils/date'
import { DESIGNER_STATUSES } from '../utils/permissions'
import { isOverdue, sortByDate } from '../utils/posts'
import { StatusBadge } from './StatusBadge'

interface MyAssignmentsProps {
  posts: SocialPost[]
  userId: string
  today: string
  onOpen: (post: SocialPost) => void
  onStatusChange: (post: SocialPost, status: PostStatus) => void
  onTakeOver: (post: SocialPost) => void
}

interface Section {
  title: string
  description: string
  posts: SocialPost[]
  tone?: 'danger'
  open?: boolean
}

/** The next step a designer takes on their own post. */
function primaryAction(post: SocialPost): { label: string; status: PostStatus } | null {
  if (post.status === 'Planned') return { label: 'Start design', status: 'In Design' }
  if (post.status === 'In Design') {
    return { label: post.changesRequestedAt ? 'Resubmit for review' : 'Submit for review', status: 'Ready for Review' }
  }
  return null
}

/** A designer's own work, grouped by what needs doing, plus unassigned work they can take over. */
export function MyAssignments({ posts, userId, today, onOpen, onStatusChange, onTakeOver }: MyAssignmentsProps) {
  const mine = sortByDate(posts.filter((p) => p.designerId === userId && p.status !== 'Published'))
  const sections: Section[] = [
    {
      title: 'Changes requested',
      description: 'Feedback from the office — update the design and resubmit.',
      posts: mine.filter((p) => p.status === 'In Design' && p.changesRequestedAt),
      tone: 'danger',
    },
    {
      title: 'To do',
      description: 'Planned or in design.',
      posts: mine.filter((p) => (p.status === 'Planned' || p.status === 'In Design') && !p.changesRequestedAt),
    },
    {
      title: 'Waiting for review',
      description: 'Submitted. The office will approve or request changes.',
      posts: mine.filter((p) => p.status === 'Ready for Review'),
    },
    {
      title: 'Approved',
      description: 'Approved and scheduled to publish. Locked for editing.',
      posts: mine.filter((p) => p.status === 'Approved'),
    },
    {
      title: 'Open work',
      description: 'Unassigned posts anyone can take over.',
      posts: sortByDate(posts.filter((p) => p.designerId === null && DESIGNER_STATUSES.includes(p.status))),
      open: true,
    },
  ]

  return (
    <div className="my-assignments">
      {mine.length === 0 && (
        <p className="empty-state">Nothing is assigned to you right now.</p>
      )}
      {sections
        .filter((s) => s.posts.length > 0)
        .map((section) => (
          <section key={section.title}>
            <h3 className={`queue-heading${section.tone === 'danger' ? ' queue-heading-danger' : ''}`}>
              {section.title} ({section.posts.length})
            </h3>
            <p className="muted small assignment-description">{section.description}</p>
            <ol className="queue-list">
              {section.posts.map((post) => {
                const action = section.open ? null : primaryAction(post)
                const overdue = isOverdue(post, today)
                return (
                  <li key={post.id} className="queue-item">
                    <button type="button" className="queue-main" onClick={() => onOpen(post)}>
                      <span className="queue-date">
                        {formatLongDate(post.publishDate)} · {relativeDayLabel(post.publishDate, today)}
                        {overdue && <span className="pill pill-danger">Overdue</span>}
                      </span>
                      <span className="queue-title">{post.title}</span>
                      <span className="queue-meta">
                        {PROGRAM_SHORT[post.program]} · {post.format} · {post.platforms.join(', ') || 'No platforms'}
                      </span>
                      {post.changesRequestedAt && post.reviewNote && (
                        <span className="assignment-note">“{post.reviewNote}”</span>
                      )}
                    </button>
                    <div className="queue-actions">
                      <StatusBadge status={post.status} />
                      {section.open ? (
                        <button type="button" className="button button-secondary button-small" onClick={() => onTakeOver(post)}>
                          Take over
                        </button>
                      ) : (
                        action && (
                          <button
                            type="button"
                            className="button button-primary button-small"
                            onClick={() => onStatusChange(post, action.status)}
                          >
                            {action.label}
                          </button>
                        )
                      )}
                    </div>
                  </li>
                )
              })}
            </ol>
          </section>
        ))}
    </div>
  )
}
