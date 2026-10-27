// Email HTML building blocks. Table layout with inline styles so the emails
// render consistently in Gmail, Outlook and phone mail apps. Colours follow
// the app's design tokens (src/styles/tokens.css): TAE navy, a restrained
// gold accent, warm neutrals and the workflow status colours.
import type { PostStatus } from './model.ts'

export const COLORS = {
  navy: '#122c4f',
  navy800: '#1b3d68',
  navy100: '#e4eaf3',
  cream: '#f7f5f0',
  gold: '#c9a24e',
  text: '#17233a',
  muted: '#6b7587',
  border: '#e7e3da',
  danger: '#b42318',
  dangerBg: '#fdeeec',
}

export const STATUS_COLORS: Record<PostStatus | 'Overdue', { fg: string; bg: string }> = {
  Planned: { fg: '#536179', bg: '#eef1f5' },
  'In Design': { fg: '#6045c9', bg: '#f1edfd' },
  'Ready for Review': { fg: '#b05a06', bg: '#fdf2e2' },
  Approved: { fg: '#0f766e', bg: '#e4f4f1' },
  Published: { fg: '#1f7a3c', bg: '#e8f5ec' },
  Overdue: { fg: COLORS.danger, bg: COLORS.dangerBg },
}

const FONT = "'Inter', 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"

/** Public path of the TAE logo in the deployed app (public/logo_final_T.png). */
const LOGO_PATH = '/logo_final_T.png'

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

/** The logo served by the deployed app at the configured (https) application URL. */
export function logoUrl(appUrl: string | null): string | null {
  if (!appUrl) return null
  try {
    return new URL(LOGO_PATH, appUrl).toString()
  } catch {
    return null
  }
}

export function badge(label: string, colors: { fg: string; bg: string }): string {
  return `<span style="display:inline-block;padding:3px 10px;border-radius:999px;background:${colors.bg};color:${colors.fg};font-size:12px;font-weight:600;line-height:16px;white-space:nowrap;">${escapeHtml(label)}</span>`
}

export function sectionHeading(title: string, count: number, description: string, tone: 'normal' | 'danger' = 'normal'): string {
  const color = tone === 'danger' ? COLORS.danger : COLORS.navy
  return `<tr><td class="px" style="padding:28px 32px 8px;">
  <div style="font-size:12px;font-weight:700;letter-spacing:0.07em;text-transform:uppercase;color:${color};">${escapeHtml(title)} <span style="display:inline-block;margin-left:4px;padding:1px 8px;border-radius:999px;background:${tone === 'danger' ? COLORS.dangerBg : '#f3f1ec'};color:${tone === 'danger' ? COLORS.danger : COLORS.muted};font-weight:700;letter-spacing:0;">${count}</span></div>
  <div style="font-size:13px;color:${COLORS.muted};padding-top:4px;">${escapeHtml(description)}</div>
</td></tr>`
}

export function emptyRow(message: string): string {
  return `<tr><td class="px" style="padding:4px 32px 0;"><div style="padding:12px 16px;border:1px dashed #d6d0c4;border-radius:8px;background:#fbfaf7;color:${COLORS.muted};font-size:13px;">${escapeHtml(message)}</div></td></tr>`
}

export function noteRow(message: string): string {
  return `<tr><td class="px" style="padding:8px 32px 0;font-size:12px;color:${COLORS.muted};">${escapeHtml(message)}</td></tr>`
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

function brandMark(appUrl: string | null): string {
  const logo = logoUrl(appUrl)
  if (logo) {
    return `<img src="${escapeHtml(logo)}" width="40" height="40" alt="TAE" style="display:block;width:40px;height:40px;border:0;border-radius:8px;outline:none;text-decoration:none;">`
  }
  // No application link configured: a text mark in the logo's colours.
  return `<div style="width:40px;height:40px;border-radius:8px;background:#1b3d68;color:#d9cdb0;font-size:22px;font-weight:800;line-height:40px;text-align:center;">T</div>`
}

export function renderLayout(o: LayoutOptions): string {
  const button = o.appUrl
    ? `<tr><td class="px" style="padding:32px 32px 4px;" align="left">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
    <td bgcolor="${COLORS.navy}" style="border-radius:8px;background:${COLORS.navy};">
      <a href="${escapeHtml(o.appUrl)}" style="display:inline-block;padding:13px 24px;border-radius:8px;background:${COLORS.navy};color:#ffffff;font-family:${FONT};font-weight:600;font-size:14px;line-height:18px;text-decoration:none;">Open TAE Social Media Manager &rarr;</a>
    </td>
  </tr></table>
  <div style="font-size:12px;color:${COLORS.muted};padding-top:10px;">Sign-in required. Links are never shared outside the TAE team.</div>
</td></tr>`
    : ''
  const banner = o.banner
    ? `<tr><td class="px" style="padding:20px 32px 0;"><div style="padding:12px 16px;border-radius:8px;background:#fbf7ec;border:1px solid #f0e3c2;color:#5f4a1c;font-size:13px;font-weight:600;">${escapeHtml(o.banner)}</div></td></tr>`
    : ''
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(o.heading)}</title>
<style>
  @media (max-width: 600px) {
    .px { padding-left: 20px !important; padding-right: 20px !important; }
    .shell { padding: 12px 8px !important; }
    .h1 { font-size: 20px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${COLORS.cream};font-family:${FONT};color:${COLORS.text};-webkit-font-smoothing:antialiased;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${escapeHtml(o.preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLORS.cream};">
<tr><td class="shell" align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:640px;">
<tr><td style="padding:0 4px 16px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="vertical-align:middle;">${brandMark(o.appUrl)}</td>
    <td style="padding-left:12px;vertical-align:middle;">
      <div style="color:${COLORS.navy};font-size:16px;font-weight:700;line-height:20px;">TAE Social Media Manager</div>
      <div style="color:${COLORS.muted};font-size:12px;line-height:16px;">Toronto Academy of Education</div>
    </td>
  </tr></table>
</td></tr>
<tr><td>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border:1px solid ${COLORS.border};border-radius:12px;overflow:hidden;">
<tr><td style="height:4px;line-height:4px;font-size:0;background:${COLORS.navy};border-bottom:2px solid ${COLORS.gold};">&nbsp;</td></tr>
${banner}
<tr><td class="px" style="padding:28px 32px 0;">
  <div class="h1" style="font-size:22px;font-weight:700;letter-spacing:-0.01em;line-height:28px;color:${COLORS.navy};">${escapeHtml(o.heading)}</div>
  <div style="font-size:14px;line-height:20px;color:${COLORS.muted};padding-top:6px;">${escapeHtml(o.subheading)}</div>
</td></tr>
${o.rows}
${button}
<tr><td style="padding:32px 0 0;font-size:0;line-height:0;">&nbsp;</td></tr>
</table>
</td></tr>
<tr><td style="padding:20px 8px 0;font-size:12px;color:${COLORS.muted};line-height:18px;" align="center">
  ${escapeHtml(o.footer)}
  <div style="padding-top:10px;color:#98a0ae;">TAE Social Media Manager &middot; Toronto Academy of Education</div>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`
}
