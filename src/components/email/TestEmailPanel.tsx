import { CircleAlert, Send } from 'lucide-react'
import { useState } from 'react'
import { sendTestEmail } from '../../email/emailRepository'
import type { EmailRecipient, TestSendResult } from '../../email/types'
import { errorMessage } from '../../storage'
import type { Notify } from './EmailRemindersPage'

interface TestEmailPanelProps {
  /** Active recipients only; disabled addresses cannot be tested. */
  recipients: EmailRecipient[]
  onNotify: Notify
  onSent: () => void
}

const OUTCOME_LABEL: Record<TestSendResult['outcome'], string> = {
  sent: 'Sent',
  duplicate: 'Already sent',
  queued: 'Queued',
  failed: 'Failed',
  skipped: 'Skipped',
}

export function TestEmailPanel({ recipients, onNotify, onSent }: TestEmailPanelProps) {
  // Unticked addresses are remembered; new recipients start ticked.
  const [unselected, setUnselected] = useState<Set<string>>(() => new Set())
  const [sending, setSending] = useState(false)
  const [results, setResults] = useState<TestSendResult[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const selected = recipients.filter((r) => !unselected.has(r.id))

  const toggle = (id: string) =>
    setUnselected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const send = async () => {
    if (selected.length === 0) return
    setSending(true)
    setError(null)
    setResults(null)
    try {
      const sent = await sendTestEmail(
        selected.map((r) => r.id),
        crypto.randomUUID(),
      )
      setResults(sent)
      const ok = sent.filter((r) => r.outcome === 'sent').length
      onNotify(
        ok === sent.length ? `Test email sent to ${ok} recipient${ok === 1 ? '' : 's'}` : `Test email: ${ok} of ${sent.length} sent`,
        ok === sent.length ? 'info' : 'error',
      )
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSending(false)
      onSent()
    }
  }

  return (
    <section className="panel" aria-labelledby="email-test-title">
      <div className="panel-heading">
        <div>
          <h2 id="email-test-title" className="panel-title">
            <Send aria-hidden="true" />
            Send Test Email
          </h2>
          <p className="muted small">Sends the live progress digest now, marked “[Test]”. Works even while reminders are paused.</p>
        </div>
      </div>

      {recipients.length === 0 ? (
        <p className="empty-state">Add or enable a recipient to send a test email.</p>
      ) : (
        <fieldset className="field" disabled={sending}>
          <legend>Send to</legend>
          <div className="email-test-recipients">
            {recipients.map((r) => (
              <label key={r.id} className="checkbox">
                <input type="checkbox" checked={!unselected.has(r.id)} onChange={() => toggle(r.id)} />
                <span className="email-address">{r.email}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <div className="email-test-actions">
        <button type="button" className="button button-primary" disabled={sending || selected.length === 0} onClick={() => void send()}>
          {sending ? (
            <>
              <span className="spinner" aria-hidden="true" /> Sending…
            </>
          ) : (
            <>
              <Send aria-hidden="true" />
              {`Send test email${selected.length > 0 ? ` (${selected.length})` : ''}`}
            </>
          )}
        </button>
      </div>

      {error && (
        <p className="alert" role="alert">
          <CircleAlert aria-hidden="true" />
          {error}
        </p>
      )}

      {results && results.length > 0 && (
        <ul className="email-test-results" aria-live="polite">
          {results.map((r) => (
            <li key={r.email}>
              <span className={`delivery-status delivery-${r.outcome === 'duplicate' ? 'sent' : r.outcome}`}>{OUTCOME_LABEL[r.outcome]}</span>
              <span className="email-address">{r.email}</span>
              {r.error && <span className="muted small email-error-text">{r.error}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
