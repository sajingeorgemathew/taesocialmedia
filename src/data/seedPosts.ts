import type { ContentFormat, Platform, PostDraft, Program } from '../types'

const ALL_PLATFORMS: Platform[] = ['Facebook', 'Instagram', 'LinkedIn']

interface SeedEntry {
  publishDate: string
  title: string
  program: Program
  format: ContentFormat
  designBrief: string
  notes?: string
  platforms?: Platform[]
}

const INTAKE_NOTE = 'Confirm the November 16 intake date and seat availability with Admissions before publishing.'

const SEED_ENTRIES: SeedEntry[] = [
  {
    publishDate: '2026-10-26',
    title: 'November 16 Intake Announcement - MOA & PSW',
    program: 'General TAE Marketing',
    format: 'Carousel',
    designBrief: 'Announce the November 16 intake for MOA and PSW. Bold date callout, both program names, and a clear "Request information" call to action.',
    notes: INTAKE_NOTE,
  },
  {
    publishDate: '2026-10-28',
    title: 'Healthcare Careers Beyond Clinical Care - MOA',
    program: 'Medical Office Assistant Diploma (MOA)',
    format: 'Carousel',
    designBrief: 'Show non-clinical healthcare roles (front desk, scheduling, records). One role per slide.',
  },
  {
    publishDate: '2026-10-30',
    title: 'Introducing Three New Certificate Programs',
    program: 'General TAE Marketing',
    format: 'Carousel',
    designBrief: 'Cover slide plus one slide each for Dental Admin Assistant, Medical Admin Assistant and Pharmacy Assistant certificates.',
  },
  {
    publishDate: '2026-11-01',
    title: 'Exploring Education Financing - Windmill',
    program: 'Windmill Financing',
    format: 'Static Photo',
    designBrief: 'Informational graphic introducing financing options through Windmill. Avoid guarantees or promises about approval.',
    notes: 'Verify financing eligibility details and that all claims are approved by Windmill before publication.',
  },
  {
    publishDate: '2026-11-03',
    title: 'MOA Diploma vs Medical Admin Certificate',
    program: 'Medical Office Assistant Diploma (MOA)',
    format: 'Carousel',
    designBrief: 'Side-by-side comparison: length, focus and career outcomes for each program.',
  },
  {
    publishDate: '2026-11-05',
    title: 'Inside Dental Office Administration',
    program: 'Dental Admin Assistant Certificate',
    format: 'Static Photo',
    designBrief: 'Dental front-office imagery with short overview of daily responsibilities.',
  },
  {
    publishDate: '2026-11-07',
    title: 'Explore Pharmacy Assistant Training',
    program: 'Pharmacy Assistant Certificate',
    format: 'Reel',
    designBrief: 'Short vertical video highlighting what pharmacy assistant training covers.',
    platforms: ['Facebook', 'Instagram'],
  },
  {
    publishDate: '2026-11-08',
    title: 'What Will You Learn in PSW Training?',
    program: 'Personal Support Worker (PSW)',
    format: 'Carousel',
    designBrief: 'Key PSW learning areas, one per slide, with warm, people-focused imagery.',
  },
  {
    publishDate: '2026-11-10',
    title: 'Medical Admin Assistant Certificate Introduction',
    program: 'Medical Admin Assistant Certificate',
    format: 'Static Photo',
    designBrief: 'Program introduction graphic: who it is for and what roles it prepares students for.',
  },
  {
    publishDate: '2026-11-12',
    title: "Five Skills You'll Learn in MOA",
    program: 'Medical Office Assistant Diploma (MOA)',
    format: 'Carousel',
    designBrief: 'Five-slide list of core MOA skills plus a closing call-to-action slide.',
  },
  {
    publishDate: '2026-11-13',
    title: 'November 16 Intake Reminder - MOA & PSW',
    program: 'General TAE Marketing',
    format: 'Story',
    designBrief: 'Countdown-style reminder for the November 16 intake. Vertical 9:16 format.',
    notes: INTAKE_NOTE,
    platforms: ['Facebook', 'Instagram'],
  },
  {
    publishDate: '2026-11-15',
    title: 'How to Request Admission Information',
    program: 'General TAE Marketing',
    format: 'Static Photo',
    designBrief: 'Step-by-step graphic showing how to contact Admissions and request information.',
  },
  {
    publishDate: '2026-11-16',
    title: 'Welcome to Our New Students',
    program: 'General TAE Marketing',
    format: 'Static Photo',
    designBrief: 'Warm welcome graphic for the new intake. Use campus or classroom photography if available.',
  },
]

/** Initial content calendar. All posts start as Planned. */
export function getSeedDrafts(): PostDraft[] {
  return SEED_ENTRIES.map((entry) => ({
    title: entry.title,
    publishDate: entry.publishDate,
    program: entry.program,
    platforms: entry.platforms ?? ALL_PLATFORMS,
    format: entry.format,
    caption: '',
    creativeWording: '',
    designBrief: entry.designBrief,
    reelScript: '',
    designer: '',
    status: 'Planned',
    notes: entry.notes ?? '',
    artworkUrl: '',
    publishedUrl: '',
  }))
}
