const pad = (n: number) => String(n).padStart(2, '0')

/** Formats a Date as a local YYYY-MM-DD key (no timezone shifting). */
export function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function todayKey(): string {
  return toDateKey(new Date())
}

/** Parses a YYYY-MM-DD key as a local date at midnight. */
export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

export function isValidDateKey(key: unknown): key is string {
  return typeof key === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(key)
}

export function formatLongDate(key: string): string {
  return parseDateKey(key).toLocaleDateString('en-CA', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function formatMonthLabel(month: Date): string {
  return month.toLocaleDateString('en-CA', { month: 'long', year: 'numeric' })
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

export function addMonths(month: Date, amount: number): Date {
  return new Date(month.getFullYear(), month.getMonth() + amount, 1)
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function daysBetween(from: string, to: string): number {
  const ms = parseDateKey(to).getTime() - parseDateKey(from).getTime()
  return Math.round(ms / 86_400_000)
}

/** Weeks (Sunday first) covering the given month, as date keys. */
export function buildMonthGrid(month: Date): string[][] {
  const first = startOfMonth(month)
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0)
  const cursor = new Date(first)
  cursor.setDate(first.getDate() - first.getDay())

  const weeks: string[][] = []
  while (cursor <= last) {
    const week: string[] = []
    for (let i = 0; i < 7; i++) {
      week.push(toDateKey(cursor))
      cursor.setDate(cursor.getDate() + 1)
    }
    weeks.push(week)
  }
  return weeks
}

/** Human-friendly relative label, e.g. "Today", "In 3 days", "2 days overdue". */
export function relativeDayLabel(dateKey: string, today: string): string {
  const diff = daysBetween(today, dateKey)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff === -1) return 'Yesterday'
  return diff > 0 ? `In ${diff} days` : `${-diff} days ago`
}
