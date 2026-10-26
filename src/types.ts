export const STATUSES = [
  'Planned',
  'In Design',
  'Ready for Review',
  'Approved',
  'Published',
] as const
export type PostStatus = (typeof STATUSES)[number]

export const PLATFORMS = ['Facebook', 'Instagram', 'LinkedIn'] as const
export type Platform = (typeof PLATFORMS)[number]

export const FORMATS = ['Static Photo', 'Carousel', 'Story', 'Reel'] as const
export type ContentFormat = (typeof FORMATS)[number]

export const PROGRAMS = [
  'Medical Office Assistant Diploma (MOA)',
  'Personal Support Worker (PSW)',
  'Dental Admin Assistant Certificate',
  'Medical Admin Assistant Certificate',
  'Pharmacy Assistant Certificate',
  'Windmill Financing',
  'General TAE Marketing',
] as const
export type Program = (typeof PROGRAMS)[number]

/** Short labels used where space is tight (calendar chips, list rows). */
export const PROGRAM_SHORT: Record<Program, string> = {
  'Medical Office Assistant Diploma (MOA)': 'MOA',
  'Personal Support Worker (PSW)': 'PSW',
  'Dental Admin Assistant Certificate': 'Dental Admin',
  'Medical Admin Assistant Certificate': 'Medical Admin',
  'Pharmacy Assistant Certificate': 'Pharmacy',
  'Windmill Financing': 'Windmill',
  'General TAE Marketing': 'General',
}

/** An image uploaded to the private artwork bucket. */
export interface ArtworkAsset {
  id: string
  postId: string
  /** Object path inside the storage bucket. */
  path: string
  fileName: string
  mimeType: string
  sizeBytes: number
  /** Order within the post; carousel slides are shown in this order. */
  position: number
  createdAt: string
}

export const ARTWORK_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const
export const ARTWORK_MAX_BYTES = 10 * 1024 * 1024
export const ARTWORK_MAX_PER_POST = 20

export interface SocialPost {
  id: string
  title: string
  /** Local calendar date, formatted YYYY-MM-DD. */
  publishDate: string
  program: Program
  platforms: Platform[]
  format: ContentFormat
  /** Text published alongside the post (hashtags, call to action). */
  caption: string
  /** Exact wording the designer places inside the visual creative. */
  creativeWording: string
  /** Visual layout, imagery and branding instructions for the designer. */
  designBrief: string
  /** Scenes, voiceover and on-screen text instructions. Used for Reels. */
  reelScript: string
  designer: string
  status: PostStatus
  notes: string
  artworkUrl: string
  publishedUrl: string
  /** Uploaded artwork images, ordered by position. Managed outside the draft. */
  artwork: ArtworkAsset[]
  /** Incremented on every save; used to detect concurrent edits. */
  version: number
  createdAt: string
  updatedAt: string
}

/** Editable fields of a post (everything the user controls). */
export type PostDraft = Omit<SocialPost, 'id' | 'artwork' | 'version' | 'createdAt' | 'updatedAt'>

export interface PostFilters {
  program: Program | 'All'
  status: PostStatus | 'All'
  platform: Platform | 'All'
}

export const EMPTY_FILTERS: PostFilters = {
  program: 'All',
  status: 'All',
  platform: 'All',
}

export type ViewName = 'calendar' | 'list' | 'queue'
