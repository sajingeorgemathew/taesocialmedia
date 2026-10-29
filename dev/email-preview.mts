// Renders every email template with sample data to dev/email-preview/*.html
// so the branding can be reviewed in a browser. Nothing is sent.
// Run with: npm run email:preview
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { brandIconUrl } from '../supabase/functions/_shared/layout.ts'
import { SAMPLE_APP_URL, sampleEmails } from '../supabase/tests/email_samples.ts'

const root = path.dirname(fileURLToPath(import.meta.url))
const out = path.join(root, 'email-preview')
// Set PREVIEW_REMOTE_ASSETS=1 to load the icon from the live app instead of public/.
const remoteAssets = process.env.PREVIEW_REMOTE_ASSETS === '1'

const emails = {
  ...sampleEmails(SAMPLE_APP_URL),
  'no-app-url': sampleEmails(null).deadline,
}

mkdirSync(out, { recursive: true })
// The icon is served by the deployed app; point previews at the local copy.
const remoteIcon = brandIconUrl(SAMPLE_APP_URL) ?? ''
const localIcon = path.relative(out, path.join(root, '..', 'public', 'favicon.png')).replaceAll('\\', '/')
const index: string[] = []
for (const [name, email] of Object.entries(emails)) {
  writeFileSync(path.join(out, `${name}.html`), remoteAssets ? email.html : email.html.replaceAll(remoteIcon, localIcon))
  writeFileSync(path.join(out, `${name}.txt`), `Subject: ${email.subject}\n\n${email.text}`)
  index.push(`<li><a href="${name}.html">${name}</a> — ${email.subject.replace(/</g, '&lt;')}</li>`)
}
writeFileSync(path.join(out, 'index.html'), `<!doctype html><meta charset="utf-8"><title>Email previews</title><ul style="font-family:sans-serif;line-height:2">${index.join('')}</ul>`)
console.log(`Wrote ${Object.keys(emails).length} previews to ${out}`)
