import { useState, type FormEvent } from 'react'
import {
  FORMATS,
  PLATFORMS,
  PROGRAMS,
  STATUSES,
  type ContentFormat,
  type Platform,
  type PostDraft,
  type SocialPost,
} from '../types'
import { isValidDateKey } from '../utils/date'
import { statusSlug } from '../utils/posts'
import { ConfirmDialog } from './ConfirmDialog'
import { Modal } from './Modal'

interface PostEditorProps {
  /** The saved post being edited; omitted when creating a new post. */
  post?: SocialPost
  initialDraft: PostDraft
  onSave: (draft: PostDraft) => Promise<void>
  onClose: () => void
  onDuplicate?: (post: SocialPost) => void
  onDelete?: (post: SocialPost) => void
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

export function PostEditor({ post, initialDraft, onSave, onClose, onDuplicate, onDelete }: PostEditorProps) {
  const [draft, setDraft] = useState<PostDraft>(initialDraft)
  const [errors, setErrors] = useState<Errors>({})
  const [saving, setSaving] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)

  const isDirty = JSON.stringify(draft) !== JSON.stringify(initialDraft)

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

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const found = validate(draft)
    setErrors(found)
    if (Object.keys(found).length > 0) return
    setSaving(true)
    try {
      await onSave({
        ...draft,
        title: draft.title.trim(),
        designer: draft.designer.trim(),
        artworkUrl: draft.artworkUrl.trim(),
        publishedUrl: draft.publishedUrl.trim(),
      })
    } finally {
      setSaving(false)
    }
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
              Cancel
            </button>
            <button type="submit" form="post-editor-form" className="button button-primary" disabled={saving}>
              {saving ? 'Saving…' : post ? 'Save changes' : 'Create post'}
            </button>
          </>
        }
      >
        <form id="post-editor-form" className="editor-form" onSubmit={handleSubmit} noValidate>
          <fieldset className="field field-full">
            <legend>Workflow status</legend>
            <div className="status-stepper" role="radiogroup" aria-label="Workflow status">
              {STATUSES.map((status, index) => (
                <button
                  key={status}
                  type="button"
                  role="radio"
                  aria-checked={draft.status === status}
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
            />
            {errors.publishDate && <span className="field-error">{errors.publishDate}</span>}
          </label>

          <label className="field">
            <span>Program or campaign</span>
            <select value={draft.program} onChange={(e) => set('program', e.target.value as PostDraft['program'])}>
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
            <select value={draft.format} onChange={(e) => set('format', e.target.value as PostDraft['format'])}>
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
                onChange={(e) => set('reelScript', e.target.value)}
                placeholder={
                  'Scene 1 (0–3s): Hook — on-screen text…\nScene 2 (3–8s): B-roll of… / Voiceover: …\nScene 3: Closing CTA — …'
                }
              />
            </label>
          )}

          <label className="field">
            <span>Assigned designer</span>
            <input
              type="text"
              value={draft.designer}
              onChange={(e) => set('designer', e.target.value)}
              placeholder="Unassigned"
            />
          </label>

          <label className="field">
            <span>Artwork URL or reference</span>
            <input
              type="text"
              value={draft.artworkUrl}
              onChange={(e) => set('artworkUrl', e.target.value)}
              placeholder="Canva / Drive link or file name"
            />
          </label>

          <label className="field field-full">
            <span>Published post URL</span>
            <input
              type="url"
              value={draft.publishedUrl}
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
