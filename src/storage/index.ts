import { localStoragePostRepository } from './localStoragePostRepository'
import type { PostRepository } from './postRepository'

export type { PostRepository } from './postRepository'

/** The single place to swap persistence (e.g. for a Supabase repository). */
export const postRepository: PostRepository = localStoragePostRepository
