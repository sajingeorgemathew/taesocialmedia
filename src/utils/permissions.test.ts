import { describe, expect, it } from 'vitest'
import { ADMIN, DESIGNER, makePost } from '../test/fixtures'
import { STATUSES } from '../types'
import { canEditPost, canReview, statusOptions } from './permissions'

describe('permissions (UI mirror of the database rules)', () => {
  it('admins edit every post and may choose every status', () => {
    for (const status of STATUSES) {
      const post = makePost({ status })
      expect(canEditPost(ADMIN, post)).toBe(true)
      expect(statusOptions(ADMIN, post)).toEqual(STATUSES)
    }
  })

  it('designers edit any unfinished post, including posts assigned to someone else', () => {
    for (const status of ['Planned', 'In Design', 'Ready for Review'] as const) {
      const post = makePost({ status, designerId: 'u-ben' })
      expect(canEditPost(DESIGNER, post)).toBe(true)
      expect(statusOptions(DESIGNER, post)).toEqual(['Planned', 'In Design', 'Ready for Review'])
    }
  })

  it('Approved and Published posts are read-only for designers', () => {
    for (const status of ['Approved', 'Published'] as const) {
      const post = makePost({ status, designerId: DESIGNER.userId })
      expect(canEditPost(DESIGNER, post)).toBe(false)
      expect(statusOptions(DESIGNER, post)).toEqual([status])
    }
  })

  it('only admins review, and only Ready for Review or Approved posts', () => {
    expect(canReview(ADMIN, makePost({ status: 'Ready for Review' }))).toBe(true)
    expect(canReview(ADMIN, makePost({ status: 'Approved' }))).toBe(true)
    expect(canReview(ADMIN, makePost({ status: 'In Design' }))).toBe(false)
    expect(canReview(DESIGNER, makePost({ status: 'Ready for Review' }))).toBe(false)
  })
})
