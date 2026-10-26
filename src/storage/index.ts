import type { ArtworkRepository, PostRepository } from './postRepository'
import { supabaseArtworkRepository } from './supabaseArtworkRepository'
import { supabasePostRepository } from './supabasePostRepository'

export type { ArtworkRepository, PostRepository, UpdateOptions } from './postRepository'
export { ConflictError, NotFoundError, errorMessage } from './errors'

/**
 * The single place to swap persistence. Posts are shared through Supabase;
 * localStoragePostRepository remains available as the source for the
 * one-time import of posts saved by Feature 1.
 */
export const postRepository: PostRepository = supabasePostRepository
export const artworkRepository: ArtworkRepository = supabaseArtworkRepository
