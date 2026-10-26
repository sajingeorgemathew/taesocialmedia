import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react'
import { artworkRepository, errorMessage } from '../storage'
import { validateArtworkFile } from '../storage/supabaseArtworkRepository'
import { ARTWORK_MAX_PER_POST, ARTWORK_MIME_TYPES, type ArtworkAsset, type ContentFormat } from '../types'
import { ConfirmDialog } from './ConfirmDialog'

const ACCEPT = ARTWORK_MIME_TYPES.join(',')

function formatSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function slotLabel(format: ContentFormat, index: number): string {
  return format === 'Carousel' ? `Slide ${index + 1}` : `Image ${index + 1}`
}

/** Splits picked files into acceptable ones and readable reasons for the rest. */
function screenFiles(files: File[], room: number): { accepted: File[]; problems: string[] } {
  const problems: string[] = []
  const valid = files.filter((file) => {
    const problem = validateArtworkFile(file)
    if (problem) problems.push(problem)
    return !problem
  })
  if (valid.length > room) {
    problems.push(`Only ${ARTWORK_MAX_PER_POST} images can be attached to a post; ${valid.length - room} were skipped.`)
  }
  return { accepted: valid.slice(0, Math.max(0, room)), problems }
}

interface PickerProps {
  disabled?: boolean
  label: string
  onPick: (files: File[]) => void
}

function FilePicker({ disabled, label, onPick }: PickerProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const inputId = useId()
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    // Reset so picking the same file again still fires a change.
    e.target.value = ''
    if (files.length > 0) onPick(files)
  }
  return (
    <>
      <input
        ref={inputRef}
        id={inputId}
        className="visually-hidden"
        type="file"
        accept={ACCEPT}
        multiple
        disabled={disabled}
        onChange={handleChange}
      />
      <button
        type="button"
        className="button button-secondary button-small"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        {label}
      </button>
    </>
  )
}

const HINT = `JPG, PNG, WebP or GIF · up to ${ARTWORK_MAX_PER_POST} images · 10 MB each`

interface SavedArtworkProps {
  format: ContentFormat
  artwork: ArtworkAsset[]
  onUpload: (file: File) => Promise<unknown>
  onRemove: (asset: ArtworkAsset) => Promise<void>
  onReorder: (ordered: ArtworkAsset[]) => Promise<void>
}

/** Artwork of a saved post. Changes are saved immediately, separately from the form. */
export function SavedArtwork({ format, artwork, onUpload, onRemove, onReorder }: SavedArtworkProps) {
  const [previews, setPreviews] = useState<Record<string, string>>({})
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [problems, setProblems] = useState<string[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [pendingRemove, setPendingRemove] = useState<ArtworkAsset | null>(null)

  // A preview of '' means the file could not be signed (e.g. it was removed).
  const missingPaths = artwork.map((a) => a.path).filter((path) => !(path in previews))
  const missingKey = missingPaths.join('|')

  // Signed URLs for any image without a preview yet.
  useEffect(() => {
    if (!missingKey) return
    let active = true
    const paths = missingKey.split('|')
    artworkRepository
      .getPreviewUrls(paths)
      .then((urls) => {
        if (!active) return
        setPreviews((prev) => ({ ...prev, ...Object.fromEntries(paths.map((path) => [path, urls[path] ?? ''])) }))
        setPreviewError(null)
      })
      .catch((err: unknown) => {
        if (active) setPreviewError(errorMessage(err, 'Could not load artwork previews.'))
      })
    return () => {
      active = false
    }
  }, [missingKey])

  const handlePick = async (files: File[]) => {
    const { accepted, problems: found } = screenFiles(files, ARTWORK_MAX_PER_POST - artwork.length)
    setProblems(found)
    if (accepted.length === 0) return
    // Sequential uploads keep carousel order the same as the picked order.
    for (let i = 0; i < accepted.length; i++) {
      setProgress({ done: i, total: accepted.length })
      try {
        await onUpload(accepted[i])
      } catch (err) {
        found.push(`“${accepted[i].name}” was not uploaded: ${errorMessage(err)}`)
        setProblems([...found])
      }
    }
    setProgress(null)
  }

  const move = async (index: number, offset: -1 | 1) => {
    const target = index + offset
    if (target < 0 || target >= artwork.length) return
    const ordered = [...artwork]
    ;[ordered[index], ordered[target]] = [ordered[target], ordered[index]]
    setBusyId(artwork[index].id)
    try {
      await onReorder(ordered)
    } catch (err) {
      setProblems([`The new order was not saved: ${errorMessage(err)}`])
    } finally {
      setBusyId(null)
    }
  }

  const confirmRemove = async () => {
    const asset = pendingRemove
    setPendingRemove(null)
    if (!asset) return
    setBusyId(asset.id)
    try {
      await onRemove(asset)
    } catch (err) {
      setProblems([`“${asset.fileName}” was not removed: ${errorMessage(err)}`])
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="artwork">
      <div className="artwork-toolbar">
        <span className="field-description">
          {HINT}. Uploads and removals are saved immediately.
        </span>
        <FilePicker
          label={artwork.length > 0 ? 'Add more images' : 'Upload images'}
          disabled={progress !== null || artwork.length >= ARTWORK_MAX_PER_POST}
          onPick={(files) => void handlePick(files)}
        />
      </div>

      {progress && (
        <p className="artwork-progress" role="status">
          <span className="spinner" aria-hidden="true" />
          Uploading {progress.done + 1} of {progress.total}…
        </p>
      )}
      {previewError && <p className="field-error">{previewError}</p>}
      {problems.map((problem) => (
        <p key={problem} className="field-error">
          {problem}
        </p>
      ))}

      {artwork.length === 0 && !progress ? (
        <p className="artwork-empty">No artwork uploaded yet.</p>
      ) : (
        <ol className="artwork-grid">
          {artwork.map((asset, index) => (
            <li key={asset.id} className={`artwork-tile${busyId === asset.id ? ' is-busy' : ''}`}>
              {previews[asset.path] ? (
                <a href={previews[asset.path]} target="_blank" rel="noopener noreferrer" title="Open full size">
                  <img src={previews[asset.path]} alt={asset.fileName} loading="lazy" />
                </a>
              ) : (
                <div className="artwork-placeholder">
                  {previews[asset.path] === '' ? 'Preview unavailable' : 'Loading…'}
                </div>
              )}
              <div className="artwork-meta">
                <span className="artwork-slot">{slotLabel(format, index)}</span>
                <span className="artwork-name" title={asset.fileName}>
                  {asset.fileName}
                </span>
                <span className="muted small">{formatSize(asset.sizeBytes)}</span>
              </div>
              <div className="artwork-actions">
                <button
                  type="button"
                  className="icon-button artwork-icon"
                  aria-label={`Move ${asset.fileName} earlier`}
                  disabled={index === 0 || busyId !== null}
                  onClick={() => void move(index, -1)}
                >
                  ‹
                </button>
                <button
                  type="button"
                  className="icon-button artwork-icon"
                  aria-label={`Move ${asset.fileName} later`}
                  disabled={index === artwork.length - 1 || busyId !== null}
                  onClick={() => void move(index, 1)}
                >
                  ›
                </button>
                <button
                  type="button"
                  className="button button-ghost button-small button-danger-text"
                  disabled={busyId !== null}
                  onClick={() => setPendingRemove(asset)}
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}

      {pendingRemove && (
        <ConfirmDialog
          title="Remove artwork?"
          message={`“${pendingRemove.fileName}” will be permanently deleted from storage for everyone on the team.`}
          confirmLabel="Remove image"
          onCancel={() => setPendingRemove(null)}
          onConfirm={() => void confirmRemove()}
        />
      )}
    </div>
  )
}

/** A picked image with a local preview URL, not uploaded yet. */
export interface StagedFile {
  file: File
  previewUrl: string
}

interface StagedArtworkProps {
  format: ContentFormat
  files: StagedFile[]
  onChange: (files: StagedFile[]) => void
}

/** Images picked for a post that has not been created yet; uploaded on create. */
export function StagedArtwork({ format, files, onChange }: StagedArtworkProps) {
  const [problems, setProblems] = useState<string[]>([])
  const filesRef = useRef(files)

  useEffect(() => {
    filesRef.current = files
  }, [files])

  // Release local previews when the editor closes.
  useEffect(() => () => filesRef.current.forEach((f) => URL.revokeObjectURL(f.previewUrl)), [])

  const handlePick = (picked: File[]) => {
    const { accepted, problems: found } = screenFiles(picked, ARTWORK_MAX_PER_POST - files.length)
    setProblems(found)
    if (accepted.length > 0) {
      onChange([...files, ...accepted.map((file) => ({ file, previewUrl: URL.createObjectURL(file) }))])
    }
  }

  const remove = (index: number) => {
    URL.revokeObjectURL(files[index].previewUrl)
    onChange(files.filter((_, i) => i !== index))
  }

  const move = (index: number, offset: -1 | 1) => {
    const target = index + offset
    if (target < 0 || target >= files.length) return
    const ordered = [...files]
    ;[ordered[index], ordered[target]] = [ordered[target], ordered[index]]
    onChange(ordered)
  }

  return (
    <div className="artwork">
      <div className="artwork-toolbar">
        <span className="field-description">{HINT}. Images upload when you create the post.</span>
        <FilePicker
          label={files.length > 0 ? 'Add more images' : 'Choose images'}
          disabled={files.length >= ARTWORK_MAX_PER_POST}
          onPick={handlePick}
        />
      </div>
      {problems.map((problem) => (
        <p key={problem} className="field-error">
          {problem}
        </p>
      ))}
      {files.length === 0 ? (
        <p className="artwork-empty">No images chosen.</p>
      ) : (
        <ol className="artwork-grid">
          {files.map(({ file, previewUrl }, index) => (
            <li key={previewUrl} className="artwork-tile">
              <img src={previewUrl} alt={file.name} />
              <div className="artwork-meta">
                <span className="artwork-slot">{slotLabel(format, index)}</span>
                <span className="artwork-name" title={file.name}>
                  {file.name}
                </span>
                <span className="muted small">{formatSize(file.size)} · not uploaded yet</span>
              </div>
              <div className="artwork-actions">
                <button
                  type="button"
                  className="icon-button artwork-icon"
                  aria-label={`Move ${file.name} earlier`}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  ‹
                </button>
                <button
                  type="button"
                  className="icon-button artwork-icon"
                  aria-label={`Move ${file.name} later`}
                  disabled={index === files.length - 1}
                  onClick={() => move(index, 1)}
                >
                  ›
                </button>
                <button
                  type="button"
                  className="button button-ghost button-small button-danger-text"
                  onClick={() => remove(index)}
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
