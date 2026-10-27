import { useState, type FormEvent } from 'react'
import { addSchedule, deleteSchedule, updateSchedule } from '../../email/emailRepository'
import { formatClock } from '../../email/schedule'
import { WEEKDAYS, type EmailSchedule, type EmailSettings, type IsoWeekday } from '../../email/types'
import { errorMessage } from '../../storage'
import { ConfirmDialog } from '../ConfirmDialog'
import type { Notify } from './EmailRemindersPage'

interface SchedulePanelProps {
  settings: EmailSettings
  schedules: EmailSchedule[]
  onSchedulesChange: (update: (list: EmailSchedule[]) => EmailSchedule[]) => void
  onSaveSettings: (patch: Partial<Omit<EmailSettings, 'updatedAt'>>, message: string) => Promise<boolean>
  onNotify: Notify
}

const MAX_TIMES = 12

function ScheduleRow({
  schedule,
  busy,
  onSave,
  onToggle,
  onRemove,
}: {
  schedule: EmailSchedule
  busy: boolean
  onSave: (sendTime: string, label: string) => Promise<boolean>
  onToggle: () => void
  onRemove: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [time, setTime] = useState(schedule.sendTime)
  const [label, setLabel] = useState(schedule.label)

  if (editing) {
    return (
      <li className="email-list-item">
        <form
          className="email-time-edit"
          onSubmit={(e) => {
            e.preventDefault()
            void onSave(time, label).then((ok) => ok && setEditing(false))
          }}
        >
          <label className="field">
            <span>Time</span>
            <input type="time" step={300} value={time} required onChange={(e) => setTime(e.target.value)} />
          </label>
          <label className="field">
            <span>Label</span>
            <input type="text" value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} />
          </label>
          <div className="email-list-actions">
            <button
              type="button"
              className="button button-ghost button-small"
              onClick={() => {
                setTime(schedule.sendTime)
                setLabel(schedule.label)
                setEditing(false)
              }}
            >
              Cancel
            </button>
            <button type="submit" className="button button-primary button-small" disabled={busy || !time}>
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </li>
    )
  }

  return (
    <li className={`email-list-item${schedule.active ? '' : ' is-disabled'}`}>
      <div className="email-list-main">
        <span className="email-time">{formatClock(schedule.sendTime)}</span>
        <span className="muted small">
          {schedule.label || 'No label'}
          {!schedule.active && ' · Off'}
        </span>
      </div>
      <div className="email-list-actions">
        <label className="checkbox">
          <input type="checkbox" checked={schedule.active} disabled={busy} onChange={onToggle} />
          On
        </label>
        <button type="button" className="button button-ghost button-small" disabled={busy} onClick={() => setEditing(true)}>
          Edit
        </button>
        <button type="button" className="button button-ghost button-small button-danger-text" disabled={busy} onClick={onRemove}>
          Remove
        </button>
      </div>
    </li>
  )
}

export function SchedulePanel({ settings, schedules, onSchedulesChange, onSaveSettings, onNotify }: SchedulePanelProps) {
  const [newTime, setNewTime] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const [adding, setAdding] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [savingDays, setSavingDays] = useState(false)
  const [pendingRemove, setPendingRemove] = useState<EmailSchedule | null>(null)

  const run = async (id: string, action: () => Promise<void>) => {
    setBusyId(id)
    try {
      await action()
      return true
    } catch (err) {
      onNotify(errorMessage(err), 'error')
      return false
    } finally {
      setBusyId(null)
    }
  }

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault()
    if (!newTime) return
    if (schedules.some((s) => s.sendTime === newTime)) {
      onNotify('That sending time already exists.', 'error')
      return
    }
    setAdding(true)
    try {
      const created = await addSchedule(newTime, newLabel)
      onSchedulesChange((list) => [...list, created])
      setNewTime('')
      setNewLabel('')
      onNotify(`Digest added at ${formatClock(created.sendTime)}`)
    } catch (err) {
      onNotify(errorMessage(err), 'error')
    } finally {
      setAdding(false)
    }
  }

  const toggleDay = async (day: IsoWeekday) => {
    const days = settings.digestWeekdays.includes(day)
      ? settings.digestWeekdays.filter((d) => d !== day)
      : [...settings.digestWeekdays, day].sort((a, b) => a - b)
    setSavingDays(true)
    await onSaveSettings({ digestWeekdays: days }, 'Digest days updated')
    setSavingDays(false)
  }

  const confirmRemove = async () => {
    if (!pendingRemove) return
    const target = pendingRemove
    setPendingRemove(null)
    await run(target.id, async () => {
      await deleteSchedule(target.id)
      onSchedulesChange((list) => list.filter((s) => s.id !== target.id))
      onNotify(`${formatClock(target.sendTime)} digest removed`)
    })
  }

  return (
    <section className="panel" aria-labelledby="email-schedule-title">
      <div className="panel-heading">
        <div>
          <h2 id="email-schedule-title" className="panel-title">
            Progress digest schedule
          </h2>
          <p className="muted small">Times are Toronto time (America/Toronto) and follow daylight saving automatically.</p>
        </div>
        <label className="checkbox email-switch">
          <input
            type="checkbox"
            checked={settings.digestEnabled}
            onChange={(e) =>
              void onSaveSettings({ digestEnabled: e.target.checked }, e.target.checked ? 'Progress digest turned on' : 'Progress digest turned off')
            }
          />
          Digest on
        </label>
      </div>

      <fieldset className="field email-weekdays" disabled={savingDays}>
        <legend>Days</legend>
        <div className="weekday-chips">
          {WEEKDAYS.map((day) => {
            const selected = settings.digestWeekdays.includes(day.value)
            return (
              <label key={day.value} className={`weekday-chip${selected ? ' is-selected' : ''}`} title={day.long}>
                <input type="checkbox" checked={selected} onChange={() => void toggleDay(day.value)} />
                {day.short}
              </label>
            )
          })}
        </div>
      </fieldset>

      <h3 className="email-subheading">Sending times</h3>
      {schedules.length === 0 ? (
        <p className="empty-state">No sending times. Add one below.</p>
      ) : (
        <ul className="email-list">
          {schedules.map((s) => (
            <ScheduleRow
              key={`${s.id}:${s.sendTime}:${s.label}`}
              schedule={s}
              busy={busyId === s.id}
              onSave={(sendTime, label) =>
                run(s.id, async () => {
                  const updated = await updateSchedule(s.id, { sendTime, label })
                  onSchedulesChange((list) => list.map((x) => (x.id === updated.id ? updated : x)))
                  onNotify(`Digest time saved: ${formatClock(updated.sendTime)}`)
                })
              }
              onToggle={() =>
                void run(s.id, async () => {
                  const updated = await updateSchedule(s.id, { active: !s.active })
                  onSchedulesChange((list) => list.map((x) => (x.id === updated.id ? updated : x)))
                  onNotify(`${formatClock(updated.sendTime)} digest ${updated.active ? 'turned on' : 'turned off'}`)
                })
              }
              onRemove={() => setPendingRemove(s)}
            />
          ))}
        </ul>
      )}

      {schedules.length < MAX_TIMES && (
        <form className="email-inline-form" onSubmit={(e) => void handleAdd(e)}>
          <label className="field">
            <span>New time</span>
            <input type="time" step={300} value={newTime} required onChange={(e) => setNewTime(e.target.value)} />
          </label>
          <label className="field">
            <span>Label (optional)</span>
            <input type="text" value={newLabel} maxLength={60} placeholder="e.g. Afternoon" onChange={(e) => setNewLabel(e.target.value)} />
          </label>
          <button type="submit" className="button button-secondary" disabled={adding || !newTime}>
            {adding ? 'Adding…' : 'Add time'}
          </button>
        </form>
      )}
      <p className="muted small email-footnote">
        Supabase Cron checks every 5 minutes, so a digest arrives within about 5 minutes of its time. A time added or moved
        after it has already passed today starts tomorrow.
      </p>

      {pendingRemove && (
        <ConfirmDialog
          title="Remove sending time?"
          message={`The ${formatClock(pendingRemove.sendTime)} digest will no longer be sent. To skip it temporarily, switch it off instead.`}
          confirmLabel="Remove time"
          onCancel={() => setPendingRemove(null)}
          onConfirm={() => void confirmRemove()}
        />
      )}
    </section>
  )
}
