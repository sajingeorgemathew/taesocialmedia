import { ARTWORK_BUCKET, getSupabase } from '../lib/supabase'
import { ARTWORK_MAX_BYTES, ARTWORK_MIME_TYPES } from '../types'
import { createId } from '../utils/posts'
import type { ArtworkRepository } from './postRepository'
import { assetFromRow, removeStoredFiles, toAppError, type AssetRow } from './supabasePostRepository'

/** Signed preview URLs stay valid for one hour. */
const PREVIEW_TTL_SECONDS = 60 * 60

const EXTENSIONS: Record<(typeof ARTWORK_MIME_TYPES)[number], string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

/** Null when the file is acceptable, otherwise the reason it is not. */
export function validateArtworkFile(file: File): string | null {
  if (!ARTWORK_MIME_TYPES.includes(file.type as (typeof ARTWORK_MIME_TYPES)[number])) {
    return `“${file.name}” is not a supported image. Use JPG, PNG, WebP or GIF.`
  }
  if (file.size > ARTWORK_MAX_BYTES) {
    return `“${file.name}” is larger than ${ARTWORK_MAX_BYTES / 1024 / 1024} MB.`
  }
  if (file.size === 0) return `“${file.name}” is empty.`
  return null
}

export const supabaseArtworkRepository: ArtworkRepository = {
  async upload(postId, file, position) {
    const problem = validateArtworkFile(file)
    if (problem) throw new Error(problem)

    const db = getSupabase()
    const extension = EXTENSIONS[file.type as keyof typeof EXTENSIONS]
    // Random object names: the original file name is only kept as metadata.
    const path = `posts/${postId}/${createId()}.${extension}`

    const { error: uploadError } = await db.storage
      .from(ARTWORK_BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false, cacheControl: '3600' })
    if (uploadError) throw toAppError(uploadError)

    const { data, error } = await db
      .from('post_assets')
      .insert({
        post_id: postId,
        storage_path: path,
        file_name: file.name.slice(0, 255),
        mime_type: file.type,
        size_bytes: file.size,
        position,
      })
      .select()
      .single<AssetRow>()
    if (error) {
      // Don't leave an unreferenced file behind.
      await removeStoredFiles([path])
      throw toAppError(error)
    }
    return assetFromRow(data)
  },

  async remove(asset) {
    const { error } = await getSupabase().from('post_assets').delete().eq('id', asset.id)
    if (error) throw toAppError(error)
    await removeStoredFiles([asset.path])
  },

  async reorder(assets) {
    const db = getSupabase()
    const reordered = assets.map((asset, index) => ({ ...asset, position: index }))
    const changed = reordered.filter((asset, index) => asset.position !== assets[index].position)
    const results = await Promise.all(
      changed.map((asset) => db.from('post_assets').update({ position: asset.position }).eq('id', asset.id)),
    )
    const failed = results.find((r) => r.error)
    if (failed?.error) throw toAppError(failed.error)
    return reordered
  },

  async getPreviewUrls(paths) {
    if (paths.length === 0) return {}
    const { data, error } = await getSupabase()
      .storage.from(ARTWORK_BUCKET)
      .createSignedUrls(paths, PREVIEW_TTL_SECONDS)
    if (error) throw toAppError(error)
    const urls: Record<string, string> = {}
    for (const item of data) {
      if (item.path && item.signedUrl) urls[item.path] = item.signedUrl
    }
    return urls
  },
}
