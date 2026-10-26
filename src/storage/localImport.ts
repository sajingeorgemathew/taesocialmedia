import { getSupabase } from '../lib/supabase'
import type { SocialPost } from '../types'
import { toDraft } from '../utils/posts'
import { readLocalPostsForImport, STORAGE_KEY } from './localStoragePostRepository'
import { toAppError, toRow } from './supabasePostRepository'

const IMPORTED_AT_KEY = `${STORAGE_KEY}:imported-to-supabase-at`
const PAGE_SIZE = 1000
const INSERT_CHUNK = 50

export interface ImportPlan {
  /** Every post saved in this browser. */
  localPosts: SocialPost[]
  /** Not yet in Supabase; imported by default. */
  newPosts: SocialPost[]
  /** Imported before (same original id); always skipped. */
  alreadyImported: SocialPost[]
  /** A Supabase post with the same title and date exists (e.g. created by hand or from another browser). */
  possibleDuplicates: SocialPost[]
  readError: string | null
  /** When this browser last ran an import, if ever. */
  lastImportedAt: string | null
}

interface ExistingKeyRow {
  legacy_id: string | null
  title: string
  publish_date: string
}

const matchKey = (title: string, date: string) => `${title.trim().toLowerCase()}|${date}`

async function fetchExistingKeys(): Promise<ExistingKeyRow[]> {
  const rows: ExistingKeyRow[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await getSupabase()
      .from('posts')
      .select('legacy_id, title, publish_date')
      .order('id')
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw toAppError(error)
    rows.push(...(data as ExistingKeyRow[]))
    if (data.length < PAGE_SIZE) return rows
  }
}

function readLastImportedAt(): string | null {
  try {
    return localStorage.getItem(IMPORTED_AT_KEY)
  } catch {
    return null
  }
}

/** Compares this browser's posts with Supabase without changing anything. */
export async function buildImportPlan(): Promise<ImportPlan> {
  const { posts: localPosts, error: readError } = readLocalPostsForImport()
  const existing = localPosts.length > 0 ? await fetchExistingKeys() : []
  const importedIds = new Set(existing.map((r) => r.legacy_id).filter(Boolean))
  const titleDates = new Set(existing.map((r) => matchKey(r.title, r.publish_date)))

  const plan: ImportPlan = {
    localPosts,
    newPosts: [],
    alreadyImported: [],
    possibleDuplicates: [],
    readError,
    lastImportedAt: readLastImportedAt(),
  }
  for (const post of localPosts) {
    if (importedIds.has(post.id)) plan.alreadyImported.push(post)
    else if (titleDates.has(matchKey(post.title, post.publishDate))) plan.possibleDuplicates.push(post)
    else plan.newPosts.push(post)
  }
  return plan
}

/**
 * Inserts the given local posts. Existing Supabase posts are never updated:
 * rows whose original id was already imported are skipped by the database.
 * Returns the number of posts actually added.
 */
export async function importLocalPosts(posts: SocialPost[]): Promise<number> {
  let added = 0
  for (let i = 0; i < posts.length; i += INSERT_CHUNK) {
    const rows = posts.slice(i, i + INSERT_CHUNK).map((post) => ({
      ...toRow({ ...toDraft(post), title: post.title.trim() || 'Untitled post' }),
      legacy_id: post.id,
      created_at: post.createdAt,
      updated_at: post.updatedAt,
    }))
    const { data, error } = await getSupabase()
      .from('posts')
      .upsert(rows, { onConflict: 'legacy_id', ignoreDuplicates: true })
      .select('id')
    if (error) {
      const reason = toAppError(error).message
      throw new Error(
        added > 0 ? `${added} posts were imported, then the import stopped: ${reason} Run the import again to continue.` : reason,
      )
    }
    added += data.length
  }
  try {
    // A marker only; the local posts themselves are left untouched.
    localStorage.setItem(IMPORTED_AT_KEY, new Date().toISOString())
  } catch {
    // Not being able to record the date does not affect the import.
  }
  return added
}
