import type { ArtworkAsset, PostDraft, SocialPost } from '../types'

export interface UpdateOptions {
  /**
   * The version the caller last saw. When set, the update is rejected with a
   * ConflictError if someone else saved the post in the meantime.
   */
  expectedVersion?: number
}

/**
 * Persistence contract for social posts. The UI only talks to this interface,
 * so the backing store (localStorage, Supabase) can be swapped in one place.
 */
export interface PostRepository {
  list(): Promise<SocialPost[]>
  /** A single post, or null when it no longer exists. */
  get(id: string): Promise<SocialPost | null>
  create(draft: PostDraft): Promise<SocialPost>
  update(id: string, changes: Partial<PostDraft>, options?: UpdateOptions): Promise<SocialPost>
  remove(id: string): Promise<void>
  /**
   * Admin only: sends a Ready for Review / Approved post back to In Design
   * with feedback for the designer.
   */
  requestChanges(id: string, note: string, options?: UpdateOptions): Promise<SocialPost>
}

/** Uploaded artwork images attached to posts. */
export interface ArtworkRepository {
  /** Uploads one image and appends it after the post's existing artwork. */
  upload(postId: string, file: File, position: number): Promise<ArtworkAsset>
  remove(asset: ArtworkAsset): Promise<void>
  /** Persists a new order; `assets` is the full list in the desired order. */
  reorder(assets: ArtworkAsset[]): Promise<ArtworkAsset[]>
  /** Short-lived URLs for previewing private files, keyed by storage path. */
  getPreviewUrls(paths: string[]): Promise<Record<string, string>>
}
