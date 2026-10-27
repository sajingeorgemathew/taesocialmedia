// Who receives which workflow notification. Pure, so routing can be tested.
import type { NotificationItem } from './emails.ts'

export interface RoutingRecipient {
  id: string
  email: string
  /** Ready for Review / Approved notifications and deadline reminders. */
  receives_notifications: boolean
  /** Assignment notifications for designers with no linked recipient. */
  receives_assignments: boolean
  /** Admin-confirmed designer name this address belongs to ('' = none). */
  designer_name: string
}

export function normalizeDesignerName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase()
}

/**
 * Splits notification items per recipient (active recipients only):
 *   * assignment → the recipient whose designer_name matches the post's
 *     designer, if one exists; otherwise only recipients who opted in to
 *     assignment notifications. A designer's address is never guessed.
 *   * ready for review / approved → recipients with receives_notifications.
 */
export function routeNotifications<R extends RoutingRecipient>(
  items: NotificationItem[],
  recipients: R[],
): { recipient: R; items: NotificationItem[] }[] {
  const byDesigner = new Map<string, R>()
  for (const r of recipients) {
    const key = normalizeDesignerName(r.designer_name)
    if (key) byDesigner.set(key, r)
  }

  const out: { recipient: R; items: NotificationItem[] }[] = []
  for (const r of recipients) {
    const mine = items.filter((item) => {
      if (item.event.event_type !== 'assignment') return r.receives_notifications
      const linked = byDesigner.get(normalizeDesignerName(item.post.designer))
      return linked ? linked.id === r.id : r.receives_assignments
    })
    if (mine.length > 0) out.push({ recipient: r, items: mine })
  }
  return out
}
