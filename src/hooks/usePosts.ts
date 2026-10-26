import { useCallback, useEffect, useState } from 'react'
import { postRepository } from '../storage'
import type { PostDraft, SocialPost } from '../types'

/** Loads posts from the repository and exposes CRUD actions that keep state in sync. */
export function usePosts() {
  const [posts, setPosts] = useState<SocialPost[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    postRepository
      .list()
      .then((loaded) => {
        if (active) setPosts(loaded)
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : 'Could not load posts.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const createPost = useCallback(async (draft: PostDraft) => {
    const created = await postRepository.create(draft)
    setPosts((prev) => [...prev, created])
    return created
  }, [])

  const updatePost = useCallback(async (id: string, changes: Partial<PostDraft>) => {
    const updated = await postRepository.update(id, changes)
    setPosts((prev) => prev.map((p) => (p.id === id ? updated : p)))
    return updated
  }, [])

  const deletePost = useCallback(async (id: string) => {
    await postRepository.remove(id)
    setPosts((prev) => prev.filter((p) => p.id !== id))
  }, [])

  return { posts, loading, error, createPost, updatePost, deletePost }
}
