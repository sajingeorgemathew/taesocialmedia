// America/Toronto date helpers. Uses the runtime's IANA time zone data, so
// daylight saving changes are handled without hard-coded offsets.

export const TIME_ZONE = 'America/Toronto'

interface LocalParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

const partsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

function localParts(date: Date): LocalParts {
  const out: Record<string, number> = {}
  for (const part of partsFormatter.formatToParts(date)) {
    if (part.type !== 'literal') out[part.type] = Number(part.value)
  }
  return {
    year: out.year,
    month: out.month,
    day: out.day,
    hour: out.hour === 24 ? 0 : out.hour,
    minute: out.minute,
    second: out.second,
  }
}

const pad = (n: number) => String(n).padStart(2, '0')

/** The Toronto calendar date of an instant, as YYYY-MM-DD. */
export function localDateKey(date: Date): string {
  const p = localParts(date)
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`
}

/** Toronto's UTC offset at an instant, in milliseconds (negative in Canada). */
function offsetMs(date: Date): number {
  const p = localParts(date)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return asUtc - Math.floor(date.getTime() / 1000) * 1000
}

/**
 * The instant at which the Toronto wall clock shows `time` (HH:MM) on
 * `dateKey`. Tries the offsets in force a day before and a day after, so DST
 * changes are handled: a repeated wall time (fall-back) resolves to its first
 * occurrence, and a wall time skipped by spring-forward resolves one hour
 * later (2:30 → 3:30 EDT).
 */
export function torontoTimeToUtc(dateKey: string, time: string): Date {
  const [y, m, d] = dateKey.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  const wall = Date.UTC(y, m - 1, d, hh, mm)
  const candidates = [...new Set([offsetMs(new Date(wall - 86_400_000)), offsetMs(new Date(wall + 86_400_000))])].map(
    (offset) => wall - offset,
  )
  const matching = candidates.filter((utc) => wall - offsetMs(new Date(utc)) === utc)
  return new Date(matching.length > 0 ? Math.min(...matching) : Math.max(...candidates))
}

export function addDays(dateKey: string, amount: number): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d + amount))
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

/** ISO weekday of a calendar date: 1 = Monday … 7 = Sunday. */
export function isoWeekday(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map(Number)
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return day === 0 ? 7 : day
}

/** "HH:MM" from a Postgres time value such as "09:00:00". */
export function hhmm(time: string): string {
  return time.slice(0, 5)
}

/** e.g. "Mon, Oct 26, 2026". */
export function formatDateKey(dateKey: string, withYear = true): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-CA', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(withYear ? { year: 'numeric' } : {}),
  })
}

/** e.g. "9:00 a.m." */
export function formatClock(time: string): string {
  const [hh, mm] = time.split(':').map(Number)
  return new Date(Date.UTC(2000, 0, 1, hh, mm)).toLocaleTimeString('en-CA', {
    timeZone: 'UTC',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/** e.g. "Mon, Oct 26, 9:00 a.m." in Toronto time. */
export function formatInstant(date: Date): string {
  return date.toLocaleString('en-CA', {
    timeZone: TIME_ZONE,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}
