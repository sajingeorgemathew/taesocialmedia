import { X } from 'lucide-react'
import { useEffect, useId, useRef, type ReactNode } from 'react'

interface ModalProps {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  size?: 'small' | 'large' | 'wide'
  /** Optional line under the title. */
  description?: ReactNode
}

// Number of open modals; nested dialogs (e.g. a confirm over the editor)
// share one scroll lock so closing the top one keeps the page locked.
let openModalCount = 0
let savedBodyStyle = { overflow: '', paddingRight: '' }

function lockPageScroll() {
  if (openModalCount === 0) {
    const { body, documentElement } = document
    savedBodyStyle = { overflow: body.style.overflow, paddingRight: body.style.paddingRight }
    // Reserve the scrollbar's width so the dashboard does not shift sideways.
    const scrollbarWidth = window.innerWidth - documentElement.clientWidth
    if (scrollbarWidth > 0) {
      const currentPadding = parseFloat(getComputedStyle(body).paddingRight) || 0
      body.style.paddingRight = `${currentPadding + scrollbarWidth}px`
    }
    body.style.overflow = 'hidden'
  }
  openModalCount += 1
}

function unlockPageScroll() {
  openModalCount = Math.max(0, openModalCount - 1)
  if (openModalCount === 0) {
    document.body.style.overflow = savedBodyStyle.overflow
    document.body.style.paddingRight = savedBodyStyle.paddingRight
  }
}

export function Modal({ title, onClose, children, footer, size = 'large', description }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleId = useId()

  useEffect(() => {
    lockPageScroll()
    return unlockPageScroll
  }, [])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const previouslyFocused = document.activeElement as HTMLElement | null
    const first =
      dialog.querySelector<HTMLElement>('[data-autofocus]') ??
      dialog.querySelector<HTMLElement>('.modal-body input, .modal-body select, .modal-body textarea') ??
      dialog
    first.focus()
    return () => previouslyFocused?.focus?.()
  }, [])

  return (
    <div
      className="modal-backdrop"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          onClose()
        }
      }}
    >
      <div
        ref={dialogRef}
        className={`modal modal-${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <header className="modal-header">
          <div className="modal-heading">
            <h2 id={titleId}>{title}</h2>
            {description && <div className="modal-description">{description}</div>}
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
            <X aria-hidden="true" />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-footer">{footer}</footer>}
      </div>
    </div>
  )
}
