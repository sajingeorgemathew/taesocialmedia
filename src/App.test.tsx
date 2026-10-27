import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TeamMember } from './auth/authContext'
import { ADMIN, DESIGNER, makePost, TEAM } from './test/fixtures'

let member: TeamMember = ADMIN

vi.mock('./lib/supabase', () => ({ ARTWORK_BUCKET: 'test', supabase: null, getSupabase: () => null }))
vi.mock('./auth/authContext', () => ({
  useAuth: () => ({ signOut: vi.fn().mockResolvedValue(undefined) }),
  useTeamMember: () => member,
}))
vi.mock('./hooks/useTeam', () => ({ useTeam: () => ({ team: TEAM, error: null, reload: vi.fn() }) }))
vi.mock('./components/email/EmailRemindersPage', () => ({ EmailRemindersPage: () => <p>Email settings page</p> }))

const posts = [
  makePost({ id: 'a', title: 'Needs review', status: 'Ready for Review', designerId: DESIGNER.userId, designer: 'Anna Designer' }),
  makePost({ id: 'b', title: 'Sent back', status: 'In Design', designerId: DESIGNER.userId, changesRequestedAt: '2026-10-27T00:00:00Z', reviewNote: 'Fix it' }),
]
vi.mock('./hooks/usePosts', () => ({
  usePosts: () => ({
    posts,
    loading: false,
    refreshing: false,
    saving: false,
    lastSyncedAt: Date.now(),
    error: null,
    reload: vi.fn(),
    createPost: vi.fn(),
    updatePost: vi.fn(),
    requestChanges: vi.fn(),
    deletePost: vi.fn(),
    addArtwork: vi.fn(),
    removeArtwork: vi.fn(),
    reorderArtwork: vi.fn(),
  }),
}))

const { default: App } = await import('./App')

beforeEach(() => localStorage.clear())
afterEach(cleanup)

const nav = () => within(screen.getByRole('navigation', { name: 'Pages' }))

describe('App shell', () => {
  it('admins land on the dashboard and see admin-only navigation and actions', async () => {
    member = ADMIN
    render(<App />)
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeTruthy()
    expect(screen.getByText('Awaiting your review')).toBeTruthy()
    expect(nav().getByRole('button', { name: /Email Reminders/ })).toBeTruthy()
    expect(nav().queryByRole('button', { name: /My Assignments/ })).toBeNull()
    expect(screen.getAllByRole('button', { name: /New post/ }).length).toBeGreaterThan(0)

    await userEvent.setup().click(nav().getByRole('button', { name: /Email Reminders/ }))
    expect(screen.getByText('Email settings page')).toBeTruthy()
  })

  it('designers land on My Assignments without admin navigation or actions', async () => {
    member = DESIGNER
    render(<App />)
    expect(screen.getByRole('heading', { level: 1, name: 'My Assignments' })).toBeTruthy()
    expect(screen.getByText('“Fix it”')).toBeTruthy()
    expect(nav().queryByRole('button', { name: /Email Reminders/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /New post/ })).toBeNull()

    const user = userEvent.setup()
    await user.click(nav().getByRole('button', { name: /Calendar/ }))
    expect(screen.queryByRole('button', { name: /^Add post/ })).toBeNull()
    await user.click(nav().getByRole('button', { name: /All Posts/ }))
    expect(screen.queryByRole('button', { name: /^Delete/ })).toBeNull()

    // The account menu offers no admin items.
    await user.click(screen.getByRole('button', { name: /Anna Designer/ }))
    const menu = within(screen.getByRole('menu'))
    expect(menu.getByRole('menuitem', { name: 'Refresh posts' })).toBeTruthy()
    expect(menu.queryByRole('menuitem', { name: /Import/ })).toBeNull()
    expect(menu.queryByRole('menuitem', { name: /Email reminders/ })).toBeNull()
  })
})
