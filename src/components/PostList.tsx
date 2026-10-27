import { Copy, Eye, FileText, Pencil, Trash2 } from 'lucide-react'
import { PROGRAM_SHORT, type PostStatus, type SocialPost } from '../types'
import { formatLongDate } from '../utils/date'
import { designerLabel, isOverdue, sortByDate } from '../utils/posts'
import { StatusSelect } from './StatusBadge'
import { EmptyState } from './ui/EmptyState'
import { PlatformMarks } from './ui/PlatformMarks'

interface PostListProps {
  posts: SocialPost[]
  today: string
  onOpen: (post: SocialPost) => void
  onStatusChange: (post: SocialPost, status: PostStatus) => void
  /** Statuses the signed-in person may choose for a post. */
  statusOptions: (post: SocialPost) => readonly PostStatus[]
  /** Omitted for people who cannot create or delete posts. */
  onDuplicate?: (post: SocialPost) => void
  onDelete?: (post: SocialPost) => void
}

/** Every post, including published history, in chronological order. */
export function PostList({ posts, today, onOpen, onStatusChange, statusOptions, onDuplicate, onDelete }: PostListProps) {
  if (posts.length === 0) {
    return <EmptyState icon={FileText} title="No posts found">No posts match the current filters.</EmptyState>
  }

  const openLabel = onDelete ? 'Edit' : 'Open'

  return (
    <div className="post-table">
      <div className="post-table-head" aria-hidden="true">
        <span>Date</span>
        <span>Post</span>
        <span>Platforms</span>
        <span>Primary designer</span>
        <span>Status</span>
        <span />
      </div>
      <ul className="post-list" aria-label="All posts">
        {sortByDate(posts).map((post) => {
          const overdue = isOverdue(post, today)
          return (
            <li key={post.id} className={`post-row${post.status === 'Published' ? ' is-published' : ''}`}>
              <div className="post-row-date">
                <span>{formatLongDate(post.publishDate)}</span>
                {overdue && <span className="pill pill-danger">Overdue</span>}
              </div>
              <button type="button" className="post-row-main" onClick={() => onOpen(post)}>
                <span className="post-row-title">{post.title}</span>
                <span className="post-row-meta">
                  {PROGRAM_SHORT[post.program]} · {post.format}
                </span>
              </button>
              <div className="post-row-platforms">
                <PlatformMarks platforms={post.platforms} />
              </div>
              <div className="post-row-designer">{designerLabel(post)}</div>
              <div className="post-row-status">
                <StatusSelect status={post.status} options={statusOptions(post)} onChange={(status) => onStatusChange(post, status)} />
              </div>
              <div className="post-row-actions">
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => onOpen(post)}
                  aria-label={`${openLabel} “${post.title}”`}
                  data-tooltip={openLabel}
                >
                  {onDelete ? <Pencil aria-hidden="true" /> : <Eye aria-hidden="true" />}
                </button>
                {onDuplicate && (
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => onDuplicate(post)}
                    aria-label={`Duplicate “${post.title}”`}
                    data-tooltip="Duplicate"
                  >
                    <Copy aria-hidden="true" />
                  </button>
                )}
                {onDelete && (
                  <button
                    type="button"
                    className="icon-button is-danger"
                    onClick={() => onDelete(post)}
                    aria-label={`Delete “${post.title}”`}
                    data-tooltip="Delete"
                  >
                    <Trash2 aria-hidden="true" />
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
