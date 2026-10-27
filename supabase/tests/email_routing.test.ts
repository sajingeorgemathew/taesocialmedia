// Unit tests for workflow-notification routing and relevance (Feature 4).
// Run with: npm run test:email   (Node 22+ runs TypeScript directly)
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildNotificationEmail, stillRelevant, type NotificationItem } from '../functions/_shared/emails.ts'
import type { NotificationEventRow, PostRow } from '../functions/_shared/model.ts'
import { routeNotifications, type RoutingMember, type RoutingRecipient } from '../functions/_shared/routing.ts'

const ADMIN = 'aaaaaaaa-0000-0000-0000-000000000001'
const ANNA = 'dddddddd-0000-0000-0000-000000000001'
const BEN = 'dddddddd-0000-0000-0000-000000000002'

const recipients: RoutingRecipient[] = [
  { id: 'r-office', email: 'office@torontoacademy.ca', receives_notifications: true, receives_assignments: true },
  { id: 'r-owner', email: 'owner@example.com', receives_notifications: true, receives_assignments: false },
]
const members: RoutingMember[] = [
  { user_id: ADMIN, email: 'office@torontoacademy.ca', active: true },
  { user_id: ANNA, email: 'Anna@Example.com', active: true },
  { user_id: BEN, email: 'ben@example.com', active: false },
]

function post(overrides: Partial<PostRow> = {}): PostRow {
  return {
    id: 'p1',
    title: 'Intake announcement',
    program: 'General TAE Marketing',
    publish_date: '2026-11-02',
    status: 'In Design',
    designer: 'Anna',
    designer_id: ANNA,
    review_note: '',
    changes_requested_at: null,
    platforms: ['Instagram'],
    updated_at: '2026-10-27T12:00:00Z',
    ...overrides,
  }
}

let nextId = 1
function item(type: NotificationEventRow['event_type'], p: PostRow, details: Record<string, unknown> = {}, actor = ADMIN): NotificationItem {
  return {
    event: { id: nextId++, post_id: p.id, event_type: type, details, actor, created_at: '2026-10-27T12:00:00Z' },
    post: p,
  }
}

const emailsOf = (routes: ReturnType<typeof routeNotifications>) => routes.map((r) => r.recipient.email).sort()

test('assignment goes to the designer account email plus Assignments copies', () => {
  const routes = routeNotifications([item('assignment', post(), { designer_id: ANNA })], recipients, members)
  assert.deepEqual(emailsOf(routes), ['anna@example.com', 'office@torontoacademy.ca'])
  assert.equal(routes.find((r) => r.recipient.email === 'anna@example.com')?.recipient.id, null)
})

test('nobody is emailed about their own action on a post assigned to them', () => {
  const routes = routeNotifications([item('assignment', post(), { designer_id: ANNA }, ANNA)], recipients, members)
  assert.deepEqual(emailsOf(routes), ['office@torontoacademy.ca'])
})

test('reassignment emails the new designer, not the previous one', () => {
  const routes = routeNotifications(
    [item('assignment', post({ designer_id: ANNA }), { designer_id: ANNA, previous_designer_id: BEN })],
    recipients,
    [...members, { user_id: BEN, email: 'ben@example.com', active: true }],
  )
  assert.deepEqual(emailsOf(routes), ['anna@example.com', 'office@torontoacademy.ca'])
})

test('inactive designer accounts are never emailed; changes go to the fallback', () => {
  const routes = routeNotifications([item('changes_requested', post({ designer_id: BEN }))], recipients, members)
  assert.deepEqual(emailsOf(routes), ['office@torontoacademy.ca'])
})

test('changes requested on an unassigned post goes to the Assignments fallback', () => {
  const routes = routeNotifications([item('changes_requested', post({ designer_id: null, designer: '' }))], recipients, members)
  assert.deepEqual(emailsOf(routes), ['office@torontoacademy.ca'])
})

test('approval of an unassigned post goes to Workflow recipients only', () => {
  const routes = routeNotifications([item('approved', post({ designer_id: null, status: 'Approved' }))], recipients, members)
  assert.deepEqual(emailsOf(routes), ['office@torontoacademy.ca', 'owner@example.com'])
})

test('a post submitted by a contributing designer notifies the office, not the primary designer', () => {
  const routes = routeNotifications([item('ready_for_review', post({ status: 'Ready for Review' }), {}, BEN)], recipients, members)
  assert.deepEqual(emailsOf(routes), ['office@torontoacademy.ca', 'owner@example.com'])
})

test('ready for review goes to Workflow recipients only, not the designer', () => {
  const routes = routeNotifications([item('ready_for_review', post({ status: 'Ready for Review' }), {}, ANNA)], recipients, members)
  assert.deepEqual(emailsOf(routes), ['office@torontoacademy.ca', 'owner@example.com'])
})

test('approval goes to Workflow recipients and the designer', () => {
  const routes = routeNotifications([item('approved', post({ status: 'Approved' }))], recipients, members)
  assert.deepEqual(emailsOf(routes), ['anna@example.com', 'office@torontoacademy.ca', 'owner@example.com'])
})

test('changes requested goes to the designer only', () => {
  const routes = routeNotifications([item('changes_requested', post())], recipients, members)
  assert.deepEqual(emailsOf(routes), ['anna@example.com'])
})

test('an address that qualifies twice receives one email with each post once', () => {
  const p = post()
  const routes = routeNotifications(
    [item('assignment', p, { designer_id: ANNA }), item('approved', post({ id: 'p2', status: 'Approved' }))],
    [{ id: 'r-anna', email: 'anna@example.com', receives_notifications: true, receives_assignments: true }],
    members,
  )
  assert.equal(routes.length, 1)
  assert.equal(routes[0].recipient.id, 'r-anna')
  assert.equal(routes[0].items.length, 2)
})

test('assignment is dropped when the post was reassigned or published meanwhile', () => {
  assert.equal(stillRelevant(item('assignment', post(), { designer_id: ANNA })), true)
  assert.equal(stillRelevant(item('assignment', post({ designer_id: BEN }), { designer_id: ANNA })), false)
  assert.equal(stillRelevant(item('assignment', post({ status: 'Published' }), { designer_id: ANNA })), false)
  assert.equal(stillRelevant(item('assignment', post({ designer_id: null }), { designer_id: ANNA })), false)
})

test('legacy assignment events (typed names) still resolve by name', () => {
  assert.equal(stillRelevant(item('assignment', post({ designer_id: null }), { designer: 'Anna' })), true)
  assert.equal(stillRelevant(item('assignment', post({ designer: 'Ben' }), { designer: 'Anna' })), false)
})

test('changes requested is dropped once the designer resubmits', () => {
  const at = '2026-10-27T15:30:00.123456+00:00'
  const open = post({ changes_requested_at: '2026-10-27T15:30:00.123456+00:00' })
  assert.equal(stillRelevant(item('changes_requested', open, { changes_requested_at: at })), true)
  assert.equal(stillRelevant(item('changes_requested', post({ status: 'Ready for Review' }), { changes_requested_at: at })), false)
  assert.equal(stillRelevant(item('changes_requested', open, { changes_requested_at: '2026-10-26T10:00:00Z' })), false)
})

test('changes-requested email includes the note, escaped', () => {
  const p = post({ review_note: 'Use the <new> logo', changes_requested_at: '2026-10-27T15:30:00Z' })
  const email = buildNotificationEmail([item('changes_requested', p)], '2026-10-27', 'https://app.example.com/')
  assert.match(email.subject, /changes requested/)
  assert.match(email.html, /Use the &lt;new&gt; logo/)
  assert.match(email.text, /Requested changes: Use the <new> logo/)
  assert.match(email.text, /Make the requested changes and resubmit/)
})
