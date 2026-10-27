import { CircleAlert, History, MailX, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { EmptyState } from '../ui/EmptyState'
import { listDeliveryLogs } from '../../email/emailRepository'
import { formatTorontoDateTime } from '../../email/schedule'
import type { DeliveryKind, DeliveryLog, DeliveryStatus } from '../../email/types'
import { errorMessage } from '../../storage'
import type { Notify } from './EmailRemindersPage'

const KIND_LABEL: Record<DeliveryKind, string> = {
  digest: 'Digest',
  test: 'Test',
  notification: 'Notification',
  deadline: 'Deadline',
}

const STATUS_LABEL: Record<DeliveryStatus, string> = {
  queued: 'Queued',
  sending: 'Sending',
  sent: 'Sent',
  failed: 'Failed',
  skipped: 'Skipped',
}

type Filter = 'all' | DeliveryStatus

export function DeliveryHistory({ onNotify }: { onNotify: Notify }) {
  const [logs, setLogs] = useState<DeliveryLog[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('all')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setLogs(await listDeliveryLogs(100))
      setError(null)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    listDeliveryLogs(100)
      .then((data) => {
        if (active) setLogs(data)
      })
      .catch((err: unknown) => {
        if (active) setError(errorMessage(err))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const refresh = async () => {
    await load()
    onNotify('Email history refreshed')
  }

  const shown = logs?.filter((l) => filter === 'all' || l.status === filter) ?? []

  return (
    <section className="panel" aria-labelledby="email-history-title">
      <div className="panel-heading email-history-heading">
        <div>
          <h2 id="email-history-title" className="panel-title">
            <History aria-hidden="true" />
            Delivery history
          </h2>
          <p className="muted small">Latest 100 deliveries. Times are Toronto time.</p>
        </div>
        <div className="email-history-tools">
          <label className="filter-field">
            <span>Status</span>
            <select value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
              <option value="all">All</option>
              <option value="sent">Sent</option>
              <option value="failed">Failed</option>
              <option value="queued">Queued</option>
              <option value="sending">Sending</option>
              <option value="skipped">Skipped</option>
            </select>
          </label>
          <button type="button" className="button button-secondary button-small" disabled={loading} onClick={() => void refresh()}>
            <RefreshCw aria-hidden="true" className={loading ? 'spin' : undefined} />
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <p className="alert" role="alert">
          <CircleAlert aria-hidden="true" />
          {error}
        </p>
      )}

      {logs && shown.length === 0 && !error && (
        <EmptyState icon={MailX}>{logs.length === 0 ? 'No emails have been sent yet.' : 'No emails match this filter.'}</EmptyState>
      )}

      {shown.length > 0 && (
        <ul className="history-list">
          {shown.map((log) => (
            <li key={log.id} className="history-item">
              <div className="history-when">
                <span>{formatTorontoDateTime(log.sentAt ?? log.createdAt)}</span>
                <span className={`pill kind-${log.kind}`}>{KIND_LABEL[log.kind]}</span>
              </div>
              <div className="history-main">
                <span className="email-address">{log.recipientEmail}</span>
                <span className="muted small history-subject">{log.subject}</span>
                {log.error && <span className="small email-error-text">{log.error}</span>}
                {log.status === 'failed' && log.retryable && log.nextAttemptAt && (
                  <span className="muted small">Next attempt: {formatTorontoDateTime(log.nextAttemptAt)}</span>
                )}
              </div>
              <div className="history-status">
                <span className={`delivery-status delivery-${log.status}`}>{STATUS_LABEL[log.status]}</span>
                {log.attempts > 1 && <span className="muted small">{log.attempts} attempts</span>}
                {log.resendMessageId && (
                  <span className="muted small history-id" title="Resend message ID">
                    {log.resendMessageId}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
