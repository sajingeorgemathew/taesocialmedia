import { useState, type FormEvent } from 'react'
import { formatClock } from '../../email/schedule'
import type { EmailSettings } from '../../email/types'

interface NotificationsPanelProps {
  settings: EmailSettings
  onSaveSettings: (patch: Partial<Omit<EmailSettings, 'updatedAt'>>, message: string) => Promise<boolean>
}

type ToggleKey = 'notifyAssignment' | 'notifyReadyForReview' | 'notifyApproved' | 'notifyChangesRequested' | 'notifyDeadline'

const TOGGLES: { key: ToggleKey; label: string; description: string }[] = [
  {
    key: 'notifyAssignment',
    label: 'Assignment notifications',
    description:
      'When a post is assigned or reassigned. Sent to the designer’s account email, with a copy to recipients with “Assignments” ticked.',
  },
  {
    key: 'notifyReadyForReview',
    label: 'Ready for Review notifications',
    description: 'When a designer submits a post for review. Sent to recipients with “Workflow” ticked.',
  },
  {
    key: 'notifyApproved',
    label: 'Approval notifications',
    description: 'When a post is approved and ready to publish. Sent to “Workflow” recipients and the assigned designer.',
  },
  {
    key: 'notifyChangesRequested',
    label: 'Changes requested notifications',
    description: 'When an administrator sends a post back with feedback. Sent to the assigned designer.',
  },
  {
    key: 'notifyDeadline',
    label: 'Publishing deadline reminders',
    description: 'One email a day to “Workflow” recipients listing unfinished posts due soon or overdue.',
  },
]

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

export function NotificationsPanel({ settings, onSaveSettings }: NotificationsPanelProps) {
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [days, setDays] = useState(String(settings.deadlineDaysAhead))
  const [time, setTime] = useState(settings.deadlineReminderTime)
  const [appUrl, setAppUrl] = useState(settings.appUrl)
  const [urlError, setUrlError] = useState<string | null>(null)

  const toggle = async (key: ToggleKey, value: boolean, label: string) => {
    setSavingKey(key)
    await onSaveSettings({ [key]: value }, `${label} ${value ? 'turned on' : 'turned off'}`)
    setSavingKey(null)
  }

  const saveDeadline = async (e: FormEvent) => {
    e.preventDefault()
    setSavingKey('deadline')
    await onSaveSettings(
      { deadlineDaysAhead: Number(days), deadlineReminderTime: time },
      `Deadline reminder set for ${formatClock(time)}`,
    )
    setSavingKey(null)
  }

  const saveUrl = async (e: FormEvent) => {
    e.preventDefault()
    const value = appUrl.trim()
    if (value && !isHttpsUrl(value)) {
      setUrlError('Enter the full https:// address of the deployed app, or leave it empty.')
      return
    }
    setUrlError(null)
    setSavingKey('url')
    await onSaveSettings({ appUrl: value }, value ? 'Application link saved' : 'Application link removed from emails')
    setSavingKey(null)
  }

  const deadlineDirty = days !== String(settings.deadlineDaysAhead) || time !== settings.deadlineReminderTime

  return (
    <section className="panel" aria-labelledby="email-notifications-title">
      <div className="panel-heading">
        <div>
          <h2 id="email-notifications-title" className="panel-title">
            Notification preferences
          </h2>
          <p className="muted small">
            Separate from the digest schedule. Only these workflow changes send email — ordinary edits never do. Changes
            are grouped and sent within about 5 minutes.
          </p>
        </div>
      </div>

      <ul className="email-toggle-list">
        {TOGGLES.map((t) => (
          <li key={t.key}>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={settings[t.key]}
                disabled={savingKey === t.key}
                onChange={(e) => void toggle(t.key, e.target.checked, t.label)}
              />
              <span>
                <strong>{t.label}</strong>
                <span className="muted small email-toggle-description">{t.description}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>

      <form className="email-inline-form" onSubmit={(e) => void saveDeadline(e)}>
        <label className="field">
          <span>Deadline window</span>
          <select value={days} onChange={(e) => setDays(e.target.value)}>
            <option value="0">Due today</option>
            {[1, 2, 3, 5, 7, 14].map((n) => (
              <option key={n} value={n}>
                Due within {n} day{n === 1 ? '' : 's'}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Reminder time</span>
          <input type="time" step={300} value={time} required onChange={(e) => setTime(e.target.value)} />
        </label>
        <button type="submit" className="button button-secondary" disabled={!deadlineDirty || savingKey === 'deadline' || !time}>
          {savingKey === 'deadline' ? 'Saving…' : 'Save'}
        </button>
      </form>

      <h3 className="email-subheading">Application link</h3>
      <form className="email-inline-form" onSubmit={(e) => void saveUrl(e)} noValidate>
        <label className="field email-url-field">
          <span>Deployed app URL</span>
          <input
            type="url"
            inputMode="url"
            value={appUrl}
            placeholder="https://social.torontoacademy.ca"
            aria-invalid={urlError ? true : undefined}
            onChange={(e) => {
              setAppUrl(e.target.value)
              setUrlError(null)
            }}
          />
        </label>
        <button type="submit" className="button button-secondary" disabled={appUrl.trim() === settings.appUrl || savingKey === 'url'}>
          {savingKey === 'url' ? 'Saving…' : 'Save link'}
        </button>
      </form>
      {urlError && (
        <p className="field-error" role="alert">
          {urlError}
        </p>
      )}
      <p className="muted small email-footnote">
        Emails include an “Open TAE Social Media Manager” button only when this is set. The app still requires sign-in.
      </p>
    </section>
  )
}
