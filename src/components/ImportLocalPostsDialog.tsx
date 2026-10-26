import { useEffect, useState } from 'react'
import { errorMessage } from '../storage'
import { buildImportPlan, importLocalPosts, type ImportPlan } from '../storage/localImport'
import type { SocialPost } from '../types'
import { formatLongDate } from '../utils/date'
import { sortByDate } from '../utils/posts'
import { Modal } from './Modal'
import { StatusBadge } from './StatusBadge'

interface ImportLocalPostsDialogProps {
  onClose: () => void
  /** Called after posts were added so the app can reload the shared list. */
  onImported: (count: number) => void
}

type Phase =
  | { name: 'checking' }
  | { name: 'ready'; plan: ImportPlan }
  | { name: 'importing'; plan: ImportPlan }
  | { name: 'done'; added: number }
  | { name: 'failed'; message: string; plan: ImportPlan | null }

function PostPreviewList({ posts }: { posts: SocialPost[] }) {
  return (
    <ul className="import-list">
      {sortByDate(posts).map((post) => (
        <li key={post.id}>
          <span className="import-date">{formatLongDate(post.publishDate)}</span>
          <span className="import-title">{post.title}</span>
          <StatusBadge status={post.status} />
        </li>
      ))}
    </ul>
  )
}

/** Admin-only, explicit import of the posts Feature 1 saved in this browser. */
export function ImportLocalPostsDialog({ onClose, onImported }: ImportLocalPostsDialogProps) {
  const [phase, setPhase] = useState<Phase>({ name: 'checking' })
  const [includeMatches, setIncludeMatches] = useState(false)

  useEffect(() => {
    let active = true
    buildImportPlan()
      .then((plan) => {
        if (active) setPhase({ name: 'ready', plan })
      })
      .catch((err: unknown) => {
        if (active) setPhase({ name: 'failed', message: errorMessage(err), plan: null })
      })
    return () => {
      active = false
    }
  }, [])

  const plan = phase.name === 'ready' || phase.name === 'importing' ? phase.plan : null
  const toImport = plan ? [...plan.newPosts, ...(includeMatches ? plan.possibleDuplicates : [])] : []

  const runImport = async () => {
    if (!plan || toImport.length === 0) return
    setPhase({ name: 'importing', plan })
    try {
      const added = await importLocalPosts(toImport)
      setPhase({ name: 'done', added })
      onImported(added)
    } catch (err) {
      setPhase({ name: 'failed', message: errorMessage(err), plan })
      // Some chunks may have been added before the failure.
      onImported(0)
    }
  }

  const busy = phase.name === 'checking' || phase.name === 'importing'

  return (
    <Modal
      title="Import posts saved in this browser"
      onClose={busy ? () => undefined : onClose}
      footer={
        phase.name === 'done' || (phase.name === 'failed' && !phase.plan) ? (
          <button type="button" className="button button-primary" onClick={onClose}>
            Close
          </button>
        ) : (
          <>
            <button type="button" className="button button-ghost" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button
              type="button"
              className="button button-primary"
              disabled={busy || toImport.length === 0}
              onClick={() => void runImport()}
            >
              {phase.name === 'importing'
                ? 'Importing…'
                : toImport.length === 0
                  ? 'Nothing to import'
                  : `Import ${toImport.length} post${toImport.length === 1 ? '' : 's'}`}
            </button>
          </>
        )
      }
    >
      <div className="import-body">
        <p className="muted">
          Copies the posts that the previous version of the app saved in <strong>this browser</strong> into the
          shared Supabase calendar. Existing Supabase posts are never changed, and the posts in this browser are not
          deleted. Running the import again skips posts that were already imported.
        </p>

        {phase.name === 'checking' && (
          <p className="auth-status" role="status">
            <span className="spinner" aria-hidden="true" />
            Comparing this browser with Supabase…
          </p>
        )}

        {phase.name === 'failed' && (
          <p className="alert" role="alert">
            {phase.message}
          </p>
        )}

        {phase.name === 'done' && (
          <p className="import-success" role="status">
            {phase.added === 0
              ? 'No new posts were added — they were already in Supabase.'
              : `${phase.added} post${phase.added === 1 ? ' was' : 's were'} imported. Everyone on the team can now see ${phase.added === 1 ? 'it' : 'them'}.`}
          </p>
        )}

        {plan && (
          <>
            {plan.readError && <p className="alert">{plan.readError}</p>}
            {plan.lastImportedAt && (
              <p className="muted small">
                This browser last ran an import on {new Date(plan.lastImportedAt).toLocaleString('en-CA')}.
              </p>
            )}

            <dl className="import-summary">
              <div>
                <dt>Saved in this browser</dt>
                <dd>{plan.localPosts.length}</dd>
              </div>
              <div>
                <dt>New — will be imported</dt>
                <dd>{plan.newPosts.length}</dd>
              </div>
              <div>
                <dt>Already imported — skipped</dt>
                <dd>{plan.alreadyImported.length}</dd>
              </div>
              <div>
                <dt>Same title &amp; date exists</dt>
                <dd>{plan.possibleDuplicates.length}</dd>
              </div>
            </dl>

            {plan.localPosts.length === 0 && !plan.readError && (
              <p className="empty-state">No posts are saved in this browser, so there is nothing to import.</p>
            )}

            {plan.newPosts.length > 0 && (
              <details className="import-details" open={plan.newPosts.length <= 8}>
                <summary>Posts to import ({plan.newPosts.length})</summary>
                <PostPreviewList posts={plan.newPosts} />
              </details>
            )}

            {plan.possibleDuplicates.length > 0 && (
              <div className="import-duplicates">
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={includeMatches}
                    disabled={busy}
                    onChange={(e) => setIncludeMatches(e.target.checked)}
                  />
                  Also import {plan.possibleDuplicates.length} post
                  {plan.possibleDuplicates.length === 1 ? '' : 's'} whose title and date already exist in Supabase
                </label>
                <p className="muted small">
                  Leave unchecked if these were already added from another browser or created by hand.
                </p>
                <details className="import-details">
                  <summary>Show matching posts</summary>
                  <PostPreviewList posts={plan.possibleDuplicates} />
                </details>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}
