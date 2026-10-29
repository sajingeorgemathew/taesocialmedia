// Email HTML building blocks. Table layout with inline styles so the emails
// render consistently in Gmail, Outlook, Apple Mail and phone mail apps.
// Colours follow the app's design tokens (src/styles/tokens.css): TAE navy,
// ivory, a restrained gold accent, warm neutrals and the workflow status
// colours. Presentation only: nothing here decides what an email says.
import type { PostStatus } from './model.ts'

export const COLORS = {
  navy: '#122c4f',
  navy800: '#1b3d68',
  navy100: '#e4eaf3',
  cream: '#f7f5f0',
  ivory: '#d9cdb0',
  gold: '#c9a24e',
  text: '#17233a',
  muted: '#6b7587',
  subtle: '#98a0ae',
  border: '#e7e3da',
  divider: '#efece5',
  panel: '#faf9f6',
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

export const FONT = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"

/**
 * Public path of the TAE brand icon in the deployed app (public/favicon.png,
 * a 218×218 PNG; byte-identical to public/logo_final_T.png). Shown as an
 * ordinary image, never as favicon metadata.
 */
const BRAND_ICON_PATH = '/favicon.png'

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

/** The brand icon served by the deployed app at the configured (https) application URL. */
export function brandIconUrl(appUrl: string | null): string | null {
  if (!appUrl) return null
  try {
    return new URL(BRAND_ICON_PATH, appUrl).toString()
  } catch {
    return null
  }
}

export function badge(label: string, colors: { fg: string; bg: string }): string {
  return `<span style="display:inline-block;padding:2px 9px;border-radius:999px;background:${colors.bg};color:${colors.fg};font-size:12px;font-weight:600;line-height:18px;white-space:nowrap;mso-line-height-rule:exactly;">${escapeHtml(label)}</span>`
}

export function sectionHeading(title: string, count: number, description: string, tone: 'normal' | 'danger' = 'normal'): string {
  const color = tone === 'danger' ? COLORS.danger : COLORS.navy
  const pill = tone === 'danger' && count > 0 ? { fg: COLORS.danger, bg: COLORS.dangerBg } : { fg: COLORS.muted, bg: '#f1eee7' }
  return `<tr><td class="px" style="padding:32px 32px 10px;">
  <h2 style="margin:0;font-family:${FONT};font-size:15px;font-weight:700;line-height:22px;color:${color};">${escapeHtml(title)}&nbsp; <span style="display:inline-block;padding:0 8px;border-radius:999px;background:${pill.bg};color:${pill.fg};font-size:12px;font-weight:700;line-height:20px;vertical-align:1px;">${count}</span></h2>
  <p style="margin:2px 0 0;font-size:13px;line-height:19px;color:${COLORS.muted};">${escapeHtml(description)}</p>
</td></tr>`
}

export function emptyRow(message: string): string {
  return `<tr><td class="px" style="padding:2px 32px 0;"><div style="padding:12px 16px;border:1px dashed #dcd6ca;border-radius:10px;background:${COLORS.panel};color:${COLORS.muted};font-size:13px;line-height:19px;">${escapeHtml(message)}</div></td></tr>`
}

export function noteRow(message: string): string {
  return `<tr><td class="px" style="padding:10px 32px 0;font-size:12px;line-height:18px;color:${COLORS.muted};">${escapeHtml(message)}</td></tr>`
}

/** A label / value line inside a post card. Values must already be escaped HTML. */
export function detailRow(label: string, valueHtml: string): string {
  return `<tr>
  <td class="dl" width="104" valign="top" style="padding:3px 12px 3px 0;font-size:12px;line-height:19px;color:${COLORS.muted};white-space:nowrap;">${escapeHtml(label)}</td>
  <td valign="top" style="padding:3px 0;font-size:13px;line-height:19px;color:${COLORS.text};">${valueHtml}</td>
</tr>`
}

interface LayoutOptions {
  preheader: string
  /** Small uppercase label above the heading, e.g. "Daily digest". */
  eyebrow?: string
  heading: string
  subheading: string
  /** Rows (<tr>) for the main card. */
  rows: string
  appUrl: string | null
  banner?: string
  footer: string
}

function brandIcon(appUrl: string | null): string {
  const icon = brandIconUrl(appUrl)
  if (icon) {
    return `<img src="${escapeHtml(icon)}" width="36" height="36" alt="TAE logo" style="display:block;width:36px;height:36px;border:0;border-radius:8px;outline:none;text-decoration:none;">`
  }
  // No application link configured: a text mark in the logo's colours.
  return `<div style="width:36px;height:36px;border-radius:8px;background:${COLORS.navy800};color:${COLORS.ivory};font-size:20px;font-weight:800;line-height:36px;text-align:center;">T</div>`
}

function header(appUrl: string | null): string {
  const link = appUrl
    ? `<td class="hdr-link" align="right" valign="middle" style="padding-left:16px;white-space:nowrap;">
      <a href="${escapeHtml(appUrl)}" style="font-family:${FONT};font-size:13px;font-weight:600;line-height:18px;color:${COLORS.navy800};text-decoration:none;">Open Social Media Manager&nbsp;&rarr;</a>
    </td>`
    : ''
  return `<tr><td class="px" style="padding:18px 32px;border-bottom:1px solid ${COLORS.divider};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td class="hdr-brand" valign="middle">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td valign="middle" width="36">${brandIcon(appUrl)}</td>
        <td valign="middle" style="padding-left:12px;">
          <div style="font-size:15px;font-weight:700;line-height:20px;color:${COLORS.navy};">TAE Social Media Manager</div>
          <div style="font-size:12px;line-height:16px;color:${COLORS.muted};">Toronto Academy of Education</div>
        </td>
      </tr></table>
    </td>
    ${link}
  </tr></table>
</td></tr>`
}

function actionButton(appUrl: string): string {
  const href = escapeHtml(appUrl)
  return `<tr><td class="px" style="padding:36px 32px 0;" align="left">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
    <td bgcolor="${COLORS.navy}" style="border-radius:8px;background:${COLORS.navy};mso-padding-alt:14px 26px;">
      <a href="${href}" style="display:inline-block;padding:14px 26px;border-radius:8px;background:${COLORS.navy};color:#ffffff;font-family:${FONT};font-size:15px;font-weight:600;line-height:20px;text-decoration:none;mso-padding-alt:0;">Open Social Media Manager&nbsp;&rarr;</a>
    </td>
  </tr></table>
  <p style="margin:12px 0 0;font-size:12px;line-height:18px;color:${COLORS.muted};">Sign-in required. Links are never shared outside the TAE team.</p>
</td></tr>`
}

export function renderLayout(o: LayoutOptions): string {
  const banner = o.banner
    ? `<tr><td class="px" style="padding:24px 32px 0;"><div role="note" style="padding:12px 16px;border-radius:10px;background:#fbf7ec;border:1px solid #efdfb8;color:#5f4a1c;font-size:13px;font-weight:600;line-height:19px;">${escapeHtml(o.banner)}</div></td></tr>`
    : ''
  const eyebrow = o.eyebrow
    ? `<p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;line-height:16px;color:${COLORS.navy800};"><span style="display:inline-block;width:14px;height:2px;margin-right:8px;background:${COLORS.gold};vertical-align:middle;"></span>${escapeHtml(o.eyebrow)}</p>`
    : ''
  return `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no, date=no, address=no, email=no">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(o.heading)}</title>
<!--[if mso]><style>body, table, td, p, a, h1, h2, div, span { font-family: 'Segoe UI', Arial, sans-serif !important; }</style><![endif]-->
<style>
  a { color: ${COLORS.navy800}; }
  @media (max-width: 600px) {
    .shell { padding: 0 !important; }
    .card { border-radius: 0 !important; border-left: 0 !important; border-right: 0 !important; }
    .px { padding-left: 20px !important; padding-right: 20px !important; }
    .h1 { font-size: 22px !important; line-height: 28px !important; }
    .hdr-brand, .hdr-link { display: block !important; width: 100% !important; }
    .hdr-link { text-align: left !important; padding: 12px 0 0 !important; }
    .tile { padding: 3px !important; }
    .tile-n { font-size: 22px !important; line-height: 28px !important; }
    .dl { width: 88px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;width:100%;background:${COLORS.cream};font-family:${FONT};color:${COLORS.text};-webkit-font-smoothing:antialiased;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${escapeHtml(o.preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLORS.cream}" style="background:${COLORS.cream};">
<tr><td class="shell" align="center" style="padding:32px 16px;">
<!--[if mso]><table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:640px;">
<tr><td>
<table class="card" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="background:#ffffff;border:1px solid ${COLORS.border};border-radius:14px;border-collapse:separate;overflow:hidden;">
<tr><td style="height:4px;line-height:4px;font-size:0;background:${COLORS.navy};mso-line-height-rule:exactly;" bgcolor="${COLORS.navy}">&nbsp;</td></tr>
${header(o.appUrl)}
${banner}
<tr><td class="px" style="padding:32px 32px 0;">
  ${eyebrow}
  <h1 class="h1" style="margin:0;font-family:${FONT};font-size:24px;font-weight:700;letter-spacing:-0.01em;line-height:30px;color:${COLORS.navy};">${escapeHtml(o.heading)}</h1>
  <p style="margin:8px 0 0;font-size:14px;line-height:21px;color:${COLORS.muted};">${escapeHtml(o.subheading)}</p>
</td></tr>
${o.rows}
${o.appUrl ? actionButton(o.appUrl) : ''}
<tr><td style="padding:36px 0 0;font-size:0;line-height:0;">&nbsp;</td></tr>
</table>
</td></tr>
<tr><td class="px" align="center" style="padding:28px 32px 8px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td style="width:32px;height:2px;line-height:2px;font-size:0;background:${COLORS.gold};" bgcolor="${COLORS.gold}">&nbsp;</td></tr></table>
  <p style="margin:14px 0 0;font-size:13px;font-weight:700;line-height:18px;color:${COLORS.navy};">Toronto Academy of Education</p>
  <p style="margin:2px 0 0;font-size:12px;line-height:18px;color:${COLORS.muted};">TAE Social Media Manager &middot; Operational notification</p>
  <p style="margin:12px auto 0;max-width:460px;font-size:12px;line-height:18px;color:${COLORS.subtle};">${escapeHtml(o.footer)}</p>
</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`
}
