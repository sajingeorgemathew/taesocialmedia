import { CalendarDays, Plus } from 'lucide-react'
import { PROGRAM_SHORT, type SocialPost } from '../types'
import { formatLongDate, relativeDayLabel } from '../utils/date'
import { statusSlug } from '../utils/posts'
import { StatusBadge } from './StatusBadge'
import { PlatformMarks } from './ui/PlatformMarks'

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
    <section className="panel day-agenda" aria-label="Selected day">
      <div className="panel-heading">
        <div>
          <h2 className="panel-title">{formatLongDate(date)}</h2>
          <p className="panel-subtitle">
            {relativeDayLabel(date, today)} · {posts.length} post{posts.length === 1 ? '' : 's'}
          </p>
        </div>
        {onAddPost && (
          <button type="button" className="button button-secondary button-small" onClick={() => onAddPost(date)}>
            <Plus aria-hidden="true" />
            Add post
          </button>
        )}
      </div>
      {posts.length === 0 ? (
        <p className="agenda-empty">
          <CalendarDays aria-hidden="true" />
          No posts scheduled on this date.
        </p>
      ) : (
        <ul className="agenda-list">
          {posts.map((post) => (
            <li key={post.id}>
              <button type="button" className={`agenda-item status-${statusSlug(post.status)}`} onClick={() => onOpenPost(post)}>
                <span className="agenda-title">{post.title}</span>
                <span className="agenda-meta">
                  {PROGRAM_SHORT[post.program]} · {post.format}
                  <PlatformMarks platforms={post.platforms} size="small" />
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
