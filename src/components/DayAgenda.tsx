import { PROGRAM_SHORT, type SocialPost } from '../types'
import { formatLongDate, relativeDayLabel } from '../utils/date'
import { StatusBadge } from './StatusBadge'

interface DayAgendaProps {
  date: string
  today: string
  posts: SocialPost[]
  onOpenPost: (post: SocialPost) => void
  /** Omitted for people who cannot create posts. */
  onAddPost?: (date: string) => void
}

/** Posts scheduled on the date selected in the calendar. */
export function DayAgenda({ date, today, posts, onOpenPost, onAddPost }: DayAgendaProps) {
  return (
    <section className="panel day-agenda">
      <div className="panel-heading">
        <div>
          <h2 className="panel-title">{formatLongDate(date)}</h2>
          <p className="muted small">{relativeDayLabel(date, today)}</p>
        </div>
        {onAddPost && (
          <button type="button" className="button button-secondary button-small" onClick={() => onAddPost(date)}>
            + Add post
          </button>
        )}
      </div>
      {posts.length === 0 ? (
        <p className="muted">No posts scheduled on this date.</p>
      ) : (
        <ul className="agenda-list">
          {posts.map((post) => (
            <li key={post.id}>
              <button type="button" className="agenda-item" onClick={() => onOpenPost(post)}>
                <span className="agenda-title">{post.title}</span>
                <span className="agenda-meta">
                  {PROGRAM_SHORT[post.program]} · {post.format}
                </span>
                <StatusBadge status={post.status} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
