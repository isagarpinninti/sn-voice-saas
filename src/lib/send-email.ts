/**
 * Send transactional emails via Resend (https://resend.com).
 * Set RESEND_API_KEY and optionally EMAIL_FROM in env.
 * If RESEND_API_KEY is absent the send gracefully returns an error string
 * so the chat pipeline can reply "email not configured" instead of crashing.
 */

const RESEND_API = 'https://api.resend.com/emails'

export interface SendEmailOptions {
  to: string
  subject: string
  /** Plain-text version of the body */
  bodyText: string
  /** Optional — auto-generated from bodyText if omitted */
  bodyHtml?: string
  fromName?: string
}

export interface SendEmailResult {
  success: boolean
  messageId?: string
  error?: string
}

function textToHtml(text: string, fromName: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  const paragraphs = escaped
    .split(/\n{2,}/)
    .map(p => `<p style="margin:0 0 16px 0;line-height:1.6">${p.replace(/\n/g, '<br>')}</p>`)
    .join('\n')

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px">
    <tr><td align="center">
      <table width="100%" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
        <!-- Header -->
        <tr>
          <td style="background:#10b981;padding:28px 32px">
            <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.3px">${fromName}</h1>
            <p style="margin:4px 0 0;color:rgba(255,255,255,0.8);font-size:13px">Service Desk</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:32px;color:#111827;font-size:15px">
            ${paragraphs}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:20px 32px;background:#f9fafb;border-top:1px solid #e5e7eb">
            <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.5">
              This email was sent by the ${fromName} Service Desk agent on your behalf.<br>
              If you did not request this, please contact your IT administrator.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

export async function sendEmail(opts: SendEmailOptions): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return { success: false, error: 'Email service is not configured (RESEND_API_KEY missing).' }
  }

  const fromName = opts.fromName || process.env.SAAS_NAME || 'ZeVox Service Desk'
  const fromAddr = process.env.EMAIL_FROM || 'noreply@zevox.com'
  const html     = opts.bodyHtml ?? textToHtml(opts.bodyText, fromName)

  try {
    const res = await fetch(RESEND_API, {
      method:  'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from:    `${fromName} <${fromAddr}>`,
        to:      [opts.to],
        subject: opts.subject,
        text:    opts.bodyText,
        html,
      }),
      signal: AbortSignal.timeout(10_000),
    })

    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText)
      return { success: false, error: `Email API error ${res.status}: ${err}` }
    }

    const data = await res.json().catch(() => ({}))
    return { success: true, messageId: data.id }
  } catch (e: any) {
    return { success: false, error: `Email send failed: ${e.message}` }
  }
}
