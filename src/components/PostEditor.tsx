import { useEffect, useState, type FormEvent } from 'react'
import type { TeamMember } from '../auth/authContext'
import { accountLabel, type TeamAccount } from '../team/teamRepository'
import {
  FORMATS,
  PLATFORMS,
  PROGRAMS,
  STATUSES,
  type ArtworkAsset,
  type ContentFormat,
  type Platform,
  type PostDraft,
  type SocialPost,
} from '../types'
import { isValidDateKey } from '../utils/date'
import { canEditPost, canReview, isAdmin, statusOptions } from '../utils/permissions'
import { designerLabel, statusSlug } from '../utils/posts'
import { SavedArtwork, StagedArtwork, type StagedFile } from './ArtworkUploader'
import { ConfirmDialog } from './ConfirmDialog'
import { Modal } from './Modal'

export interface SaveRequest {
  draft: PostDraft
  /** Save even though someone else changed the post since it was opened. */
  overwrite: boolean
  /** Images picked for a new post, uploaded after it is created. */
  files: File[]
}

/** Why the open post can no longer be saved normally. */
export type EditorConflict = 'changed' | 'deleted' | null

export interface ArtworkHandlers {
  onUpload: (file: File) => Promise<unknown>
  onRemove: (asset: ArtworkAsset) => Promise<void>
  onReorder: (ordered: ArtworkAsset[]) => Promise<void>
}

interface PostEditorProps {
  /** The saved post being edited (latest known copy); omitted when creating a new post. */
  post?: SocialPost
  initialDraft: PostDraft
  onSave: (request: SaveRequest) => Promise<void>
  onClose: () => void
  onDuplicate?: (post: SocialPost) => void
  onDelete?: (post: SocialPost) => void
  conflict?: EditorConflict
  /** Discards local edits and reopens the editor on the latest saved version. */
  onLoadLatest?: () => void
  artwork?: ArtworkHandlers
  /** The signed-in person; decides what can be edited (the database enforces the same rules). */
  member: TeamMember
  /** All team accounts, for the designer dropdown and names. */
  team: TeamAccount[]
  /** Admins: approve or send back a post waiting for review. */
  review?: ReviewHandlers
}

export interface ReviewHandlers {
  onApprove: () => Promise<void>
  onRequestChanges: (note: string) => Promise<void>
}

const CREATIVE_WORDING_PLACEHOLDERS: Record<ContentFormat, string> = {
  'Static Photo': 'Headline\nSupporting line\nCall to action (e.g. Request information today)',
  Carousel:
    'Slide 1: Cover headline\nSlide 2: …\nSlide 3: …\nFinal slide: Call to action\n\nWrite the on-design text for each slide on its own line.',
  Story: 'Headline (short, top of the 9:16 frame)\nSupporting text\nCTA / sticker text (e.g. Tap to learn more)',
  Reel: 'Cover / thumbnail text\nKey on-screen text overlays (detail scenes go in the Reel Script below)',
}

type Errors = Partial<Record<'title' | 'publishDate' | 'platforms' | 'publishedUrl', string>>

function validate(draft: PostDraft): Errors {
  const errors: Errors = {}
  if (!draft.title.trim()) errors.title = 'Please enter a post title.'
  if (!isValidDateKey(draft.publishDate)) errors.publishDate = 'Please choose a publishing date.'
  if (draft.platforms.length === 0) errors.platforms = 'Select at least one platform.'
  if (draft.publishedUrl.trim() && !/^https?:\/\//i.test(draft.publishedUrl.trim())) {
    errors.publishedUrl = 'Published URL should start with http:// or https://'
  }
  return errors
}

/** Approve / Request changes, for admins on posts waiting for review. */
function ReviewPanel({ post, disabled, review }: { post: SocialPost; disabled: boolean; review: ReviewHandlers }) {
  const [note, setNote] = useState('')
  const [requesting, setRequesting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [noteError, setNoteError] = useState<string | null>(null)

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    try {
      await action()
    } finally {
      setBusy(false)
    }
  }

  const sendBack = () => {
    if (!note.trim()) {
      setNoteError('Describe what needs to change so the designer can act on it.')
      return
    }
    void run(() => review.onRequestChanges(note.trim()))
  }

  return (
    <div className="review-panel field-full">
      <div className="review-panel-heading">
        <strong>{post.status === 'Ready for Review' ? 'Review this post' : 'Approved — send back if needed'}</strong>
        {disabled && <span className="muted small">Save or discard your edits first.</span>}
      </div>
      {requesting ? (
        <>
          <label className="field">
            <span>What needs to change?</span>
            <textarea
              rows={3}
              value={note}
              maxLength={2000}
              onChange={(e) => {
                setNote(e.target.value)
                setNoteError(null)
              }}
              placeholder="e.g. Use the new intake date and a brighter photo."
              aria-invalid={Boolean(noteError)}
            />
            {noteError && <span className="field-error">{noteError}</span>}
          </label>
          <div className="review-actions">
            <button type="button" className="button button-ghost button-small" onClick={() => setRequesting(false)} disabled={busy}>
              Cancel
            </button>
            <button type="button" className="button button-primary button-small" onClick={sendBack} disabled={busy || disabled}>
              {busy ? 'Sending…' : 'Send back to designer'}
            </button>
          </div>
        </>
      ) : (
        <div className="review-actions">
          <button type="button" className="button button-secondary button-small" onClick={() => setRequesting(true)} disabled={busy || disabled}>
            Request changes
          </button>
          {post.status === 'Ready for Review' && (
            <button
              type="button"
              className="button button-primary button-small"
              onClick={() => void run(review.onApprove)}
              disabled={busy || disabled}
            >
              {busy ? 'Approving…' : 'Approve'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export function PostEditor({
  post,
  initialDraft,
  onSave,
  onClose,
  onDuplicate,
  onDelete,
  conflict = null,
  onLoadLatest,
  artwork,
  member,
  team,
  review,
}: PostEditorProps) {
  const [draft, setDraft] = useState<PostDraft>(initialDraft)
  const admin = isAdmin(member)
  // Designers: Approved and Published posts are read-only until an admin reopens them.
  const readOnly = post ? !canEditPost(member, post) : false
  // Scheduling fields are managed by admins.
  const locked = readOnly || !admin
  const allowedStatuses = post ? statusOptions(member, post) : STATUSES
  const designerChoices = team.filter(
    (a) => (a.role === 'designer' && a.active) || a.userId === draft.designerId,
  )
  const [errors, setErrors] = useState<Errors>({})
  const [saving, setSaving] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([])

  const isDirty = JSON.stringify(draft) !== JSON.stringify(initialDraft) || stagedFiles.length > 0

  // Warn before a refresh or tab close would throw away unsaved edits.
  useEffect(() => {
    if (!isDirty) return
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [isDirty])

  const set = <K extends keyof PostDraft>(key: K, value: PostDraft[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => ({ ...prev, [key]: undefined }))
  }

  const togglePlatform = (platform: Platform) => {
    const next = draft.platforms.includes(platform)
      ? draft.platforms.filter((p) => p !== platform)
      : PLATFORMS.filter((p) => p === platform || draft.platforms.includes(p))
    set('platforms', next)
  }

  const requestClose = () => {
    if (isDirty) setConfirmDiscard(true)
    else onClose()
  }

  const submit = async (overwrite: boolean) => {
    const found = validate(draft)
    setErrors(found)
    if (Object.keys(found).length > 0) return
    setSaving(true)
    try {
      await onSave({
        draft: {
          ...draft,
          title: draft.title.trim(),
          artworkUrl: draft.artworkUrl.trim(),
          publishedUrl: draft.publishedUrl.trim(),
        },
        overwrite,
        files: stagedFiles.map((staged) => staged.file),
      })
    } finally {
      setSaving(false)
    }
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (conflict || readOnly) return
    void submit(false)
  }

  return (
    <>
      <Modal
        title={post ? 'Edit post' : 'New post'}
        onClose={requestClose}
        footer={
          <>
            {post && (
              <div className="footer-secondary">
                {onDelete && (
                  <button type="button" className="button button-ghost button-danger-text" onClick={() => onDelete(post)}>
                    Delete
                  </button>
                )}
                {onDuplicate && (
                  <button
                    type="button"
                    className="button button-ghost"
                    onClick={() => onDuplicate(post)}
                    title="Creates a Planned copy of the saved post"
                  >
                    Duplicate
                  </button>
                )}
              </div>
            )}
            <button type="button" className="button button-ghost" onClick={requestClose}>
              {readOnly ? 'Close' : 'Cancel'}
            </button>
            {!readOnly && (
              <button
                type="submit"
                form="post-editor-form"
                className="button button-primary"
                disabled={saving || conflict !== null}
                title={conflict ? 'Resolve the notice at the top of the editor first' : undefined}
              >
                {saving ? 'Saving…' : post ? 'Save changes' : 'Create post'}
              </button>
            )}
          </>
        }
      >
        <form id="post-editor-form" className="editor-form" onSubmit={handleSubmit} noValidate>
          {conflict === 'changed' && (
            <div className="conflict-notice field-full" role="alert">
              <p>
                <strong>Another team member saved changes to this post</strong> after you opened it. Your edits
                below have not been saved.
              </p>
              <div className="conflict-actions">
                {onLoadLatest && (
                  <button type="button" className="button button-ghost button-small" onClick={onLoadLatest}>
                    Discard mine &amp; load their version
                  </button>
                )}
                <button
                  type="button"
                  className="button button-primary button-small"
                  disabled={saving}
                  onClick={() => void submit(true)}
                >
                  {saving ? 'Saving…' : 'Overwrite with my version'}
                </button>
              </div>
            </div>
          )}
          {conflict === 'deleted' && (
            <div className="conflict-notice field-full" role="alert">
              <p>
                <strong>This post was deleted by another team member.</strong> It can no longer be saved. Copy any
                text you want to keep before closing the editor.
              </p>
            </div>
          )}

          {post && readOnly && (
            <div className="readonly-notice field-full" role="note">
              <strong>Read-only — {post.status}.</strong> Only an administrator can change this post. To make further
              changes, ask an administrator to reopen it (move it back to In Design).
            </div>
          )}
          {post?.changesRequestedAt && (
            <div className="review-notice field-full" role="status">
              <strong>Changes requested</strong>
              {post.reviewNote && <p>{post.reviewNote}</p>}
            </div>
          )}
          {post && admin && !post.changesRequestedAt && post.reviewNote && post.status === 'Ready for Review' && (
            <div className="review-notice is-history field-full">
              <strong>Previous feedback</strong>
              <p>{post.reviewNote}</p>
            </div>
          )}
          {post && review && canReview(member, post) && (
            <ReviewPanel post={post} disabled={isDirty || conflict !== null} review={review} />
          )}

          <fieldset className="field field-full">
            <legend>Workflow status</legend>
            <div className="status-stepper" role="radiogroup" aria-label="Workflow status">
              {STATUSES.map((status, index) => (
                <button
                  key={status}
                  type="button"
                  role="radio"
                  aria-checked={draft.status === status}
                  disabled={readOnly || !allowedStatuses.includes(status)}
                  className={`step status-${statusSlug(status)}${draft.status === status ? ' is-active' : ''}${
                    STATUSES.indexOf(draft.status) > index ? ' is-complete' : ''
                  }`}
                  onClick={() => set('status', status)}
                >
                  <span className="step-index">{index + 1}</span>
                  {status}
                </button>
              ))}
            </div>
          </fieldset>

          <label className="field field-full">
            <span>Post title *</span>
            <input
              type="text"
              value={draft.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder="e.g. November 16 Intake Announcement"
              aria-invalid={Boolean(errors.title)}
              readOnly={locked}
              data-autofocus
            />
            {errors.title && <span className="field-error">{errors.title}</span>}
          </label>

          <label className="field">
            <span>Publishing date *</span>
            <input
              type="date"
              value={draft.publishDate}
              onChange={(e) => set('publishDate', e.target.value)}
              aria-invalid={Boolean(errors.publishDate)}
              readOnly={locked}
            />
            {errors.publishDate && <span className="field-error">{errors.publishDate}</span>}
          </label>

          <label className="field">
            <span>Program or campaign</span>
            <select
              value={draft.program}
              disabled={locked}
              onChange={(e) => set('program', e.target.value as PostDraft['program'])}
            >
              {PROGRAMS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>

          <fieldset className="field">
            <legend>Platforms *</legend>
            <div className="checkbox-group">
              {PLATFORMS.map((platform) => (
                <label key={platform} className="checkbox">
                  <input
                    type="checkbox"
                    checked={draft.platforms.includes(platform)}
                    disabled={locked}
                    onChange={() => togglePlatform(platform)}
                  />
                  {platform}
                </label>
              ))}
            </div>
            {errors.platforms && <span className="field-error">{errors.platforms}</span>}
          </fieldset>

          <label className="field">
            <span>Content format</span>
            <select
              value={draft.format}
              disabled={locked}
              onChange={(e) => set('format', e.target.value as PostDraft['format'])}
            >
              {FORMATS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>

          <label className="field field-full content-section">
            <span>1. Social Media Caption</span>
            <span className="field-description">Text published below the post on the platform.</span>
            <textarea
              rows={4}
              value={draft.caption}
              readOnly={readOnly}
              onChange={(e) => set('caption', e.target.value)}
              placeholder="Write the post caption, hashtags and call to action."
            />
            <span className="field-hint">{draft.caption.length} characters</span>
          </label>

          <label className="field field-full content-section">
            <span>2. Creative Wording / On-Design Text</span>
            <span className="field-description">
              The exact wording the designer should place inside the visual creative.
            </span>
            <textarea
              rows={draft.format === 'Carousel' ? 6 : 4}
              value={draft.creativeWording}
              readOnly={readOnly}
              onChange={(e) => set('creativeWording', e.target.value)}
              placeholder={CREATIVE_WORDING_PLACEHOLDERS[draft.format]}
            />
          </label>

          <label className="field field-full content-section">
            <span>3. Design Brief / Visual Instructions</span>
            <span className="field-description">
              Layout, photography, colours and branding. Keep on-design text in section 2.
            </span>
            <textarea
              rows={3}
              value={draft.designBrief}
              readOnly={readOnly}
              onChange={(e) => set('designBrief', e.target.value)}
              placeholder="What should the designer create? Sizes, layout, imagery, colours and branding."
            />
          </label>

          {draft.format === 'Reel' && (
            <label className="field field-full content-section">
              <span>Reel Script / Scene Instructions</span>
              <span className="field-description">Optional. Scenes, voiceover and on-screen text.</span>
              <textarea
                rows={5}
                value={draft.reelScript}
                readOnly={readOnly}
                onChange={(e) => set('reelScript', e.target.value)}
                placeholder={
                  'Scene 1 (0–3s): Hook — on-screen text…\nScene 2 (3–8s): B-roll of… / Voiceover: …\nScene 3: Closing CTA — …'
                }
              />
            </label>
          )}

          {admin ? (
            <label className="field">
              <span>Primary designer</span>
              <select value={draft.designerId ?? ''} onChange={(e) => set('designerId', e.target.value || null)}>
                <option value="">Unassigned</option>
                {designerChoices.map((a) => (
                  <option key={a.userId} value={a.userId}>
                    {accountLabel(a)}
                    {a.active ? '' : ' (disabled)'}
                  </option>
                ))}
              </select>
              {post && !post.designerId && post.designer && !draft.designerId && (
                <span className="field-hint">
                  Previously typed name: “{post.designer}”. Choose the matching designer account.
                </span>
              )}
              {designerChoices.length === 0 && (
                <span className="field-hint">No designer accounts yet. Add them in Supabase (see SUPABASE_SETUP.md).</span>
              )}
            </label>
          ) : (
            <div className="field">
              <span>Primary designer</span>
              <p className="field-static">
                {post ? designerLabel(post) : 'Unassigned'}
                {!readOnly && <span className="muted small"> · any designer can contribute; only the office assigns</span>}
              </p>
            </div>
          )}

          <label className="field">
            <span>Artwork URL or reference</span>
            <input
              type="text"
              value={draft.artworkUrl}
              readOnly={readOnly}
              onChange={(e) => set('artworkUrl', e.target.value)}
              placeholder="Canva / Drive link or file name"
            />
          </label>

          <div className="field field-full content-section">
            <span>Uploaded artwork</span>
            <span className="field-description">
              {draft.format === 'Carousel'
                ? 'Upload every carousel slide; use the arrows to set the slide order.'
                : 'Final artwork files for this post. Stored privately for the TAE team.'}
            </span>
            {post && artwork ? (
              conflict === 'deleted' ? (
                <p className="artwork-empty">Artwork is unavailable because the post was deleted.</p>
              ) : (
                <SavedArtwork
                  format={draft.format}
                  artwork={post.artwork}
                  onUpload={artwork.onUpload}
                  onRemove={artwork.onRemove}
                  onReorder={artwork.onReorder}
                  readOnly={readOnly}
                />
              )
            ) : (
              <StagedArtwork format={draft.format} files={stagedFiles} onChange={setStagedFiles} />
            )}
          </div>

          <label className="field field-full">
            <span>Published post URL</span>
            <input
              type="url"
              value={draft.publishedUrl}
              readOnly={locked}
              onChange={(e) => set('publishedUrl', e.target.value)}
              placeholder={draft.status === 'Published' ? 'Paste the live post link' : 'Add once the post is live'}
              aria-invalid={Boolean(errors.publishedUrl)}
            />
            {errors.publishedUrl && <span className="field-error">{errors.publishedUrl}</span>}
          </label>

          <label className="field field-full">
            <span>Internal notes</span>
            <textarea
              rows={3}
              value={draft.notes}
              readOnly={readOnly}
              onChange={(e) => set('notes', e.target.value)}
              placeholder="Approvals, reminders, things to verify before publishing."
            />
          </label>
        </form>
      </Modal>

      {confirmDiscard && (
        <ConfirmDialog
          title="Discard changes?"
          message="You have unsaved changes to this post. Close without saving?"
          confirmLabel="Discard changes"
          onCancel={() => setConfirmDiscard(false)}
          onConfirm={onClose}
        />
      )}
    </>
  )
}
