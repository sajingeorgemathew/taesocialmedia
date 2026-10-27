// Email HTML building blocks. Table layout with inline styles so the emails
// render consistently in Gmail, Outlook and phone mail apps. Colours follow
// the TAE dashboard (navy, cream, gold and the workflow status accents).
import type { PostStatus } from './model.ts'

export const COLORS = {
  navy: '#0e1f3d',
  navy800: '#142a52',
  navy100: '#e6ebf4',
  cream: '#f7f2e7',
  gold: '#c9a24a',
  text: '#1f2a3d',
  muted: '#5f6b80',
  border: '#e3ddd0',
  danger: '#b42318',
  dangerBg: '#fdecea',
}

export const STATUS_COLORS: Record<PostStatus | 'Overdue', { fg: string; bg: string }> = {
  Planned: { fg: '#5b6b85', bg: '#eef1f6' },
  'In Design': { fg: '#6247c7', bg: '#efebfb' },
  'Ready for Review': { fg: '#b45f06', bg: '#fdf1e1' },
  Approved: { fg: '#0f7f86', bg: '#e3f4f4' },
  Published: { fg: '#2c7a3f', bg: '#e5f3e8' },
  Overdue: { fg: COLORS.danger, bg: COLORS.dangerBg },
}

const FONT = "'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Only https URLs are linked; anything else is dropped. */
export function safeAppUrl(url: string): string | null {
  try {
    const parsed = new URL(url.trim())
    return parsed.protocol === 'https:' ? parsed.toString() : null
  } catch {
    return null
  }
}

export function badge(label: string, colors: { fg: string; bg: string }): string {
  return `<span style="display:inline-block;padding:2px 10px;border-radius:999px;background:${colors.bg};color:${colors.fg};font-size:12px;font-weight:600;white-space:nowrap;">${escapeHtml(label)}</span>`
}

export function sectionHeading(title: string, count: number, description: string, tone: 'normal' | 'danger' = 'normal'): string {
  const color = tone === 'danger' ? COLORS.danger : COLORS.navy800
  return `<tr><td style="padding:24px 24px 8px;">
  <div style="font-size:13px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${color};">${escapeHtml(title)} <span style="color:${COLORS.muted};font-weight:600;">(${count})</span></div>
  <div style="font-size:13px;color:${COLORS.muted};padding-top:2px;">${escapeHtml(description)}</div>
</td></tr>`
}

export function emptyRow(message: string): string {
  return `<tr><td style="padding:4px 24px 0;"><div style="padding:10px 14px;border:1px dashed ${COLORS.border};border-radius:6px;color:${COLORS.muted};font-size:13px;">${escapeHtml(message)}</div></td></tr>`
}

export function noteRow(message: string): string {
  return `<tr><td style="padding:6px 24px 0;font-size:12px;color:${COLORS.muted};">${escapeHtml(message)}</td></tr>`
}

interface LayoutOptions {
  preheader: string
  heading: string
  subheading: string
  /** Rows (<tr>) for the main card. */
  rows: string
  appUrl: string | null
  banner?: string
  footer: string
}

export function renderLayout(o: LayoutOptions): string {
  const button = o.appUrl
    ? `<tr><td style="padding:28px 24px 4px;" align="left">
  <a href="${escapeHtml(o.appUrl)}" style="display:inline-block;padding:11px 20px;border-radius:6px;background:${COLORS.navy800};color:#ffffff;font-weight:600;font-size:14px;text-decoration:none;">Open TAE Social Media Manager</a>
  <div style="font-size:12px;color:${COLORS.muted};padding-top:8px;">Sign-in required. Links are never shared outside the TAE team.</div>
</td></tr>`
    : ''
  const banner = o.banner
    ? `<tr><td style="padding:16px 24px 0;"><div style="padding:10px 14px;border-radius:6px;background:${COLORS.navy100};color:${COLORS.navy800};font-size:13px;font-weight:600;">${escapeHtml(o.banner)}</div></td></tr>`
    : ''
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(o.heading)}</title>
</head>
<body style="margin:0;padding:0;background:${COLORS.cream};font-family:${FONT};color:${COLORS.text};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(o.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLORS.cream};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:640px;background:#ffffff;border:1px solid ${COLORS.border};border-radius:10px;overflow:hidden;">
<tr><td style="background:${COLORS.navy};border-bottom:3px solid ${COLORS.gold};padding:18px 24px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="width:42px;height:42px;border-radius:21px;background:${COLORS.cream};color:${COLORS.navy};font-weight:800;font-size:13px;text-align:center;vertical-align:middle;">TAE</td>
    <td style="padding-left:12px;">
      <div style="color:#ffffff;font-size:17px;font-weight:700;">TAE Social Media Manager</div>
      <div style="color:#c4cee0;font-size:12px;">Toronto Academy of Education</div>
    </td>
  </tr></table>
</td></tr>
${banner}
<tr><td style="padding:22px 24px 0;">
  <div style="font-size:20px;font-weight:700;color:${COLORS.navy};">${escapeHtml(o.heading)}</div>
  <div style="font-size:14px;color:${COLORS.muted};padding-top:4px;">${escapeHtml(o.subheading)}</div>
</td></tr>
${o.rows}
${button}
<tr><td style="padding:24px;"><div style="border-top:1px solid ${COLORS.border};padding-top:14px;font-size:12px;color:${COLORS.muted};line-height:1.5;">${escapeHtml(o.footer)}</div></td></tr>
</table>
</td></tr>
</table>
</body>
</html>`
}
