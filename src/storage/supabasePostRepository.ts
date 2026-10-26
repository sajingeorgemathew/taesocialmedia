import type { PostgrestError } from '@supabase/supabase-js'
import { ARTWORK_BUCKET, getSupabase } from '../lib/supabase'
import type { ArtworkAsset, ContentFormat, Platform, PostDraft, PostStatus, Program, SocialPost } from '../types'
import { ConflictError, NotFoundError } from './errors'
import type { PostRepository } from './postRepository'

/** Row shape of public.posts (see supabase/migrations). */
interface PostRow {
  id: string
  title: string
  publish_date: string
  program: Program
  platforms: Platform[]
  format: ContentFormat
  status: PostStatus
  caption: string
  creative_wording: string
  design_brief: string
  reel_script: string
  designer: string
  notes: string
  artwork_url: string
  published_url: string
  version: number
  created_at: string
  updated_at: string
  post_assets?: AssetRow[]
}

/** Row shape of public.post_assets. */
export interface AssetRow {
  id: string
  post_id: string
  storage_path: string
  file_name: string
  mime_type: string
  size_bytes: number
  position: number
  created_at: string
}

/** Database column for every editable field. */
const COLUMNS: Record<keyof PostDraft, keyof PostRow> = {
  title: 'title',
  publishDate: 'publish_date',
  program: 'program',
  platforms: 'platforms',
  format: 'format',
  caption: 'caption',
  creativeWording: 'creative_wording',
  designBrief: 'design_brief',
  reelScript: 'reel_script',
  designer: 'designer',
  status: 'status',
  notes: 'notes',
  artworkUrl: 'artwork_url',
  publishedUrl: 'published_url',
}

export const POST_SELECT = '*, post_assets(*)'

export function assetFromRow(row: AssetRow): ArtworkAsset {
  return {
    id: row.id,
    postId: row.post_id,
    path: row.storage_path,
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    position: row.position,
    createdAt: row.created_at,
  }
}

function fromRow(row: PostRow): SocialPost {
  return {
    id: row.id,
    title: row.title,
    publishDate: row.publish_date,
    program: row.program,
    platforms: row.platforms ?? [],
    format: row.format,
    caption: row.caption,
    creativeWording: row.creative_wording,
    designBrief: row.design_brief,
    reelScript: row.reel_script,
    designer: row.designer,
    status: row.status,
    notes: row.notes,
    artworkUrl: row.artwork_url,
    publishedUrl: row.published_url,
    artwork: (row.post_assets ?? [])
      .map(assetFromRow)
      .sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt)),
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** Only the columns present in `changes`, so partial updates stay partial. */
export function toRow(changes: Partial<PostDraft>): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  for (const key of Object.keys(changes) as (keyof PostDraft)[]) {
    if (changes[key] !== undefined) row[COLUMNS[key]] = changes[key]
  }
  return row
}

/** Turns Supabase/network failures into messages a team member can act on. */
export function toAppError(error: PostgrestError | Error | { message: string; code?: string }): Error {
  const code = 'code' in error ? error.code : undefined
  const message = error.message ?? ''
  if (code === '42501' || /row-level security/i.test(message)) {
    return new Error('You do not have permission to do this. Ask an admin to confirm your team access.')
  }
  if (code === 'PGRST301' || code === 'PGRST303' || /jwt expired/i.test(message)) {
    return new Error('Your session has expired. Please sign out and sign in again.')
  }
  if (code === '23514') return new Error('Some values were rejected by the database. Please check the post and try again.')
  if (/failed to fetch|network|load failed/i.test(message)) {
    return new Error('Could not reach the server. Check your internet connection and try again.')
  }
  return new Error(message || 'Something went wrong. Please try again.')
}

async function getPost(id: string): Promise<SocialPost | null> {
  const { data, error } = await getSupabase()
    .from('posts')
    .select(POST_SELECT)
    .eq('id', id)
    .maybeSingle<PostRow>()
  if (error) throw toAppError(error)
  return data ? fromRow(data) : null
}

/** Removes stored files; failures only leave unreferenced private files behind. */
export async function removeStoredFiles(paths: string[]): Promise<void> {
  if (paths.length === 0) return
  const { error } = await getSupabase().storage.from(ARTWORK_BUCKET).remove(paths)
  if (error) console.warn('Could not remove artwork files from storage.', error)
}

export const supabasePostRepository: PostRepository = {
  async list() {
    const { data, error } = await getSupabase()
      .from('posts')
      .select(POST_SELECT)
      .order('publish_date')
      .order('created_at')
      .order('position', { referencedTable: 'post_assets' })
    if (error) throw toAppError(error)
    return (data as PostRow[]).map(fromRow)
  },

  get: getPost,

  async create(draft) {
    const { data, error } = await getSupabase()
      .from('posts')
      .insert(toRow(draft))
      .select(POST_SELECT)
      .single<PostRow>()
    if (error) throw toAppError(error)
    return fromRow(data)
  },

  async update(id, changes, options) {
    let query = getSupabase().from('posts').update(toRow(changes)).eq('id', id)
    if (options?.expectedVersion !== undefined) query = query.eq('version', options.expectedVersion)
    const { data, error } = await query.select(POST_SELECT).maybeSingle<PostRow>()
    if (error) throw toAppError(error)
    if (data) return fromRow(data)
    // No row matched: either someone saved a newer version, or it was deleted.
    throw (await getPost(id)) ? new ConflictError() : new NotFoundError()
  },

  async remove(id) {
    const db = getSupabase()
    const { data: assets, error: assetsError } = await db
      .from('post_assets')
      .select('storage_path')
      .eq('post_id', id)
    if (assetsError) throw toAppError(assetsError)

    // Artwork rows are removed by ON DELETE CASCADE; files are removed after.
    const { error } = await db.from('posts').delete().eq('id', id)
    if (error) throw toAppError(error)
    await removeStoredFiles((assets ?? []).map((a: { storage_path: string }) => a.storage_path))
  },
}
