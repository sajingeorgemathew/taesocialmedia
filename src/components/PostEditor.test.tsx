import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TeamMember } from '../auth/authContext'
import { ADMIN, DESIGNER, makePost, TEAM } from '../test/fixtures'
import type { SocialPost } from '../types'
import { toDraft } from '../utils/posts'
import { PostEditor, type ReviewHandlers } from './PostEditor'

// The artwork list loads signed preview URLs; not needed here.
vi.mock('../storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../storage')>()),
  artworkRepository: { getPreviewUrls: () => Promise.resolve({}) },
}))
vi.mock('../lib/supabase', () => ({ ARTWORK_BUCKET: 'test', supabase: null, getSupabase: () => null }))

afterEach(cleanup)

const noop = () => undefined
const artwork = { onUpload: vi.fn(), onRemove: vi.fn(), onReorder: vi.fn() }

function openEditor(member: TeamMember, post: SocialPost | undefined, extra: { review?: ReviewHandlers; admin?: boolean } = {}) {
  const onSave = vi.fn().mockResolvedValue(undefined)
  const admin = member.role === 'admin'
  render(
    <PostEditor
      post={post}
      initialDraft={post ? toDraft(post) : toDraft(makePost({ title: '', designerId: null }))}
      onSave={onSave}
      onClose={noop}
      onDuplicate={admin ? noop : undefined}
      onDelete={admin ? noop : undefined}
      member={member}
      team={TEAM}
      review={extra.review}
      artwork={post ? artwork : undefined}
    />,
  )
  return { onSave }
}

const field = (name: string) => screen.getByLabelText(name, { exact: false })

describe('PostEditor — admin', () => {
  it('can edit scheduling fields, assign designers, duplicate and delete', () => {
    openEditor(ADMIN, makePost())
    expect(field('Post title')).not.toHaveProperty('readOnly', true)
    expect(field('Publishing date')).not.toHaveProperty('readOnly', true)
    expect(field('Program or campaign')).toHaveProperty('disabled', false)
    const designer = screen.getByRole('combobox', { name: /primary designer/i })
    // Active designers plus the admin's own choices; disabled accounts are not offered.
    const options = within(designer).getAllByRole('option').map((o) => o.textContent)
    expect(options).toEqual(['Unassigned', 'Anna Designer', 'Ben Designer'])
    expect(screen.getByRole('button', { name: /delete/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /duplicate/i })).toBeTruthy()
    for (const status of ['Planned', 'In Design', 'Ready for Review', 'Approved', 'Published']) {
      expect(screen.getByRole('radio', { name: new RegExp(status) })).toHaveProperty('disabled', false)
    }
  })

  it('shows Approve and Request changes for posts awaiting review, and requires a note', async () => {
    const review = { onApprove: vi.fn().mockResolvedValue(undefined), onRequestChanges: vi.fn().mockResolvedValue(undefined) }
    openEditor(ADMIN, makePost({ status: 'Ready for Review' }), { review })
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Request changes' }))
    await user.click(screen.getByRole('button', { name: 'Send back to designer' }))
    expect(review.onRequestChanges).not.toHaveBeenCalled()
    expect(screen.getByText(/describe what needs to change/i)).toBeTruthy()

    await user.type(field('What needs to change?'), 'Use the new intake date')
    await user.click(screen.getByRole('button', { name: 'Send back to designer' }))
    expect(review.onRequestChanges).toHaveBeenCalledWith('Use the new intake date')
  })

  it('approves with one click', async () => {
    const review = { onApprove: vi.fn().mockResolvedValue(undefined), onRequestChanges: vi.fn() }
    openEditor(ADMIN, makePost({ status: 'Ready for Review' }), { review })
    await userEvent.setup().click(screen.getByRole('button', { name: 'Approve' }))
    expect(review.onApprove).toHaveBeenCalledOnce()
  })

  it('blocks review actions while there are unsaved edits', async () => {
    const review = { onApprove: vi.fn(), onRequestChanges: vi.fn() }
    openEditor(ADMIN, makePost({ status: 'Ready for Review' }), { review })
    await userEvent.setup().type(field('Internal notes'), 'x')
    expect(screen.getByRole('button', { name: 'Approve' })).toHaveProperty('disabled', true)
    expect(screen.getByText('Save or discard your edits first.')).toBeTruthy()
  })

  it('validates required fields before saving a new post', async () => {
    const { onSave } = openEditor(ADMIN, undefined)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Create post' }))
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByText('Please enter a post title.')).toBeTruthy()
  })
})

describe('PostEditor — designer', () => {
  it('edits content on a post assigned to another designer, but not scheduling fields', async () => {
    const { onSave } = openEditor(DESIGNER, makePost({ designerId: 'u-ben' }))
    for (const name of ['Post title', 'Publishing date', 'Published post URL']) {
      expect(field(name)).toHaveProperty('readOnly', true)
    }
    expect(field('Program or campaign')).toHaveProperty('disabled', true)
    expect(field('Content format')).toHaveProperty('disabled', true)
    for (const platform of ['Facebook', 'Instagram', 'LinkedIn']) {
      expect(screen.getByRole('checkbox', { name: platform })).toHaveProperty('disabled', true)
    }
    // No designer dropdown, no delete or duplicate, no review panel.
    expect(screen.queryByRole('combobox', { name: /primary designer/i })).toBeNull()
    expect(screen.getByText('Any designer can contribute; only the office assigns.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /delete/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /duplicate/i })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
    // Status: only Planned / In Design / Ready for Review.
    expect(screen.getByRole('radio', { name: /Approved/ })).toHaveProperty('disabled', true)
    expect(screen.getByRole('radio', { name: /Published/ })).toHaveProperty('disabled', true)
    expect(screen.getByRole('radio', { name: /Ready for Review/ })).toHaveProperty('disabled', false)

    const user = userEvent.setup()
    await user.type(field('Social media caption'), ' today')
    await user.click(screen.getByRole('radio', { name: /Ready for Review/ }))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(onSave).toHaveBeenCalledOnce()
    const { draft } = onSave.mock.calls[0][0]
    expect(draft.caption).toBe('Join us today')
    expect(draft.status).toBe('Ready for Review')
    expect(draft.designerId).toBe('u-ben')
    expect(draft.publishDate).toBe('2026-11-02')
  })

  it('shows Approved posts read-only with no save or artwork controls', () => {
    openEditor(DESIGNER, makePost({ status: 'Approved', designerId: DESIGNER.userId }))
    expect(screen.getByText(/Read-only — Approved\./)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull()
    // The footer button reads Close instead of Cancel (the dialog's X is also named Close).
    expect(screen.getAllByRole('button', { name: 'Close' }).some((b) => b.textContent === 'Close')).toBe(true)
    expect(field('Social media caption')).toHaveProperty('readOnly', true)
    expect(screen.queryByRole('button', { name: /upload images/i })).toBeNull()
  })

  it('shows the change request note', () => {
    openEditor(DESIGNER, makePost({ changesRequestedAt: '2026-10-27T10:00:00Z', reviewNote: 'Brighter photo please' }))
    expect(screen.getByText('Changes requested')).toBeTruthy()
    expect(screen.getByText('Brighter photo please')).toBeTruthy()
  })
})
