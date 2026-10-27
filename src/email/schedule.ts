import { EMAIL_TIME_ZONE, WEEKDAYS, type EmailSchedule, type EmailSettings, type IsoWeekday } from './types'

// Mirrors supabase/functions/_shared/time.ts so the page can preview the next
// send. The Edge Function remains the source of truth for actual sending.

const partsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: EMAIL_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

function torontoParts(date: Date) {
  const out: Record<string, number> = {}
  for (const part of partsFormatter.formatToParts(date)) {
    if (part.type !== 'literal') out[part.type] = Number(part.value)
  }
  return { ...out, hour: out.hour === 24 ? 0 : out.hour } as Record<'year' | 'month' | 'day' | 'hour' | 'minute' | 'second', number>
}

const pad = (n: number) => String(n).padStart(2, '0')

function torontoDateKey(date: Date): string {
  const p = torontoParts(date)
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`
}

function offsetMs(date: Date): number {
  const p = torontoParts(date)
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(date.getTime() / 1000) * 1000
}

function torontoTimeToUtc(dateKey: string, time: string): Date {
  const [y, m, d] = dateKey.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  const wall = Date.UTC(y, m - 1, d, hh, mm)
  // Offsets a day either side cover DST changes: first occurrence of a
  // repeated time, one hour later for a skipped time.
  const candidates = [...new Set([offsetMs(new Date(wall - 86_400_000)), offsetMs(new Date(wall + 86_400_000))])].map(
    (offset) => wall - offset,
  )
  const matching = candidates.filter((utc) => wall - offsetMs(new Date(utc)) === utc)
  return new Date(matching.length > 0 ? Math.min(...matching) : Math.max(...candidates))
}

function addDays(dateKey: string, amount: number): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d + amount))
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

function isoWeekday(dateKey: string): IsoWeekday {
  const [y, m, d] = dateKey.split('-').map(Number)
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return (day === 0 ? 7 : day) as IsoWeekday
}

/** The next digest send time, or null when nothing is scheduled. */
export function nextDigestSend(settings: EmailSettings, schedules: EmailSchedule[], now = new Date()): Date | null {
  if (settings.paused || !settings.digestEnabled || settings.digestWeekdays.length === 0) return null
  const times = schedules.filter((s) => s.active).map((s) => s.sendTime).sort()
  if (times.length === 0) return null
  const today = torontoDateKey(now)
  for (let offset = 0; offset <= 7; offset++) {
    const dateKey = addDays(today, offset)
    if (!settings.digestWeekdays.includes(isoWeekday(dateKey))) continue
    for (const time of times) {
      const instant = torontoTimeToUtc(dateKey, time)
      if (instant > now) return instant
    }
  }
  return null
}

/** e.g. "Mon, Oct 26, 9:00 a.m." in Toronto time. */
export function formatTorontoDateTime(value: Date | string): string {
  return new Date(value).toLocaleString('en-CA', {
    timeZone: EMAIL_TIME_ZONE,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/** "09:00" → "9:00 a.m." */
export function formatClock(time: string): string {
  const [hh, mm] = time.split(':').map(Number)
  return new Date(Date.UTC(2000, 0, 1, hh, mm)).toLocaleTimeString('en-CA', {
    timeZone: 'UTC',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/** "Mon–Fri", "Mon, Wed, Fri", "Every day". */
export function describeWeekdays(days: IsoWeekday[]): string {
  const sorted = [...days].sort((a, b) => a - b)
  if (sorted.length === 7) return 'Every day'
  if (sorted.length === 0) return 'No days selected'
  if (sorted.join() === '1,2,3,4,5') return 'Monday to Friday'
  const label = (d: IsoWeekday) => WEEKDAYS[d - 1].short
  return sorted.map(label).join(', ')
}
