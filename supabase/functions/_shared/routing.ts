// Who receives which workflow notification. Pure, so routing can be tested.
import type { NotificationItem } from './emails.ts'

export interface RoutingRecipient {
  id: string
  email: string
  /** Ready for Review / Approved notifications and deadline reminders. */
  receives_notifications: boolean
  /** A copy of every assignment notification. */
  receives_assignments: boolean
}

/** A TAE account that can be assigned to posts. */
export interface RoutingMember {
  user_id: string
  email: string
  active: boolean
}

export interface Route {
  /** email_recipients.id when the address is on the recipient list, else null. */
  recipient: { id: string | null; email: string }
  items: NotificationItem[]
}

/**
 * Splits notification items per address (active recipients and accounts only):
 *   * assignment        → the assigned designer's account email, plus a copy
 *                         to recipients with receives_assignments.
 *   * ready for review  → recipients with receives_notifications.
 *   * approved          → recipients with receives_notifications, plus the
 *                         assigned designer.
 *   * changes requested → the assigned designer.
 * Nobody is emailed about their own action on their own assignment (e.g. a
 * designer taking over an unassigned post). An address that qualifies twice
 * gets one email. Addresses are never guessed from names.
 */
export function routeNotifications(
  items: NotificationItem[],
  recipients: RoutingRecipient[],
  members: RoutingMember[],
): Route[] {
  const membersById = new Map(members.filter((m) => m.active).map((m) => [m.user_id, m]))
  const routes = new Map<string, Route>()

  const add = (email: string, recipientId: string | null, item: NotificationItem) => {
    const key = email.trim().toLowerCase()
    if (!key) return
    let route = routes.get(key)
    if (!route) {
      route = { recipient: { id: recipientId, email: key }, items: [] }
      routes.set(key, route)
    } else if (!route.recipient.id && recipientId) {
      route.recipient.id = recipientId
    }
    if (!route.items.includes(item)) route.items.push(item)
  }

  const addDesigner = (item: NotificationItem) => {
    const designer = item.post.designer_id ? membersById.get(item.post.designer_id) : undefined
    if (!designer || item.event.actor === designer.user_id) return
    const listed = recipients.find((r) => r.email.toLowerCase() === designer.email.toLowerCase())
    add(designer.email, listed?.id ?? null, item)
  }

  for (const item of items) {
    switch (item.event.event_type) {
      case 'assignment':
        addDesigner(item)
        for (const r of recipients) if (r.receives_assignments) add(r.email, r.id, item)
        break
      case 'ready_for_review':
        for (const r of recipients) if (r.receives_notifications) add(r.email, r.id, item)
        break
      case 'approved':
        for (const r of recipients) if (r.receives_notifications) add(r.email, r.id, item)
        addDesigner(item)
        break
      case 'changes_requested':
        addDesigner(item)
        break
    }
  }

  // Keep each email's posts in the order they were given.
  for (const route of routes.values()) route.items.sort((a, b) => items.indexOf(a) - items.indexOf(b))
  return [...routes.values()]
}
