import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth, useTeamMember } from './auth/authContext'
import { CalendarView } from './components/CalendarView'
import { ConfirmDialog } from './components/ConfirmDialog'
import { DayAgenda } from './components/DayAgenda'
import { EmailRemindersPage } from './components/email/EmailRemindersPage'
import { FilterBar } from './components/FilterBar'
import { ImportLocalPostsDialog } from './components/ImportLocalPostsDialog'
import { MyAssignments } from './components/MyAssignments'
import { NextUpCard } from './components/NextUpCard'
import { PostEditor, type EditorConflict, type ReviewHandlers, type SaveRequest } from './components/PostEditor'
import { PostList } from './components/PostList'
import { StatsGrid } from './components/StatsGrid'
import { StatusBadge } from './components/StatusBadge'
import { UserMenu } from './components/UserMenu'
import { WorkQueue } from './components/WorkQueue'
import { usePosts } from './hooks/usePosts'
import { useTeam } from './hooks/useTeam'
import { ConflictError, errorMessage, NotFoundError } from './storage'
import { EMPTY_FILTERS, STATUSES, type PostDraft, type PostFilters, type PostStatus, type SocialPost, type ViewName } from './types'
import { parseDateKey, startOfMonth, todayKey } from './utils/date'
import { statusOptions } from './utils/permissions'
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
  /** `snapshot` is the post as it was when the editor opened, used to detect concurrent edits. */
  | { mode: 'edit'; postId: string; key: number; snapshot: SocialPost }

interface Toast {
  message: string
  tone: 'info' | 'error'
  id: number
}

/** Refetch shared posts when the tab regains focus after this long. */
const REFRESH_ON_FOCUS_AFTER_MS = 30_000

/** Top-level pages. Email Reminders is shown to admins only. */
type PageName = 'content' | 'email'

const VIEWS: { id: ViewName; label: string; designersOnly?: boolean }[] = [
  { id: 'mine', label: 'My Assignments', designersOnly: true },
  { id: 'calendar', label: 'Calendar' },
  { id: 'list', label: 'All Posts' },
  { id: 'queue', label: 'Next Up / Work Queue' },
]

function App() {
  const {
    posts,
    loading,
    refreshing,
    saving,
    lastSyncedAt,
    error,
    reload,
    createPost,
    updatePost,
    requestChanges,
    deletePost,
    addArtwork,
    removeArtwork,
    reorderArtwork,
  } = usePosts()
  const { signOut } = useAuth()
  const member = useTeamMember()
  const { team, reload: reloadTeam } = useTeam()
  const isAdmin = member.role === 'admin'
  const [today, setToday] = useState(todayKey)
  const [view, setView] = useState<ViewName>(isAdmin ? 'calendar' : 'mine')
  const [filters, setFilters] = useState<PostFilters>(EMPTY_FILTERS)
  const [month, setMonth] = useState(() => startOfMonth(new Date()))
  const [selectedDate, setSelectedDate] = useState(todayKey)
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [pendingDelete, setPendingDelete] = useState<SocialPost | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [page, setPage] = useState<PageName>('content')
  const activePage: PageName = isAdmin ? page : 'content'

  // Keep "today" accurate if the app is left open past midnight.
  useEffect(() => {
    const timer = window.setInterval(() => setToday(todayKey()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), toast.tone === 'error' ? 6000 : 3000)
    return () => window.clearTimeout(timer)
  }, [toast])

  // Pick up teammates' changes when returning to the tab. Open editors keep
  // their own draft, so a refresh never discards unsaved edits.
  useEffect(() => {
    const refreshIfStale = () => {
      if (document.visibilityState !== 'visible' || lastSyncedAt === null) return
      if (Date.now() - lastSyncedAt > REFRESH_ON_FOCUS_AFTER_MS) void reload()
    }
    window.addEventListener('focus', refreshIfStale)
    document.addEventListener('visibilitychange', refreshIfStale)
    return () => {
      window.removeEventListener('focus', refreshIfStale)
      document.removeEventListener('visibilitychange', refreshIfStale)
    }
  }, [lastSyncedAt, reload])

  const stats = useMemo(() => computeStats(posts, today), [posts, today])
  // Designers see their own next post; admins the whole team's.
  const nextUp = useMemo(
    () => getNextUp(isAdmin ? posts : posts.filter((p) => p.designerId === member.userId)),
    [posts, isAdmin, member.userId],
  )
  // Unfinished posts still carrying a typed name with no designer account.
  const unlinkedCount = useMemo(
    () => posts.filter((p) => !p.designerId && p.designer && p.status !== 'Published').length,
    [posts],
  )
  const views = VIEWS.filter((v) => !v.designersOnly || !isAdmin)
  const statusOptionsFor = useCallback((post: SocialPost) => statusOptions(member, post), [member])
  const filteredPosts = useMemo(() => filterPosts(posts, filters), [posts, filters])
  const selectedDayPosts = useMemo(
    () => sortByDate(filteredPosts.filter((p) => p.publishDate === selectedDate)),
    [filteredPosts, selectedDate],
  )

  // The latest saved copy of the open post; undefined if it was deleted meanwhile.
  const editingPost = editor?.mode === 'edit' ? posts.find((p) => p.id === editor.postId) : undefined
  const editorConflict: EditorConflict =
    editor?.mode !== 'edit'
      ? null
      : !editingPost
        ? 'deleted'
        : editingPost.version > editor.snapshot.version
          ? 'changed'
          : null

  const showToast = useCallback((message: string, tone: Toast['tone'] = 'info') => {
    setToast({ message, tone, id: Date.now() })
  }, [])

  const reportError = useCallback(
    (err: unknown) => showToast(errorMessage(err), 'error'),
    [showToast],
  )

  const openNewPost = (date: string = selectedDate) =>
    setEditor({ mode: 'create', draft: createEmptyDraft(date), key: Date.now() })

  const openPost = (post: SocialPost) =>
    setEditor({ mode: 'edit', postId: post.id, key: Date.now(), snapshot: post })

  /** Uploads images chosen for a new post; returns how many failed. */
  const uploadStagedArtwork = async (postId: string, files: File[]) => {
    let failed = 0
    for (const file of files) {
      try {
        await addArtwork(postId, file)
      } catch (err) {
        failed += 1
        console.error(`Artwork upload failed for ${file.name}`, err)
      }
    }
    return failed
  }

  const handleSave = async ({ draft, overwrite, files }: SaveRequest) => {
    try {
      if (editor?.mode === 'edit') {
        // Normally only the version that was opened may be replaced; an
        // explicit overwrite targets whatever version is now saved.
        const expectedVersion = overwrite && editingPost ? editingPost.version : editor.snapshot.version
        await updatePost(editor.postId, draft, expectedVersion)
        showToast('Post saved')
      } else {
        const created = await createPost(draft)
        const failed = await uploadStagedArtwork(created.id, files)
        if (failed > 0) {
          showToast(
            `Post created, but ${failed} of ${files.length} images did not upload. Open the post to try again.`,
            'error',
          )
        } else {
          showToast(files.length > 0 ? `Post created with ${files.length} image${files.length === 1 ? '' : 's'}` : 'Post created')
        }
      }
      setEditor(null)
      // Bring the calendar to the post's date so the user can see it.
      setPage('content')
      setSelectedDate(draft.publishDate)
      setMonth(startOfMonth(parseDateKey(draft.publishDate)))
    } catch (err) {
      if (err instanceof ConflictError) {
        showToast('Not saved — another team member changed this post. See the notice in the editor.', 'error')
      } else if (err instanceof NotFoundError) {
        showToast('Not saved — this post was deleted by another team member.', 'error')
      } else {
        reportError(err)
      }
    }
  }

  const reloadLatestInEditor = () => {
    if (editor?.mode === 'edit' && editingPost) {
      setEditor({ mode: 'edit', postId: editingPost.id, key: Date.now(), snapshot: editingPost })
    }
  }

  /** Shows a toast for a failed quick action on `post`. */
  const reportPostError = (post: SocialPost, err: unknown) => {
    if (err instanceof ConflictError) {
      showToast(`“${post.title}” was just changed by another team member. The latest version is shown — please try again.`, 'error')
    } else if (err instanceof NotFoundError) {
      showToast(`“${post.title}” was deleted by another team member.`, 'error')
    } else {
      reportError(err)
    }
  }

  const handleStatusChange = async (post: SocialPost, status: PostStatus): Promise<boolean> => {
    try {
      await updatePost(post.id, { status }, post.version)
      showToast(
        status === 'Published'
          ? `“${post.title}” published — Next Up updated`
          : status === 'Ready for Review' && !isAdmin
            ? `“${post.title}” submitted for review`
            : `Moved to ${status}`,
      )
      return true
    } catch (err) {
      reportPostError(post, err)
      return false
    }
  }

  /** A designer assigns an unassigned post to themselves. */
  const handleTakeOver = async (post: SocialPost) => {
    try {
      const updated = await updatePost(post.id, { designerId: member.userId }, post.version)
      showToast(`You are now the designer for “${post.title}”`)
      if (editor?.mode === 'edit' && editor.postId === post.id) {
        setEditor({ mode: 'edit', postId: updated.id, key: Date.now(), snapshot: updated })
      }
    } catch (err) {
      reportPostError(post, err)
    }
  }

  const reviewHandlers = (post: SocialPost): ReviewHandlers => ({
    onApprove: async () => {
      if (await handleStatusChange(post, 'Approved')) setEditor(null)
    },
    onRequestChanges: async (note) => {
      try {
        await requestChanges(post.id, note, post.version)
        showToast(`“${post.title}” sent back to ${post.designer || 'the designer'} with your feedback`)
        setEditor(null)
      } catch (err) {
        reportPostError(post, err)
      }
    },
  })

  const handleDuplicate = async (post: SocialPost) => {
    try {
      const copy = await createPost(duplicateDraft(post))
      setEditor({ mode: 'edit', postId: copy.id, key: Date.now(), snapshot: copy })
      showToast('Post duplicated — you are now editing the copy')
    } catch (err) {
      reportError(err)
    }
  }

  const confirmDelete = async () => {
    if (!pendingDelete) return
    try {
      await deletePost(pendingDelete.id)
      if (editor?.mode === 'edit' && editor.postId === pendingDelete.id) setEditor(null)
      showToast('Post deleted')
    } catch (err) {
      reportError(err)
    } finally {
      setPendingDelete(null)
    }
  }

  const handleRefresh = async () => {
    await Promise.all([reload(), reloadTeam()])
    showToast('Posts refreshed')
  }

  const handleImported = (count: number) => {
    if (count > 0) showToast(`${count} post${count === 1 ? '' : 's'} imported`)
    void reload()
  }

  const handleSignOut = () => {
    void signOut().catch(reportError)
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
          <div className="header-actions">
            <span className={`sync-status${saving || refreshing ? ' is-busy' : ''}`} role="status" aria-live="polite">
              {saving ? 'Saving…' : refreshing ? 'Refreshing…' : error ? 'Not synced' : 'All changes saved'}
            </span>
            {isAdmin && (
              <button type="button" className="button button-accent" onClick={() => openNewPost()}>
                + Add Post
              </button>
            )}
            <UserMenu
              member={member}
              onRefresh={() => void handleRefresh()}
              onImport={() => setImportOpen(true)}
              onEmailReminders={() => setPage('email')}
              onSignOut={handleSignOut}
            />
          </div>
        </div>
        {isAdmin && (
          <nav className="app-nav" aria-label="Pages">
            <div className="app-nav-inner">
              <button
                type="button"
                className={`app-nav-tab${activePage === 'content' ? ' is-active' : ''}`}
                aria-current={activePage === 'content' ? 'page' : undefined}
                onClick={() => setPage('content')}
              >
                Content Calendar
              </button>
              <button
                type="button"
                className={`app-nav-tab${activePage === 'email' ? ' is-active' : ''}`}
                aria-current={activePage === 'email' ? 'page' : undefined}
                onClick={() => setPage('email')}
              >
                Email Reminders
              </button>
            </div>
          </nav>
        )}
      </header>

      {activePage === 'email' ? (
        <main className="app-main">
          <EmailRemindersPage onNotify={showToast} />
        </main>
      ) : (
        <main className="app-main">
          {error && (
            <div className="alert alert-row" role="alert">
              <span>Could not load posts: {error}</span>
              <button type="button" className="button button-ghost button-small" onClick={() => void reload()} disabled={refreshing}>
                {refreshing ? 'Retrying…' : 'Try again'}
              </button>
            </div>
          )}
          {isAdmin && unlinkedCount > 0 && (
            <div className="alert alert-row alert-info" role="status">
              <span>
                {unlinkedCount} unfinished post{unlinkedCount === 1 ? ' has' : 's have'} a designer name that is not linked
                to a designer account (shown as “not linked”). Open {unlinkedCount === 1 ? 'it' : 'them'} and choose the
                designer.
              </span>
              <button
                type="button"
                className="button button-ghost button-small"
                onClick={() => {
                  setView('list')
                  setFilters(EMPTY_FILTERS)
                }}
              >
                Show all posts
              </button>
            </div>
          )}

          <StatsGrid stats={stats} />

          <div className="layout">
            <aside className="sidebar">
              <NextUpCard
                post={nextUp}
                today={today}
                onOpen={openPost}
                onStatusChange={handleStatusChange}
                onViewQueue={() => setView(isAdmin ? 'queue' : 'mine')}
                statusOptions={statusOptionsFor}
                emptyMessage={isAdmin ? undefined : 'Nothing is assigned to you right now.'}
              />
              {view === 'calendar' && (
                <DayAgenda
                  date={selectedDate}
                  today={today}
                  posts={selectedDayPosts}
                  onOpenPost={openPost}
                  onAddPost={isAdmin ? openNewPost : undefined}
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
                {views.map((v) => (
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

              {view !== 'mine' && (
                <FilterBar filters={filters} onChange={setFilters} shown={filteredPosts.length} total={posts.length} />
              )}

              {loading ? (
                <p className="empty-state" role="status">
                  <span className="spinner" aria-hidden="true" /> Loading shared posts…
                </p>
              ) : view === 'mine' ? (
                <MyAssignments
                  posts={posts}
                  userId={member.userId}
                  today={today}
                  onOpen={openPost}
                  onStatusChange={(post, status) => void handleStatusChange(post, status)}
                  onTakeOver={(post) => void handleTakeOver(post)}
                />
              ) : view === 'calendar' ? (
                <CalendarView
                  posts={filteredPosts}
                  today={today}
                  month={month}
                  selectedDate={selectedDate}
                  onMonthChange={setMonth}
                  onSelectDate={setSelectedDate}
                  onOpenPost={openPost}
                  onAddPost={isAdmin ? openNewPost : undefined}
                />
              ) : view === 'list' ? (
                <PostList
                  posts={filteredPosts}
                  today={today}
                  onOpen={openPost}
                  onStatusChange={handleStatusChange}
                  statusOptions={statusOptionsFor}
                  onDuplicate={isAdmin ? handleDuplicate : undefined}
                  onDelete={isAdmin ? setPendingDelete : undefined}
                />
              ) : (
                <WorkQueue
                  posts={filteredPosts}
                  today={today}
                  onOpen={openPost}
                  onStatusChange={handleStatusChange}
                  statusOptions={statusOptionsFor}
                />
              )}
            </section>
          </div>
        </main>
      )}

      {editor && (
        <PostEditor
          key={editor.key}
          // Stays open on the snapshot if a teammate deletes the post meanwhile.
          post={editor.mode === 'edit' ? (editingPost ?? editor.snapshot) : undefined}
          initialDraft={editor.mode === 'create' ? editor.draft : toDraft(editor.snapshot)}
          onSave={handleSave}
          onClose={() => setEditor(null)}
          onDuplicate={isAdmin ? handleDuplicate : undefined}
          onDelete={isAdmin && editorConflict !== 'deleted' ? setPendingDelete : undefined}
          conflict={editorConflict}
          onLoadLatest={reloadLatestInEditor}
          member={member}
          team={team}
          onTakeOver={(post) => void handleTakeOver(post)}
          review={isAdmin && editingPost ? reviewHandlers(editingPost) : undefined}
          artwork={
            editor.mode === 'edit'
              ? {
                  onUpload: (file) => addArtwork(editor.postId, file),
                  onRemove: removeArtwork,
                  onReorder: (ordered) => reorderArtwork(editor.postId, ordered),
                }
              : undefined
          }
        />
      )}

      {importOpen && member.role === 'admin' && (
        <ImportLocalPostsDialog onClose={() => setImportOpen(false)} onImported={handleImported} />
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
        <div key={toast.id} className={`toast${toast.tone === 'error' ? ' toast-error' : ''}`} role={toast.tone === 'error' ? 'alert' : 'status'}>
          {toast.message}
        </div>
      )}
    </div>
  )
}

export default App
