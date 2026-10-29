// Regenerates email_text.json (subjects and plain-text bodies of every sample
// email). Only run this when an intended content change has been reviewed.
// Run with: node supabase/tests/snapshots/generate.mts
import { writeFileSync } from 'node:fs'
import { sampleEmails } from '../email_samples.ts'

const snapshot: Record<string, { subject: string; text: string }> = {}
for (const [appUrlLabel, appUrl] of [['', undefined], ['no-app-url/', null]] as const) {
  for (const [name, email] of Object.entries(sampleEmails(appUrl))) snapshot[appUrlLabel + name] = { subject: email.subject, text: email.text }
}
writeFileSync(new URL('./email_text.json', import.meta.url), JSON.stringify(snapshot, null, 2) + '\n')
console.log(`Wrote ${Object.keys(snapshot).length} entries`)
