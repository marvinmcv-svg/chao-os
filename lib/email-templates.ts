/**
 * CHAO OS — Shared Email HTML Layout
 * Mobile-responsive inline CSS, CHAO Arquitectura branding
 */

export function emailLayout(content: string, title: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f5f5f5;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background-color: #1a1a2e; padding: 32px 40px; text-align: center;">
              <h1 style="margin: 0; font-size: 24px; font-weight: 700; color: #ffffff; letter-spacing: 2px;">
                CHAO ARQUITECTURA
              </h1>
              <p style="margin: 8px 0 0 0; font-size: 13px; color: #a0a0b0; letter-spacing: 1px;">
                CHAO OS — Sistema de Gestión
              </p>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              ${content}
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding: 0 40px;">
              <hr style="border: none; border-top: 1px solid #e8e8e8; margin: 0;" />
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #fafafa; padding: 24px 40px; text-align: center;">
              <p style="margin: 0 0 8px 0; font-size: 13px; color: #666666;">
                CHAO Arquitectura S.R.L. — Santa Cruz de la Sierra, Bolivia
              </p>
              <p style="margin: 0; font-size: 12px; color: #999999;">
                Este correo fue enviado automáticamente. No responda a este mensaje.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}
