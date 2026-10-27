import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ADMIN, DESIGNER, makePost } from '../test/fixtures'
import { statusOptions } from '../utils/permissions'
import { PostList } from './PostList'

afterEach(cleanup)

const posts = [
  makePost({ id: 'a', title: 'Second', publishDate: '2026-11-05' }),
  makePost({ id: 'b', title: 'First', publishDate: '2026-11-01', status: 'Published' }),
]

describe('PostList', () => {
  it('lists posts in date order with admin actions', async () => {
    const onDelete = vi.fn()
    const onDuplicate = vi.fn()
    render(
      <PostList
        posts={posts}
        today="2026-10-27"
        onOpen={vi.fn()}
        onStatusChange={vi.fn()}
        statusOptions={(p) => statusOptions(ADMIN, p)}
        onDuplicate={onDuplicate}
        onDelete={onDelete}
      />,
    )
    const rows = within(screen.getByRole('list', { name: 'All posts' })).getAllByRole('listitem')
    expect(rows.map((r) => within(r).getByText(/First|Second/).textContent)).toEqual(['First', 'Second'])

    await userEvent.setup().click(screen.getByRole('button', { name: 'Delete “Second”' }))
    expect(onDelete).toHaveBeenCalledWith(posts[0])
    expect(screen.getByRole('button', { name: 'Duplicate “First”' })).toBeTruthy()
  })

  it('designers get Open only, and cannot change a Published post’s status', () => {
    render(
      <PostList posts={posts} today="2026-10-27" onOpen={vi.fn()} onStatusChange={vi.fn()} statusOptions={(p) => statusOptions(DESIGNER, p)} />,
    )
    expect(screen.queryByRole('button', { name: /^Delete/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Duplicate/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Open “First”' })).toBeTruthy()

    const selects = screen.getAllByRole('combobox', { name: 'Change status' })
    // Row order: First (Published) then Second (In Design).
    expect(selects[0]).toHaveProperty('disabled', true)
    expect(within(selects[1]).getAllByRole('option').map((o) => o.textContent)).toEqual(['Planned', 'In Design', 'Ready for Review'])
  })
})
