import { TriangleAlert } from 'lucide-react'
import { Modal } from './Modal'

interface ConfirmDialogProps {
  title: string
  message: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({ title, message, confirmLabel, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <Modal
      title={title}
      onClose={onCancel}
      size="small"
      footer={
        <>
          <button type="button" className="button button-secondary" onClick={onCancel} data-autofocus>
            Cancel
          </button>
          <button type="button" className="button button-danger" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="confirm-body">
        <span className="confirm-icon" aria-hidden="true">
          <TriangleAlert />
        </span>
        <p className="confirm-message">{message}</p>
      </div>
    </Modal>
  )
}
