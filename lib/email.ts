/**
 * CHAO OS — Email Notification System via Resend
 * Fire-and-forget email sending; errors are logged and swallowed.
 */

import { Resend } from 'resend'
import { emailLayout } from '@/lib/email-templates'
import { formatCurrency, formatDate } from '@/lib/utils'

const FROM_EMAIL = process.env.EMAIL_FROM ?? 'CHAO OS <noreply@chaoarquitectura.bo>'
const PORTAL_URL = process.env.CLIENT_PORTAL_URL ?? 'http://localhost:3000'

// Resend client — null if API key not configured
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function sendEmail(opts: {
  to: string | string[]
  subject: string
  html: string
}): Promise<void> {
  if (!resend) {
    console.warn('[email] RESEND_API_KEY not configured — skipping email:', opts.subject)
    return
  }

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: Array.isArray(opts.to) ? opts.to : [opts.to],
      subject: opts.subject,
      html: opts.html,
    })

    if (error) {
      console.error('[email] Resend error:', error)
      return
    }

    console.log('[email] Sent:', data?.id, opts.subject)
  } catch (err) {
    console.error('[email] Unexpected error sending email:', err)
  }
}

// ---------------------------------------------------------------------------
// Invoice emails
// ---------------------------------------------------------------------------

export interface InvoiceEmailData {
  number: string
  amountUSD: number
  clientName: string
  clientEmail: string
  dueDate: Date | string
  projectName: string
}

export async function sendInvoiceEmail(invoice: InvoiceEmailData): Promise<void> {
  const html = emailLayout(
    `
    <h2 style="margin: 0 0 24px 0; font-size: 20px; font-weight: 600; color: #1a1a2e;">
      Factura pendiente de pago
    </h2>
    <p style="margin: 0 0 20px 0; font-size: 15px; color: #444444; line-height: 1.6;">
      Estimado/a <strong>${invoice.clientName}</strong>,
    </p>
    <p style="margin: 0 0 20px 0; font-size: 15px; color: #444444; line-height: 1.6;">
      Se ha generado una nueva factura a su nombre. El detalle es el siguiente:
    </p>

    <table width="100%" cellspacing="0" cellpadding="0" style="margin: 24px 0; background-color: #f9f9f9; border-radius: 6px; overflow: hidden;">
      <tr>
        <td style="padding: 16px 20px; border-bottom: 1px solid #e8e8e8;">
          <strong style="color: #666666; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Número de factura</strong>
        </td>
        <td style="padding: 16px 20px; border-bottom: 1px solid #e8e8e8; text-align: right;">
          <span style="font-weight: 600; color: #1a1a2e;">${invoice.number}</span>
        </td>
      </tr>
      <tr>
        <td style="padding: 16px 20px; border-bottom: 1px solid #e8e8e8;">
          <strong style="color: #666666; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Monto total</strong>
        </td>
        <td style="padding: 16px 20px; border-bottom: 1px solid #e8e8e8; text-align: right;">
          <span style="font-weight: 700; color: #e63946; font-size: 18px;">${formatCurrency(invoice.amountUSD)}</span>
        </td>
      </tr>
      <tr>
        <td style="padding: 16px 20px; border-bottom: 1px solid #e8e8e8;">
          <strong style="color: #666666; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Fecha de vencimiento</strong>
        </td>
        <td style="padding: 16px 20px; border-bottom: 1px solid #e8e8e8; text-align: right;">
          <span style="color: #1a1a2e;">${formatDate(invoice.dueDate)}</span>
        </td>
      </tr>
      <tr>
        <td style="padding: 16px 20px;">
          <strong style="color: #666666; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Proyecto</strong>
        </td>
        <td style="padding: 16px 20px; text-align: right;">
          <span style="color: #1a1a2e;">${invoice.projectName}</span>
        </td>
      </tr>
    </table>

    <p style="margin: 0 0 24px 0; font-size: 14px; color: #666666; line-height: 1.6;">
      Si tiene acceso al portal de clientes, puede revisar y gestionar sus facturas directamente en línea.
    </p>

    <p style="margin: 0; text-align: center;">
      <a href="${PORTAL_URL}" style="display: inline-block; padding: 14px 32px; background-color: #1a1a2e; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 600;">
        Acceder al portal de clientes
      </a>
    </p>
    `,
    `Factura ${invoice.number} — Pendiente de pago`
  )

  await sendEmail({
    to: invoice.clientEmail,
    subject: `Factura ${invoice.number} — Pendiente de pago`,
    html,
  })
}

// ---------------------------------------------------------------------------
// Payment received email
// ---------------------------------------------------------------------------

export interface PaymentEmailData {
  number: string
  amountUSD: number
  clientName: string
  clientEmail: string
}

export async function sendPaymentReceivedEmail(invoice: PaymentEmailData): Promise<void> {
  const html = emailLayout(
    `
    <h2 style="margin: 0 0 24px 0; font-size: 20px; font-weight: 600; color: #1a1a2e;">
      Pago recibido con éxito
    </h2>
    <p style="margin: 0 0 20px 0; font-size: 15px; color: #444444; line-height: 1.6;">
      Estimado/a <strong>${invoice.clientName}</strong>,
    </p>
    <p style="margin: 0 0 20px 0; font-size: 15px; color: #444444; line-height: 1.6;">
      Hemos registrado el pago de su factura <strong>${invoice.number}</strong>. ¡Gracias por su confianza!
    </p>

    <table width="100%" cellspacing="0" cellpadding="0" style="margin: 24px 0; background-color: #f0f9f0; border-radius: 6px; overflow: hidden;">
      <tr>
        <td style="padding: 16px 20px; border-bottom: 1px solid #d4edda;">
          <strong style="color: #666666; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Número de factura</strong>
        </td>
        <td style="padding: 16px 20px; border-bottom: 1px solid #d4edda; text-align: right;">
          <span style="font-weight: 600; color: #1a1a2e;">${invoice.number}</span>
        </td>
      </tr>
      <tr>
        <td style="padding: 16px 20px;">
          <strong style="color: #666666; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Monto recibido</strong>
        </td>
        <td style="padding: 16px 20px; text-align: right;">
          <span style="font-weight: 700; color: #2a9d4e; font-size: 18px;">${formatCurrency(invoice.amountUSD)}</span>
        </td>
      </tr>
    </table>

    <p style="margin: 0 0 24px 0; font-size: 14px; color: #666666; line-height: 1.6;">
      Si tiene alguna pregunta sobre esta factura, no dude en contactarnos.
    </p>

    <p style="margin: 0; text-align: center;">
      <a href="${PORTAL_URL}" style="display: inline-block; padding: 14px 32px; background-color: #1a1a2e; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 600;">
        Ver mis facturas
      </a>
    </p>
    `,
    `Pago recibido — Factura ${invoice.number}`
  )

  await sendEmail({
    to: invoice.clientEmail,
    subject: `Pago recibido — Factura ${invoice.number}`,
    html,
  })
}

// ---------------------------------------------------------------------------
// Lead converted email (internal — to admin/principal)
// ---------------------------------------------------------------------------

export interface LeadConvertedEmailData {
  company: string
  projectName: string
  estimatedValueUSD: number
  assignedToEmail: string
  assignedToName: string
}

export async function sendLeadConvertedEmail(lead: LeadConvertedEmailData): Promise<void> {
  const html = emailLayout(
    `
    <h2 style="margin: 0 0 24px 0; font-size: 20px; font-weight: 600; color: #1a1a2e;">
      Lead convertido a proyecto
    </h2>
    <p style="margin: 0 0 20px 0; font-size: 15px; color: #444444; line-height: 1.6;">
      Un lead ha sido convertido exitosamente en un nuevo proyecto. Este es un aviso interno.
    </p>

    <table width="100%" cellspacing="0" cellpadding="0" style="margin: 24px 0; background-color: #f9f9f9; border-radius: 6px; overflow: hidden;">
      <tr>
        <td style="padding: 16px 20px; border-bottom: 1px solid #e8e8e8;">
          <strong style="color: #666666; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Empresa</strong>
        </td>
        <td style="padding: 16px 20px; border-bottom: 1px solid #e8e8e8; text-align: right;">
          <span style="font-weight: 600; color: #1a1a2e;">${lead.company}</span>
        </td>
      </tr>
      <tr>
        <td style="padding: 16px 20px; border-bottom: 1px solid #e8e8e8;">
          <strong style="color: #666666; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Nombre del proyecto</strong>
        </td>
        <td style="padding: 16px 20px; border-bottom: 1px solid #e8e8e8; text-align: right;">
          <span style="color: #1a1a2e;">${lead.projectName}</span>
        </td>
      </tr>
      <tr>
        <td style="padding: 16px 20px; border-bottom: 1px solid #e8e8e8;">
          <strong style="color: #666666; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Valor estimado</strong>
        </td>
        <td style="padding: 16px 20px; border-bottom: 1px solid #e8e8e8; text-align: right;">
          <span style="font-weight: 700; color: #2a9d4e; font-size: 18px;">${formatCurrency(lead.estimatedValueUSD)}</span>
        </td>
      </tr>
      <tr>
        <td style="padding: 16px 20px;">
          <strong style="color: #666666; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Project Manager asignado</strong>
        </td>
        <td style="padding: 16px 20px; text-align: right;">
          <span style="color: #1a1a2e;">${lead.assignedToName}</span>
        </td>
      </tr>
    </table>

    <p style="margin: 0; font-size: 14px; color: #666666; line-height: 1.6;">
      Comuníquese con <strong>${lead.assignedToName}</strong> (${lead.assignedToEmail}) para coordinar el inicio del proyecto.
    </p>
    `,
    `Lead convertido — ${lead.company}`
  )

  await sendEmail({
    to: lead.assignedToEmail,
    subject: `Lead convertido — ${lead.company}`,
    html,
  })
}

// ---------------------------------------------------------------------------
// Project phase update email (to client)
// ---------------------------------------------------------------------------

export interface ProjectUpdateEmailData {
  name: string
  clientName: string
  clientEmail: string
  newPhase: string
  newPhaseLabel: string
  message?: string
}

export async function sendProjectUpdateEmail(project: ProjectUpdateEmailData): Promise<void> {
  const phaseLabel = project.newPhaseLabel || project.newPhase

  const html = emailLayout(
    `
    <h2 style="margin: 0 0 24px 0; font-size: 20px; font-weight: 600; color: #1a1a2e;">
      Actualización de proyecto
    </h2>
    <p style="margin: 0 0 20px 0; font-size: 15px; color: #444444; line-height: 1.6;">
      Estimado/a <strong>${project.clientName}</strong>,
    </p>
    <p style="margin: 0 0 20px 0; font-size: 15px; color: #444444; line-height: 1.6;">
      Le informamos que su proyecto <strong>${project.name}</strong> ha avanzado a una nueva fase:
    </p>

    <table width="100%" cellspacing="0" cellpadding="0" style="margin: 24px 0; background-color: #1a1a2e; border-radius: 6px; overflow: hidden;">
      <tr>
        <td style="padding: 20px; text-align: center;">
          <span style="display: inline-block; padding: 8px 20px; background-color: rgba(255,255,255,0.1); color: #ffffff; border-radius: 4px; font-size: 12px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase;">
            Nueva fase
          </span>
          <p style="margin: 12px 0 0 0; font-size: 28px; font-weight: 700; color: #ffffff;">
            ${phaseLabel}
          </p>
        </td>
      </tr>
    </table>
    ${project.message ? `
    <p style="margin: 0 0 24px 0; font-size: 14px; color: #444444; line-height: 1.6; font-style: italic;">
      "${project.message}"
    </p>` : ''}
    <p style="margin: 0 0 24px 0; font-size: 14px; color: #666666; line-height: 1.6;">
      Si tiene alguna consulta, puede comunicarse con su Project Manager en cualquier momento.
    </p>

    <p style="margin: 0; text-align: center;">
      <a href="${PORTAL_URL}" style="display: inline-block; padding: 14px 32px; background-color: #1a1a2e; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 600;">
        Ver proyecto en el portal
      </a>
    </p>
    `,
    `Actualización de proyecto — ${project.name}`
  )

  await sendEmail({
    to: project.clientEmail,
    subject: `Actualización de proyecto — ${project.name}`,
    html,
  })
}
