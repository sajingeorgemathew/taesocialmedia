// Shared test data for the frontend tests.
import type { TeamMember } from '../auth/authContext'
import type { TeamAccount } from '../team/teamRepository'
import type { SocialPost } from '../types'

export const ADMIN: TeamMember = { userId: 'u-admin', email: 'office@demo.test', displayName: 'TAE Office', role: 'admin' }
export const DESIGNER: TeamMember = { userId: 'u-anna', email: 'anna@demo.test', displayName: 'Anna Designer', role: 'designer' }

export const TEAM: TeamAccount[] = [
  { ...ADMIN, active: true },
  { ...DESIGNER, active: true },
  { userId: 'u-ben', email: 'ben@demo.test', displayName: 'Ben Designer', role: 'designer', active: true },
  { userId: 'u-old', email: 'former@demo.test', displayName: 'Former Designer', role: 'designer', active: false },
]

export function makePost(overrides: Partial<SocialPost> = {}): SocialPost {
  return {
    id: 'p-1',
    title: 'PSW Information Session',
    publishDate: '2026-11-02',
    program: 'Personal Support Worker (PSW)',
    platforms: ['Facebook', 'Instagram'],
    format: 'Static Photo',
    caption: 'Join us',
    creativeWording: 'Free info session',
    designBrief: 'Warm photo',
    reelScript: '',
    designerId: 'u-ben',
    designer: 'Ben Designer',
    status: 'In Design',
    notes: '',
    artworkUrl: '',
    publishedUrl: '',
    reviewNote: '',
    changesRequestedAt: null,
    artwork: [],
    version: 3,
    createdAt: '2026-10-01T12:00:00Z',
    updatedAt: '2026-10-20T12:00:00Z',
    ...overrides,
  }
}
