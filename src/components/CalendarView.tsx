import { useMemo } from 'react'
import { PROGRAM_SHORT, type SocialPost } from '../types'
import { addMonths, buildMonthGrid, formatLongDate, formatMonthLabel, parseDateKey, startOfMonth } from '../utils/date'
import { isOverdue, sortByDate, statusSlug } from '../utils/posts'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MAX_CHIPS = 3

interface CalendarViewProps {
  posts: SocialPost[]
  today: string
  month: Date
  selectedDate: string
  onMonthChange: (month: Date) => void
  onSelectDate: (date: string) => void
  onOpenPost: (post: SocialPost) => void
  /** Omitted for people who cannot create posts. */
  onAddPost?: (date: string) => void
}

export function CalendarView({
  posts,
  today,
  month,
  selectedDate,
  onMonthChange,
  onSelectDate,
  onOpenPost,
  onAddPost,
}: CalendarViewProps) {
  const weeks = useMemo(() => buildMonthGrid(month), [month])

  const postsByDate = useMemo(() => {
    const map = new Map<string, SocialPost[]>()
    for (const post of sortByDate(posts)) {
      const list = map.get(post.publishDate) ?? []
      list.push(post)
      map.set(post.publishDate, list)
    }
    return map
  }, [posts])

  const monthIndex = month.getMonth()

  return (
    <section className="calendar" aria-label="Content calendar">
      <div className="calendar-toolbar">
        <h2 className="calendar-month">{formatMonthLabel(month)}</h2>
        <div className="calendar-nav">
          <button
            type="button"
            className="button button-ghost"
            onClick={() => onMonthChange(addMonths(month, -1))}
            aria-label="Previous month"
          >
            ‹ Prev
          </button>
          <button
            type="button"
            className="button button-ghost"
            onClick={() => {
              onMonthChange(startOfMonth(parseDateKey(today)))
              onSelectDate(today)
            }}
          >
            Today
          </button>
          <button
            type="button"
            className="button button-ghost"
            onClick={() => onMonthChange(addMonths(month, 1))}
            aria-label="Next month"
          >
            Next ›
          </button>
        </div>
      </div>

      <div className="calendar-grid" role="grid">
        <div className="calendar-row calendar-weekdays" role="row">
          {WEEKDAYS.map((day) => (
            <div key={day} className="calendar-weekday" role="columnheader">
              {day}
            </div>
          ))}
        </div>
        {weeks.map((week) => (
          <div key={week[0]} className="calendar-row" role="row">
            {week.map((dateKey) => {
              const dayPosts = postsByDate.get(dateKey) ?? []
              const date = parseDateKey(dateKey)
              const classes = [
                'calendar-day',
                date.getMonth() !== monthIndex && 'is-outside',
                dateKey === today && 'is-today',
                dateKey === selectedDate && 'is-selected',
              ]
                .filter(Boolean)
                .join(' ')

              return (
                <div
                  key={dateKey}
                  className={classes}
                  role="gridcell"
                  aria-selected={dateKey === selectedDate}
                  onClick={() => onSelectDate(dateKey)}
                >
                  <div className="calendar-day-header">
                    <button
                      type="button"
                      className="day-number"
                      onClick={(e) => {
                        e.stopPropagation()
                        onSelectDate(dateKey)
                      }}
                      aria-label={`${formatLongDate(dateKey)}, ${dayPosts.length} post${dayPosts.length === 1 ? '' : 's'}`}
                    >
                      {date.getDate()}
                    </button>
                    {onAddPost && (
                      <button
                        type="button"
                        className="day-add"
                        onClick={(e) => {
                          e.stopPropagation()
                          onAddPost(dateKey)
                        }}
                        aria-label={`Add post on ${formatLongDate(dateKey)}`}
                        title="Add post on this date"
                      >
                        +
                      </button>
                    )}
                  </div>
                  <div className="calendar-day-posts">
                    {dayPosts.slice(0, MAX_CHIPS).map((post) => (
                      <button
                        key={post.id}
                        type="button"
                        className={`post-chip status-${statusSlug(post.status)}${isOverdue(post, today) ? ' is-overdue' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          onOpenPost(post)
                        }}
                        title={`${post.title} — ${post.status}`}
                      >
                        <span className="post-chip-program">{PROGRAM_SHORT[post.program]}</span>
                        <span className="post-chip-title">{post.title}</span>
                      </button>
                    ))}
                    {dayPosts.length > MAX_CHIPS && (
                      <span className="more-posts">+{dayPosts.length - MAX_CHIPS} more</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </section>
  )
}
