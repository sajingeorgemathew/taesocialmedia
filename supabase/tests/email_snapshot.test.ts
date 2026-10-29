// Feature 6 guard: the HTML redesign must not change what an email says.
// Subjects and plain-text bodies of every email type are compared with a
// snapshot taken before the redesign, and every dynamic value must still
// appear in the HTML. Run with: npm run test:email
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { escapeHtml } from '../functions/_shared/layout.ts'
import { SAMPLE_CHANGES, SAMPLE_POSTS, sampleEmails } from './email_samples.ts'

const snapshot = JSON.parse(readFileSync(new URL('./snapshots/email_text.json', import.meta.url), 'utf8')) as Record<string, { subject: string; text: string }>

test('every email type still exists with an unchanged subject and plain text', () => {
  const rendered: Record<string, { subject: string; text: string }> = {}
  for (const [prefix, appUrl] of [['', undefined], ['no-app-url/', null]] as const) {
    for (const [name, email] of Object.entries(sampleEmails(appUrl))) rendered[prefix + name] = { subject: email.subject, text: email.text }
  }
  assert.deepEqual(Object.keys(rendered).sort(), Object.keys(snapshot).sort())
  for (const [name, expected] of Object.entries(snapshot)) {
    assert.equal(rendered[name].subject, expected.subject, `${name} subject`)
    assert.equal(rendered[name].text, expected.text, `${name} text`)
  }
})

test('every post shown in the digest text also appears in the HTML with its details', () => {
  const { digest } = sampleEmails()
  for (const p of SAMPLE_POSTS) {
    if (!digest.text.includes(p.title)) continue
    assert.ok(digest.html.includes(escapeHtml(p.title)), p.title)
    assert.ok(digest.html.includes(escapeHtml(p.program)), p.program)
    if (p.designer) assert.ok(digest.html.includes(escapeHtml(p.designer)), p.designer)
  }
})

test('revision note appears in the changes-requested email', () => {
  const email = sampleEmails()['changes-requested']
  for (const line of SAMPLE_CHANGES.review_note.split('\n')) assert.ok(email.html.includes(escapeHtml(line)), line)
})
