// Which scheduled emails are due at a given instant. Pure functions, so the
// schedule rules can be tested without a database.
import { addDays, hhmm, isoWeekday, localDateKey, torontoTimeToUtc } from './time.ts'

/** A slot is sent if a run happens within this long after its time. */
export const SLOT_WINDOW_MS = 30 * 60_000

export interface ScheduleInput {
  send_time: string
  active: boolean
  updated_at: string
}

export interface DigestSettingsInput {
  digest_enabled: boolean
  digest_weekdays: number[]
}

export interface DueSlot {
  /** Toronto calendar date of the slot. */
  dateKey: string
  /** HH:MM, Toronto wall clock. */
  time: string
  instant: Date
}

/**
 * Digest slots due at `now`. Yesterday is checked too, so a 23:55 slot is
 * still sent by a run just after midnight. A time added or moved after its
 * slot already passed waits until the next matching day.
 */
export function dueDigestSlots(settings: DigestSettingsInput, schedules: ScheduleInput[], now: Date): DueSlot[] {
  if (!settings.digest_enabled) return []
  const today = localDateKey(now)
  const slots: DueSlot[] = []
  for (const dateKey of [addDays(today, -1), today]) {
    if (!settings.digest_weekdays.includes(isoWeekday(dateKey))) continue
    for (const schedule of schedules) {
      if (!schedule.active) continue
      const time = hhmm(schedule.send_time)
      const instant = torontoTimeToUtc(dateKey, time)
      const age = now.getTime() - instant.getTime()
      const changedAfterSlot = Date.parse(schedule.updated_at) > instant.getTime()
      if (age >= 0 && age <= SLOT_WINDOW_MS && !changedAfterSlot) {
        slots.push({ dateKey, time, instant })
      }
    }
  }
  return slots
}

/** Unique key for one recipient's copy of one digest slot. */
export function digestDedupeKey(slot: DueSlot, email: string): string {
  return `digest:${slot.dateKey}T${slot.time}:${email}`
}

/** The daily deadline-reminder slot, if due at `now`. */
export function dueDeadlineSlot(reminderTime: string, now: Date): DueSlot | null {
  const dateKey = localDateKey(now)
  const time = hhmm(reminderTime)
  const instant = torontoTimeToUtc(dateKey, time)
  const age = now.getTime() - instant.getTime()
  return age >= 0 && age <= SLOT_WINDOW_MS ? { dateKey, time, instant } : null
}
