import { useCallback, useEffect, useMemo, useState } from 'react'
import './App.css'
import { CalendarView } from './components/CalendarView'
import { ConfirmDialog } from './components/ConfirmDialog'
import { DayAgenda } from './components/DayAgenda'
import { FilterBar } from './components/FilterBar'
import { NextUpCard } from './components/NextUpCard'
import { PostEditor } from './components/PostEditor'
import { PostList } from './components/PostList'
import { StatsGrid } from './components/StatsGrid'
import { StatusBadge } from './components/StatusBadge'
import { WorkQueue } from './components/WorkQueue'
import { usePosts } from './hooks/usePosts'
import { EMPTY_FILTERS, STATUSES, type PostDraft, type PostFilters, type PostStatus, type SocialPost, type ViewName } from './types'
import { parseDateKey, startOfMonth, todayKey } from './utils/date'
import {
  computeStats,
  createEmptyDraft,
  duplicateDraft,
  filterPosts,
  getNextUp,
  sortByDate,
  toDraft,
} from './utils/posts'

type EditorState =
  | { mode: 'create'; draft: PostDraft; key: number }
  | { mode: 'edit'; postId: string; key: number }

const VIEWS: { id: ViewName; label: string }[] = [
  { id: 'calendar', label: 'Calendar' },
  { id: 'list', label: 'All Posts' },
  { id: 'queue', label: 'Next Up / Work Queue' },
]

function App() {
  const { posts, loading, error, createPost, updatePost, deletePost } = usePosts()
  const [today, setToday] = useState(todayKey)
  const [view, setView] = useState<ViewName>('calendar')
  const [filters, setFilters] = useState<PostFilters>(EMPTY_FILTERS)
  const [month, setMonth] = useState(() => startOfMonth(new Date()))
  const [selectedDate, setSelectedDate] = useState(todayKey)
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [pendingDelete, setPendingDelete] = useState<SocialPost | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  // Keep "today" accurate if the app is left open past midnight.
  useEffect(() => {
    const timer = window.setInterval(() => setToday(todayKey()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 3000)
    return () => window.clearTimeout(timer)
  }, [toast])

  const stats = useMemo(() => computeStats(posts, today), [posts, today])
  const nextUp = useMemo(() => getNextUp(posts), [posts])
  const filteredPosts = useMemo(() => filterPosts(posts, filters), [posts, filters])
  const selectedDayPosts = useMemo(
    () => sortByDate(filteredPosts.filter((p) => p.publishDate === selectedDate)),
    [filteredPosts, selectedDate],
  )

  const editingPost = editor?.mode === 'edit' ? posts.find((p) => p.id === editor.postId) : undefined

  const reportError = useCallback((err: unknown) => {
    setToast(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
  }, [])

  const openNewPost = (date: string = selectedDate) =>
    setEditor({ mode: 'create', draft: createEmptyDraft(date), key: Date.now() })

  const openPost = (post: SocialPost) => setEditor({ mode: 'edit', postId: post.id, key: Date.now() })

  const handleSave = async (draft: PostDraft) => {
    try {
      if (editor?.mode === 'edit') {
        await updatePost(editor.postId, draft)
        setToast('Post saved')
      } else {
        await createPost(draft)
        setToast('Post created')
      }
      setEditor(null)
      // Bring the calendar to the post's date so the user can see it.
      setSelectedDate(draft.publishDate)
      setMonth(startOfMonth(parseDateKey(draft.publishDate)))
    } catch (err) {
      reportError(err)
    }
  }

  const handleStatusChange = async (post: SocialPost, status: PostStatus) => {
    try {
      await updatePost(post.id, { status })
      setToast(status === 'Published' ? `“${post.title}” published — Next Up updated` : `Moved to ${status}`)
    } catch (err) {
      reportError(err)
    }
  }

  const handleDuplicate = async (post: SocialPost) => {
    try {
      const copy = await createPost(duplicateDraft(post))
      setEditor({ mode: 'edit', postId: copy.id, key: Date.now() })
      setToast('Post duplicated — you are now editing the copy')
    } catch (err) {
      reportError(err)
    }
  }

  const confirmDelete = async () => {
    if (!pendingDelete) return
    try {
      await deletePost(pendingDelete.id)
      if (editor?.mode === 'edit' && editor.postId === pendingDelete.id) setEditor(null)
      setToast('Post deleted')
    } catch (err) {
      reportError(err)
    } finally {
      setPendingDelete(null)
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header-inner">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">
              TAE
            </span>
            <div>
              <h1>TAE Social Media Manager</h1>
              <p>Toronto Academy of Education · Content Calendar</p>
            </div>
          </div>
          <button type="button" className="button button-accent" onClick={() => openNewPost()}>
            + Add Post
          </button>
        </div>
      </header>

      <main className="app-main">
        {error && <div className="alert">Could not load posts: {error}</div>}

        <StatsGrid stats={stats} />

        <div className="layout">
          <aside className="sidebar">
            <NextUpCard
              post={nextUp}
              today={today}
              onOpen={openPost}
              onStatusChange={handleStatusChange}
              onViewQueue={() => setView('queue')}
            />
            {view === 'calendar' && (
              <DayAgenda
                date={selectedDate}
                today={today}
                posts={selectedDayPosts}
                onOpenPost={openPost}
                onAddPost={openNewPost}
              />
            )}
            <section className="panel legend">
              <h2 className="panel-title">Workflow</h2>
              <ol className="legend-list">
                {STATUSES.map((status) => (
                  <li key={status}>
                    <StatusBadge status={status} />
                    <span className="muted small">{stats.byStatus[status]}</span>
                  </li>
                ))}
              </ol>
            </section>
          </aside>

          <section className="content panel">
            <nav className="view-tabs" aria-label="Views">
              {VIEWS.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  className={`view-tab${view === v.id ? ' is-active' : ''}`}
                  aria-current={view === v.id ? 'page' : undefined}
                  onClick={() => setView(v.id)}
                >
                  {v.label}
                </button>
              ))}
            </nav>

            <FilterBar filters={filters} onChange={setFilters} shown={filteredPosts.length} total={posts.length} />

            {loading ? (
              <p className="empty-state">Loading posts…</p>
            ) : view === 'calendar' ? (
              <CalendarView
                posts={filteredPosts}
                today={today}
                month={month}
                selectedDate={selectedDate}
                onMonthChange={setMonth}
                onSelectDate={setSelectedDate}
                onOpenPost={openPost}
                onAddPost={openNewPost}
              />
            ) : view === 'list' ? (
              <PostList
                posts={filteredPosts}
                today={today}
                onOpen={openPost}
                onStatusChange={handleStatusChange}
                onDuplicate={handleDuplicate}
                onDelete={setPendingDelete}
              />
            ) : (
              <WorkQueue posts={filteredPosts} today={today} onOpen={openPost} onStatusChange={handleStatusChange} />
            )}
          </section>
        </div>
      </main>

      {editor && (editor.mode === 'create' || editingPost) && (
        <PostEditor
          key={editor.key}
          post={editingPost}
          initialDraft={editor.mode === 'create' ? editor.draft : toDraft(editingPost!)}
          onSave={handleSave}
          onClose={() => setEditor(null)}
          onDuplicate={handleDuplicate}
          onDelete={setPendingDelete}
        />
      )}

      {pendingDelete && (
        <ConfirmDialog
          title="Delete post?"
          message={`“${pendingDelete.title}” will be permanently removed from the calendar. This cannot be undone.`}
          confirmLabel="Delete post"
          onCancel={() => setPendingDelete(null)}
          onConfirm={confirmDelete}
        />
      )}

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  )
}

export default App
