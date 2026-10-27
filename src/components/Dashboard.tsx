import { ArrowRight, CalendarClock, CircleAlert, ClipboardCheck, MessageSquareText, Users } from 'lucide-react'
import type { ReactNode } from 'react'
import { PROGRAM_SHORT, STATUSES, type PostStatus, type SocialPost } from '../types'
import { daysBetween, parseDateKey, relativeDayLabel } from '../utils/date'
import { designerLabel, isOverdue, sortByDate, statusSlug, type PostStats } from '../utils/posts'
import { NextUpCard } from './NextUpCard'
import { StatsGrid } from './StatsGrid'
import { StatusBadge } from './StatusBadge'
import { EmptyState } from './ui/EmptyState'
import { PlatformMarks } from './ui/PlatformMarks'

const UPCOMING_DAYS = 14
const LIST_LIMIT = 6

interface DashboardProps {
  posts: SocialPost[]
  stats: PostStats
  today: string
  isAdmin: boolean
  userId: string
  nextUp: SocialPost | null
  onOpen: (post: SocialPost) => void
  onStatusChange: (post: SocialPost, status: PostStatus) => void
  statusOptions: (post: SocialPost) => readonly PostStatus[]
  onViewQueue: () => void
  /** Opens All Posts filtered to one status. */
  onShowStatus: (status: PostStatus) => void
  onShowCalendar: () => void
}

function DateTile({ dateKey }: { dateKey: string }) {
  const date = parseDateKey(dateKey)
  return (
    <span className="date-tile" aria-hidden="true">
      <span className="date-tile-month">{date.toLocaleDateString('en-CA', { month: 'short' })}</span>
      <span className="date-tile-day">{date.getDate()}</span>
    </span>
  )
}

/** One compact, clickable post row used by the dashboard lists. */
function MiniPost({ post, today, onOpen, detail }: { post: SocialPost; today: string; onOpen: (post: SocialPost) => void; detail?: ReactNode }) {
  const overdue = isOverdue(post, today)
  return (
    <li>
      <button type="button" className="mini-post" onClick={() => onOpen(post)}>
        <DateTile dateKey={post.publishDate} />
        <span className="mini-post-main">
          <span className="mini-post-title">{post.title}</span>
          <span className="mini-post-meta">
            {relativeDayLabel(post.publishDate, today)} · {PROGRAM_SHORT[post.program]} · {post.format}
          </span>
          {detail}
        </span>
        <span className="mini-post-side">
          {overdue && <span className="pill pill-danger">Overdue</span>}
          <StatusBadge status={post.status} />
        </span>
      </button>
    </li>
  )
}

function DashCard({
  icon,
  title,
  count,
  tone,
  children,
  action,
}: {
  icon: ReactNode
  title: string
  count?: number
  tone?: 'danger' | 'review'
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <section className={`panel dash-card${tone ? ` is-${tone}` : ''}`}>
      <div className="panel-heading">
        <h2 className="panel-title">
          {icon}
          {title}
          {count !== undefined && <span className="dash-count">{count}</span>}
        </h2>
        {action}
      </div>
      {children}
    </section>
  )
}

/** Overview of the workload, built from the same post list and calculations as the other views. */
export function Dashboard({
  posts,
  stats,
  today,
  isAdmin,
  userId,
  nextUp,
  onOpen,
  onStatusChange,
  statusOptions,
  onViewQueue,
  onShowStatus,
  onShowCalendar,
}: DashboardProps) {
  const sorted = sortByDate(posts)
  const scope = isAdmin ? sorted : sorted.filter((p) => p.designerId === userId)
  const awaitingReview = sorted.filter((p) => p.status === 'Ready for Review')
  const changesRequested = scope.filter((p) => p.status === 'In Design' && p.changesRequestedAt)
  const overdue = scope.filter((p) => isOverdue(p, today))
  const upcoming = scope.filter((p) => {
    if (p.status === 'Published') return false
    const days = daysBetween(today, p.publishDate)
    return days >= 0 && days <= UPCOMING_DAYS
  })

  // Unfinished posts per primary designer (admins).
  const workload = new Map<string, { label: string; count: number; review: number }>()
  if (isAdmin) {
    for (const post of sorted) {
      if (post.status === 'Published') continue
      const key = post.designerId ?? (post.designer ? `name:${post.designer}` : 'unassigned')
      const entry = workload.get(key) ?? { label: designerLabel(post), count: 0, review: 0 }
      entry.count += 1
      if (post.status === 'Ready for Review') entry.review += 1
      workload.set(key, entry)
    }
  }
  const workloadRows = [...workload.values()].sort((a, b) => b.count - a.count)
  const maxStatus = Math.max(1, ...STATUSES.map((s) => stats.byStatus[s]))

  return (
    <div className="dashboard">
      <StatsGrid stats={stats} onSelectStatus={onShowStatus} />

      <div className="dash-grid">
        <div className="dash-main">
          {isAdmin && (
            <DashCard
              icon={<ClipboardCheck aria-hidden="true" />}
              title="Awaiting your review"
              count={awaitingReview.length}
              tone={awaitingReview.length > 0 ? 'review' : undefined}
              action={
                awaitingReview.length > LIST_LIMIT ? (
                  <button type="button" className="link-button" onClick={() => onShowStatus('Ready for Review')}>
                    View all <ArrowRight aria-hidden="true" />
                  </button>
                ) : undefined
              }
            >
              {awaitingReview.length === 0 ? (
                <EmptyState icon={ClipboardCheck}>Nothing is waiting for review.</EmptyState>
              ) : (
                <ul className="mini-list">
                  {awaitingReview.slice(0, LIST_LIMIT).map((post) => (
                    <MiniPost
                      key={post.id}
                      post={post}
                      today={today}
                      onOpen={onOpen}
                      detail={<span className="mini-post-detail">Primary designer: {designerLabel(post)}</span>}
                    />
                  ))}
                </ul>
              )}
            </DashCard>
          )}

          {(changesRequested.length > 0 || !isAdmin) && (
            <DashCard
              icon={<MessageSquareText aria-hidden="true" />}
              title="Changes requested"
              count={changesRequested.length}
              tone={changesRequested.length > 0 ? 'danger' : undefined}
            >
              {changesRequested.length === 0 ? (
                <EmptyState icon={MessageSquareText}>No open change requests.</EmptyState>
              ) : (
                <ul className="mini-list">
                  {changesRequested.slice(0, LIST_LIMIT).map((post) => (
                    <MiniPost
                      key={post.id}
                      post={post}
                      today={today}
                      onOpen={onOpen}
                      detail={post.reviewNote ? <span className="mini-post-note">“{post.reviewNote}”</span> : undefined}
                    />
                  ))}
                </ul>
              )}
            </DashCard>
          )}

          {overdue.length > 0 && (
            <DashCard
              icon={<CircleAlert aria-hidden="true" />}
              title="Overdue"
              count={overdue.length}
              tone="danger"
              action={
                <button type="button" className="link-button" onClick={onViewQueue}>
                  Open work queue <ArrowRight aria-hidden="true" />
                </button>
              }
            >
              <ul className="mini-list">
                {overdue.slice(0, LIST_LIMIT).map((post) => (
                  <MiniPost key={post.id} post={post} today={today} onOpen={onOpen} />
                ))}
              </ul>
            </DashCard>
          )}

          <DashCard
            icon={<CalendarClock aria-hidden="true" />}
            title={`Publishing in the next ${UPCOMING_DAYS} days`}
            count={upcoming.length}
            action={
              <button type="button" className="link-button" onClick={onShowCalendar}>
                Calendar <ArrowRight aria-hidden="true" />
              </button>
            }
          >
            {upcoming.length === 0 ? (
              <EmptyState icon={CalendarClock}>
                {isAdmin ? 'No unfinished posts are scheduled in the next two weeks.' : 'None of your posts are due in the next two weeks.'}
              </EmptyState>
            ) : (
              <ul className="mini-list">
                {upcoming.slice(0, LIST_LIMIT + 2).map((post) => (
                  <MiniPost
                    key={post.id}
                    post={post}
                    today={today}
                    onOpen={onOpen}
                    detail={
                      <span className="mini-post-detail">
                        <PlatformMarks platforms={post.platforms} size="small" />
                        {isAdmin && <span>{designerLabel(post, 'Designer unassigned')}</span>}
                      </span>
                    }
                  />
                ))}
              </ul>
            )}
          </DashCard>
        </div>

        <div className="dash-side">
          <NextUpCard
            post={nextUp}
            today={today}
            onOpen={onOpen}
            onStatusChange={onStatusChange}
            onViewQueue={onViewQueue}
            statusOptions={statusOptions}
            emptyMessage={isAdmin ? undefined : 'Nothing is assigned to you right now.'}
          />

          <section className="panel">
            <div className="panel-heading">
              <h2 className="panel-title">Workflow pipeline</h2>
            </div>
            <ol className="pipeline">
              {STATUSES.map((status) => (
                <li key={status}>
                  <button type="button" className={`pipeline-row status-${statusSlug(status)}`} onClick={() => onShowStatus(status)}>
                    <span className="pipeline-label">
                      <span className="status-dot" aria-hidden="true" />
                      {status}
                    </span>
                    <span className="pipeline-bar" aria-hidden="true">
                      <span style={{ width: `${(stats.byStatus[status] / maxStatus) * 100}%` }} />
                    </span>
                    <span className="pipeline-count">{stats.byStatus[status]}</span>
                  </button>
                </li>
              ))}
            </ol>
          </section>

          {isAdmin && (
            <section className="panel">
              <div className="panel-heading">
                <h2 className="panel-title">
                  <Users aria-hidden="true" />
                  Assigned work
                </h2>
              </div>
              {workloadRows.length === 0 ? (
                <p className="muted small">Every post is published.</p>
              ) : (
                <ul className="workload">
                  {workloadRows.map((row) => (
                    <li key={row.label}>
                      <span className="workload-name">{row.label}</span>
                      <span className="workload-meta">
                        {row.review > 0 && <span className="pill pill-warning">{row.review} in review</span>}
                        <span className="workload-count">{row.count}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="muted small workload-footnote">Unfinished posts by primary designer.</p>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
