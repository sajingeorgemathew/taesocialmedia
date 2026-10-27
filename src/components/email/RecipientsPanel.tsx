import { useState, type FormEvent } from 'react'
import { addRecipient, deleteRecipient, isValidEmail, normalizeEmail, updateRecipient } from '../../email/emailRepository'
import type { EmailRecipient } from '../../email/types'
import { errorMessage } from '../../storage'
import { ConfirmDialog } from '../ConfirmDialog'
import type { Notify } from './EmailRemindersPage'

interface RecipientsPanelProps {
  recipients: EmailRecipient[]
  onChange: (update: (list: EmailRecipient[]) => EmailRecipient[]) => void
  onNotify: Notify
}

type RecipientPatch = Partial<
  Pick<EmailRecipient, 'name' | 'active' | 'receivesDigest' | 'receivesNotifications' | 'receivesAssignments'>
>

function RecipientEditor({
  recipient,
  busy,
  onSave,
  onCancel,
}: {
  recipient: EmailRecipient
  busy: boolean
  onSave: (name: string) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(recipient.name)
  return (
    <form
      className="email-time-edit"
      onSubmit={(e) => {
        e.preventDefault()
        onSave(name)
      }}
    >
      <p className="email-address email-edit-title">{recipient.email}</p>
      <label className="field">
        <span>Name</span>
        <input type="text" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="email-list-actions">
        <button type="button" className="button button-ghost button-small" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="button button-primary button-small" disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  )
}

export function RecipientsPanel({ recipients, onChange, onNotify }: RecipientsPanelProps) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [pendingRemove, setPendingRemove] = useState<EmailRecipient | null>(null)
  const assignmentCopies = recipients.filter((r) => r.active && r.receivesAssignments)

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault()
    const normalized = normalizeEmail(email)
    if (!isValidEmail(normalized)) {
      setFormError('Enter a valid email address, e.g. designer@torontoacademy.ca')
      return
    }
    if (recipients.some((r) => r.email === normalized)) {
      setFormError('That email address is already on the list.')
      return
    }
    setAdding(true)
    setFormError(null)
    try {
      const created = await addRecipient(normalized, name)
      onChange((list) => [...list, created])
      setEmail('')
      setName('')
      onNotify(`${created.email} added`)
    } catch (err) {
      setFormError(errorMessage(err))
    } finally {
      setAdding(false)
    }
  }

  const patch = async (recipient: EmailRecipient, changes: RecipientPatch, message: string) => {
    setBusyId(recipient.id)
    try {
      const updated = await updateRecipient(recipient.id, changes)
      onChange((list) => list.map((r) => (r.id === updated.id ? updated : r)))
      onNotify(message)
      return true
    } catch (err) {
      onNotify(errorMessage(err), 'error')
      return false
    } finally {
      setBusyId(null)
    }
  }

  const saveDetails = async (recipient: EmailRecipient, newName: string) => {
    if (await patch(recipient, { name: newName }, 'Recipient saved')) setEditingId(null)
  }

  const confirmRemove = async () => {
    if (!pendingRemove) return
    const target = pendingRemove
    setPendingRemove(null)
    setBusyId(target.id)
    try {
      await deleteRecipient(target.id)
      onChange((list) => list.filter((r) => r.id !== target.id))
      onNotify(`${target.email} removed`)
    } catch (err) {
      onNotify(errorMessage(err), 'error')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="panel" aria-labelledby="email-recipients-title">
      <div className="panel-heading">
        <div>
          <h2 id="email-recipients-title" className="panel-title">
            Recipients
          </h2>
          <p className="muted small">
            <strong>Digest</strong>: scheduled progress digests. <strong>Workflow</strong>: Ready for Review, approval and
            deadline emails. <strong>Assignments</strong>: a copy of every assignment email. Disabled recipients are
            never emailed.
          </p>
        </div>
        <span className="pill">{recipients.filter((r) => r.active).length} active</span>
      </div>

      <form className="email-inline-form" onSubmit={(e) => void handleAdd(e)} noValidate>
        <label className="field">
          <span>Email address</span>
          <input
            type="email"
            inputMode="email"
            autoComplete="off"
            value={email}
            placeholder="name@torontoacademy.ca"
            aria-invalid={formError ? true : undefined}
            onChange={(e) => {
              setEmail(e.target.value)
              setFormError(null)
            }}
            required
          />
        </label>
        <label className="field">
          <span>Name (optional)</span>
          <input type="text" value={name} maxLength={120} placeholder="e.g. Designer" onChange={(e) => setName(e.target.value)} />
        </label>
        <button type="submit" className="button button-primary" disabled={adding}>
          {adding ? 'Adding…' : 'Add recipient'}
        </button>
      </form>
      {formError && (
        <p className="field-error" role="alert">
          {formError}
        </p>
      )}

      {recipients.length === 0 ? (
        <p className="empty-state">No recipients yet. Add the office address and anyone who should receive reminders.</p>
      ) : (
        <ul className="email-list">
          {recipients.map((r) => {
            const busy = busyId === r.id
            if (editingId === r.id) {
              return (
                <li key={r.id} className="email-list-item">
                  <RecipientEditor
                    recipient={r}
                    busy={busy}
                    onSave={(newName) => void saveDetails(r, newName)}
                    onCancel={() => setEditingId(null)}
                  />
                </li>
              )
            }
            return (
              <li key={r.id} className={`email-list-item${r.active ? '' : ' is-disabled'}`}>
                <div className="email-list-main">
                  <span className="email-address">{r.email}</span>
                  <span className="muted small">
                    {r.name || 'No name'}
                    {!r.active && ' · Disabled'}
                  </span>
                </div>
                <div className="email-list-options" role="group" aria-label={`Email types for ${r.email}`}>
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={r.receivesDigest}
                      disabled={busy}
                      onChange={(e) =>
                        void patch(r, { receivesDigest: e.target.checked }, e.target.checked ? 'Digest turned on' : 'Digest turned off')
                      }
                    />
                    Digest
                  </label>
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={r.receivesNotifications}
                      disabled={busy}
                      onChange={(e) =>
                        void patch(
                          r,
                          { receivesNotifications: e.target.checked },
                          e.target.checked ? 'Workflow emails turned on' : 'Workflow emails turned off',
                        )
                      }
                    />
                    Workflow
                  </label>
                  <label className="checkbox" title="A copy of every assignment email">
                    <input
                      type="checkbox"
                      checked={r.receivesAssignments}
                      disabled={busy}
                      onChange={(e) =>
                        void patch(
                          r,
                          { receivesAssignments: e.target.checked },
                          e.target.checked ? 'Assignment emails turned on' : 'Assignment emails turned off',
                        )
                      }
                    />
                    Assignments
                  </label>
                </div>
                <div className="email-list-actions">
                  <button type="button" className="button button-ghost button-small" disabled={busy} onClick={() => setEditingId(r.id)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    className="button button-ghost button-small"
                    disabled={busy}
                    onClick={() => void patch(r, { active: !r.active }, r.active ? `${r.email} disabled` : `${r.email} enabled`)}
                  >
                    {r.active ? 'Disable' : 'Enable'}
                  </button>
                  <button
                    type="button"
                    className="button button-ghost button-small button-danger-text"
                    disabled={busy}
                    onClick={() => setPendingRemove(r)}
                  >
                    Remove
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <div className="email-designer-links muted small">
        <p>
          <strong>Designers</strong> do not need to be listed here: assignment, approval and change-request emails go to
          the email address of their designer account. Copies of assignment emails go to recipients with{' '}
          <em>Assignments</em> ticked
          {assignmentCopies.length === 0 ? ' — currently nobody.' : ` (${assignmentCopies.length}).`}
        </p>
      </div>

      {pendingRemove && (
        <ConfirmDialog
          title="Remove recipient?"
          message={`${pendingRemove.email} will stop receiving all reminder emails. Past delivery history is kept. To stop emails temporarily, use Disable instead.`}
          confirmLabel="Remove recipient"
          onCancel={() => setPendingRemove(null)}
          onConfirm={() => void confirmRemove()}
        />
      )}
    </section>
  )
}
