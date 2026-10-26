import { getSeedDrafts } from '../data/seedPosts'
import {
  FORMATS,
  PLATFORMS,
  PROGRAMS,
  STATUSES,
  type ContentFormat,
  type PostDraft,
  type SocialPost,
} from '../types'
import { isValidDateKey, todayKey } from '../utils/date'
import { createId } from '../utils/posts'
import { ConflictError, NotFoundError } from './errors'
import type { PostRepository } from './postRepository'

export const STORAGE_KEY = 'tae-social-media-manager:posts:v1'

function oneOf<T extends string>(allowed: readonly T[], value: unknown, fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/** The retired "Video" format is treated as a Reel. */
function normalizeFormat(value: unknown): ContentFormat {
  if (typeof value === 'string' && value.trim().toLowerCase() === 'video') return 'Reel'
  return oneOf(FORMATS, value, 'Static Photo')
}

/** Fills sensible defaults so older or hand-edited data never breaks the UI. */
function normalizePost(raw: Record<string, unknown>): SocialPost {
  const now = new Date().toISOString()
  const platforms = Array.isArray(raw.platforms)
    ? PLATFORMS.filter((p) => (raw.platforms as unknown[]).includes(p))
    : []
  return {
    id: text(raw.id) || createId(),
    title: text(raw.title) || 'Untitled post',
    publishDate: isValidDateKey(raw.publishDate) ? raw.publishDate : todayKey(),
    program: oneOf(PROGRAMS, raw.program, 'General TAE Marketing'),
    platforms,
    format: normalizeFormat(raw.format),
    caption: text(raw.caption),
    creativeWording: text(raw.creativeWording),
    designBrief: text(raw.designBrief),
    reelScript: text(raw.reelScript),
    designer: text(raw.designer),
    status: oneOf(STATUSES, raw.status, 'Planned'),
    notes: text(raw.notes),
    artworkUrl: text(raw.artworkUrl),
    publishedUrl: text(raw.publishedUrl),
    // Uploaded artwork only exists in Supabase.
    artwork: [],
    version: typeof raw.version === 'number' && raw.version > 0 ? raw.version : 1,
    createdAt: text(raw.createdAt) || now,
    updatedAt: text(raw.updatedAt) || now,
  }
}

function buildPost(draft: PostDraft, createdAt: string): SocialPost {
  return { ...draft, id: createId(), artwork: [], version: 1, createdAt, updatedAt: createdAt }
}

/**
 * Posts saved in this browser, for the one-time Supabase import. Unlike the
 * repository it never seeds or rewrites anything: localStorage is left as is.
 */
export function readLocalPostsForImport(): { posts: SocialPost[]; error: string | null } {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (raw === null) return { posts: [], error: null }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) throw new Error('Saved posts are not a list')
    const posts = parsed
      .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
      .map(normalizePost)
    return { posts, error: null }
  } catch {
    return { posts: [], error: 'The posts saved in this browser could not be read.' }
  }
}

function readAll(): SocialPost[] {
  const raw = localStorage.getItem(STORAGE_KEY)

  // Seed initial content only when nothing has ever been saved.
  if (raw === null) {
    const base = Date.now()
    // Offset timestamps so seeded posts keep a stable order.
    const seeded = getSeedDrafts().map((draft, i) =>
      buildPost(draft, new Date(base + i).toISOString()),
    )
    writeAll(seeded)
    return seeded
  }

  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) throw new Error('Saved posts are not a list')
    return parsed
      .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
      .map(normalizePost)
  } catch (error) {
    // Keep a backup of unreadable data instead of silently discarding it.
    console.error('Could not read saved posts; a backup was kept.', error)
    localStorage.setItem(`${STORAGE_KEY}:backup-${Date.now()}`, raw)
    writeAll([])
    return []
  }
}

function writeAll(posts: SocialPost[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(posts))
}

export const localStoragePostRepository: PostRepository = {
  async list() {
    return readAll()
  },

  async get(id) {
    return readAll().find((p) => p.id === id) ?? null
  },

  async create(draft) {
    const post = buildPost(draft, new Date().toISOString())
    writeAll([...readAll(), post])
    return post
  },

  async update(id, changes, options) {
    const posts = readAll()
    const index = posts.findIndex((p) => p.id === id)
    if (index === -1) throw new NotFoundError()
    const current = posts[index]
    if (options?.expectedVersion !== undefined && options.expectedVersion !== current.version) {
      throw new ConflictError()
    }
    const updated: SocialPost = {
      ...current,
      ...changes,
      id,
      version: current.version + 1,
      updatedAt: new Date().toISOString(),
    }
    posts[index] = updated
    writeAll(posts)
    return updated
  },

  async remove(id) {
    writeAll(readAll().filter((p) => p.id !== id))
  },
}
