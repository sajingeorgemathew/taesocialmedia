import { BellRing, CircleAlert, PauseCircle, PlayCircle } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { loadEmailConfig, updateEmailSettings, type EmailConfig } from '../../email/emailRepository'
import { describeWeekdays, formatTorontoDateTime, nextDigestSend } from '../../email/schedule'
import { EMAIL_SENDER, type EmailRecipient, type EmailSchedule, type EmailSettings } from '../../email/types'
import { errorMessage } from '../../storage'
import { ConfirmDialog } from '../ConfirmDialog'
import { DeliveryHistory } from './DeliveryHistory'
import { NotificationsPanel } from './NotificationsPanel'
import { RecipientsPanel } from './RecipientsPanel'
import { SchedulePanel } from './SchedulePanel'
import { TestEmailPanel } from './TestEmailPanel'

export type Notify = (message: string, tone?: 'info' | 'error') => void

interface EmailRemindersPageProps {
  onNotify: Notify
}

type LoadState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; config: EmailConfig }

/** Admin-only settings for scheduled digests, notifications and test emails. */
export function EmailRemindersPage({ onNotify }: EmailRemindersPageProps) {
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [pausing, setPausing] = useState(false)
  const [confirmPause, setConfirmPause] = useState(false)
  const [historyKey, setHistoryKey] = useState(0)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    loadEmailConfig()
      .then((config) => {
        if (active) setState({ status: 'ready', config })
      })
      .catch((err: unknown) => {
        if (active) setState({ status: 'error', message: errorMessage(err) })
      })
    return () => {
      active = false
    }
  }, [attempt])

  const retry = () => {
    setState({ status: 'loading' })
    setAttempt((n) => n + 1)
  }

  const patchConfig = useCallback((update: (config: EmailConfig) => EmailConfig) => {
    setState((s) => (s.status === 'ready' ? { status: 'ready', config: update(s.config) } : s))
  }, [])

  const setSettings = useCallback((settings: EmailSettings) => patchConfig((c) => ({ ...c, settings })), [patchConfig])
  const setRecipients = useCallback(
    (update: (list: EmailRecipient[]) => EmailRecipient[]) => patchConfig((c) => ({ ...c, recipients: update(c.recipients) })),
    [patchConfig],
  )
  const setSchedules = useCallback(
    (update: (list: EmailSchedule[]) => EmailSchedule[]) =>
      patchConfig((c) => ({
        ...c,
        schedules: update(c.schedules).sort((a, b) => a.sendTime.localeCompare(b.sendTime)),
      })),
    [patchConfig],
  )

  const saveSettings = useCallback(
    async (patch: Partial<Omit<EmailSettings, 'updatedAt'>>, message: string) => {
      try {
        setSettings(await updateEmailSettings(patch))
        onNotify(message)
        return true
      } catch (err) {
        onNotify(errorMessage(err), 'error')
        return false
      }
    },
    [onNotify, setSettings],
  )

  const config = state.status === 'ready' ? state.config : null
  const nextSend = useMemo(
    () => (config ? nextDigestSend(config.settings, config.schedules) : null),
    [config],
  )

  const togglePause = async (paused: boolean) => {
    setPausing(true)
    await saveSettings({ paused }, paused ? 'All scheduled reminders are paused' : 'Scheduled reminders resumed')
    setPausing(false)
    setConfirmPause(false)
  }

  if (state.status === 'loading') {
    return (
      <section className="panel">
        <p className="loading-state" role="status">
          <span className="spinner" aria-hidden="true" /> Loading email reminder settings…
        </p>
      </section>
    )
  }

  if (state.status === 'error') {
    return (
      <section className="panel email-page-error">
        <h2 className="panel-title">Email Reminders</h2>
        <div className="alert alert-row" role="alert">
          <span>
            <CircleAlert aria-hidden="true" />
            {state.message}
          </span>
          <button type="button" className="button button-ghost button-small" onClick={retry}>
            Try again
          </button>
        </div>
      </section>
    )
  }

  const { settings, recipients, schedules } = state.config
  const activeRecipients = recipients.filter((r) => r.active)
  const activeTimes = schedules.filter((s) => s.active).length

  return (
    <div className="email-page">
      <section className={`panel email-status${settings.paused ? ' is-paused' : ''}`} aria-labelledby="email-status-title">
        <div className="email-status-main">
          <span className="email-status-indicator" aria-hidden="true">
            {settings.paused ? <PauseCircle /> : <BellRing />}
          </span>
          <div>
            <h2 id="email-status-title" className="email-status-title">
              {settings.paused ? 'All scheduled reminders are paused' : 'Scheduled reminders are active'}
            </h2>
            <p className="muted small">
              {settings.paused
                ? 'No digests, notifications or deadline reminders will be sent until you resume. Test emails still work.'
                : nextSend
                  ? `Next digest: ${formatTorontoDateTime(nextSend)} (Toronto time) · ${activeTimes} time${activeTimes === 1 ? '' : 's'}, ${describeWeekdays(settings.digestWeekdays)}`
                  : 'No digest is scheduled. Turn on the digest and add an active sending time below.'}
            </p>
          </div>
        </div>
        <div className="email-status-actions">
          <span className="muted small email-sender" title="Sender address">
            From: {EMAIL_SENDER}
          </span>
          {settings.paused ? (
            <button type="button" className="button button-primary" disabled={pausing} onClick={() => void togglePause(false)}>
              <PlayCircle aria-hidden="true" />
              {pausing ? 'Resuming…' : 'Resume reminders'}
            </button>
          ) : (
            <button type="button" className="button button-secondary button-danger-text" disabled={pausing} onClick={() => setConfirmPause(true)}>
              <PauseCircle aria-hidden="true" />
              Pause All Reminders
            </button>
          )}
        </div>
      </section>

      <div className="email-grid">
        <div className="email-column">
          <RecipientsPanel recipients={recipients} onChange={setRecipients} onNotify={onNotify} />
          <SchedulePanel
            settings={settings}
            schedules={schedules}
            onSchedulesChange={setSchedules}
            onSaveSettings={saveSettings}
            onNotify={onNotify}
          />
        </div>
        <div className="email-column">
          <TestEmailPanel
            recipients={activeRecipients}
            onNotify={onNotify}
            onSent={() => setHistoryKey((k) => k + 1)}
          />
          <NotificationsPanel settings={settings} onSaveSettings={saveSettings} />
        </div>
      </div>

      <DeliveryHistory key={historyKey} onNotify={onNotify} />

      {confirmPause && (
        <ConfirmDialog
          title="Pause all reminders?"
          message="Scheduled progress digests, workflow notifications and deadline reminders will stop until you resume them. Workflow changes made while paused are not sent later."
          confirmLabel={pausing ? 'Pausing…' : 'Pause reminders'}
          onCancel={() => setConfirmPause(false)}
          onConfirm={() => void togglePause(true)}
        />
      )}
    </div>
  )
}
