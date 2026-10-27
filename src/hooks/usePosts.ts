import { useCallback, useEffect, useRef, useState } from 'react'
import { artworkRepository, ConflictError, errorMessage, NotFoundError, postRepository } from '../storage'
import type { ArtworkAsset, PostDraft, SocialPost } from '../types'

/** Loads posts from the repository and exposes CRUD actions that keep state in sync. */
export function usePosts() {
  const [posts, setPosts] = useState<SocialPost[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(0)
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null)
  const postsRef = useRef(posts)
  const reloadRef = useRef<Promise<void> | null>(null)

  useEffect(() => {
    postsRef.current = posts
  }, [posts])

  /** Counts in-flight writes so the header can show "Saving…". */
  const track = useCallback(async <T>(operation: () => Promise<T>): Promise<T> => {
    setPending((n) => n + 1)
    try {
      return await operation()
    } finally {
      setPending((n) => n - 1)
    }
  }, [])

  const replacePost = useCallback((post: SocialPost) => {
    setPosts((prev) => (prev.some((p) => p.id === post.id) ? prev.map((p) => (p.id === post.id ? post : p)) : [...prev, post]))
  }, [])

  const dropPost = useCallback((id: string) => setPosts((prev) => prev.filter((p) => p.id !== id)), [])

  const reload = useCallback(() => {
    // Share one request when several triggers fire together (focus + visibility).
    if (reloadRef.current) return reloadRef.current
    const run = async () => {
      setRefreshing(true)
      try {
        const loaded = await postRepository.list()
        // A save that finished while the list was loading is newer; keep it.
        setPosts((prev) => {
          const current = new Map(prev.map((p) => [p.id, p]))
          return loaded.map((p) => {
            const local = current.get(p.id)
            return local && local.version > p.version ? local : p
          })
        })
        setError(null)
        setLastSyncedAt(Date.now())
      } catch (err) {
        setError(errorMessage(err, 'Could not load posts.'))
      } finally {
        setRefreshing(false)
        setLoading(false)
        reloadRef.current = null
      }
    }
    reloadRef.current = run()
    return reloadRef.current
  }, [])

  useEffect(() => {
    let active = true
    postRepository
      .list()
      .then((loaded) => {
        if (!active) return
        setPosts(loaded)
        setLastSyncedAt(Date.now())
      })
      .catch((err: unknown) => {
        if (active) setError(errorMessage(err, 'Could not load posts.'))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  /** Fetches the latest saved copy of one post; removes it locally if it was deleted. */
  const refreshPost = useCallback(
    async (id: string) => {
      const latest = await postRepository.get(id)
      if (latest) replacePost(latest)
      else dropPost(id)
      return latest
    },
    [replacePost, dropPost],
  )

  const createPost = useCallback(
    async (draft: PostDraft) => {
      const created = await track(() => postRepository.create(draft))
      replacePost(created)
      return created
    },
    [track, replacePost],
  )

  /**
   * Saves changes. With `expectedVersion`, the save is refused if someone else
   * saved first; the local copy is then refreshed so the UI shows their version.
   */
  const updatePost = useCallback(
    async (id: string, changes: Partial<PostDraft>, expectedVersion?: number) => {
      try {
        const updated = await track(() => postRepository.update(id, changes, { expectedVersion }))
        replacePost(updated)
        return updated
      } catch (err) {
        if (err instanceof ConflictError) await refreshPost(id).catch(() => undefined)
        if (err instanceof NotFoundError) dropPost(id)
        throw err
      }
    },
    [track, replacePost, refreshPost, dropPost],
  )

  /** Admin: sends a post back to In Design with feedback for the designer. */
  const requestChanges = useCallback(
    async (id: string, note: string, expectedVersion?: number) => {
      try {
        const updated = await track(() => postRepository.requestChanges(id, note, { expectedVersion }))
        replacePost(updated)
        return updated
      } catch (err) {
        if (err instanceof ConflictError) await refreshPost(id).catch(() => undefined)
        if (err instanceof NotFoundError) dropPost(id)
        throw err
      }
    },
    [track, replacePost, refreshPost, dropPost],
  )

  const deletePost = useCallback(
    async (id: string) => {
      await track(() => postRepository.remove(id))
      dropPost(id)
    },
    [track, dropPost],
  )

  const setArtwork = useCallback((postId: string, update: (artwork: ArtworkAsset[]) => ArtworkAsset[]) => {
    setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, artwork: update(p.artwork) } : p)))
  }, [])

  /** Uploads one image and appends it after the post's current artwork. */
  const addArtwork = useCallback(
    async (postId: string, file: File) => {
      const current = postsRef.current.find((p) => p.id === postId)?.artwork ?? []
      const position = current.reduce((max, a) => Math.max(max, a.position), -1) + 1
      const asset = await track(() => artworkRepository.upload(postId, file, position))
      setArtwork(postId, (artwork) => [...artwork, asset])
      return asset
    },
    [track, setArtwork],
  )

  const removeArtwork = useCallback(
    async (asset: ArtworkAsset) => {
      await track(() => artworkRepository.remove(asset))
      setArtwork(asset.postId, (artwork) => artwork.filter((a) => a.id !== asset.id))
    },
    [track, setArtwork],
  )

  const reorderArtwork = useCallback(
    async (postId: string, ordered: ArtworkAsset[]) => {
      const previous = postsRef.current.find((p) => p.id === postId)?.artwork ?? []
      // Show the new order immediately; roll back if saving fails.
      setArtwork(postId, () => ordered.map((a, i) => ({ ...a, position: i })))
      try {
        const saved = await track(() => artworkRepository.reorder(ordered))
        setArtwork(postId, () => saved)
      } catch (err) {
        setArtwork(postId, () => previous)
        throw err
      }
    },
    [track, setArtwork],
  )

  return {
    posts,
    loading,
    refreshing,
    saving: pending > 0,
    lastSyncedAt,
    error,
    reload,
    refreshPost,
    createPost,
    updatePost,
    requestChanges,
    deletePost,
    addArtwork,
    removeArtwork,
    reorderArtwork,
  }
}
