import type { PostDraft, SocialPost } from '../types'

/**
 * Persistence contract for social posts. The UI only talks to this interface,
 * so the localStorage implementation can be swapped for Supabase later.
 * Methods are async to match a future network-backed implementation.
 */
export interface PostRepository {
  list(): Promise<SocialPost[]>
  create(draft: PostDraft): Promise<SocialPost>
  update(id: string, changes: Partial<PostDraft>): Promise<SocialPost>
  remove(id: string): Promise<void>
}
