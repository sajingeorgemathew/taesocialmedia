import type { Platform } from '../../types'

const MARKS: Record<Platform, { short: string; slug: string }> = {
  Facebook: { short: 'f', slug: 'facebook' },
  Instagram: { short: 'IG', slug: 'instagram' },
  LinkedIn: { short: 'in', slug: 'linkedin' },
}

interface PlatformMarksProps {
  platforms: readonly Platform[]
  size?: 'small' | 'normal'
}

/** Compact platform indicators; the platform names are the accessible label. */
export function PlatformMarks({ platforms, size = 'normal' }: PlatformMarksProps) {
  if (platforms.length === 0) return <span className="platform-none">No platforms</span>
  return (
    <span
      className={`platform-marks${size === 'small' ? ' is-small' : ''}`}
      role="img"
      aria-label={platforms.join(', ')}
      title={platforms.join(', ')}
    >
      {platforms.map((p) => (
        <span key={p} className={`platform-mark is-${MARKS[p].slug}`} aria-hidden="true">
          {MARKS[p].short}
        </span>
      ))}
    </span>
  )
}
