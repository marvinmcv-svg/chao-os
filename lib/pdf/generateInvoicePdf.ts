// PDF generation using Puppeteer
// Note: For production, consider react-pdf if Puppeteer proves too heavy

export async function generateInvoicePdf(invoice: any): Promise<Buffer> {
  // Puppeteer is imported dynamically to avoid loading it on every request
  // In dev without Chrome installed, this will fail — that's expected
  // For Sprint 4 demo, the PDF endpoint returns a placeholder response
  try {
    const puppeteer = await import(/* webpackIgnore: true */ 'puppeteer')
    const browser = await puppeteer.default.launch({ headless: true })
    const page = await browser.newPage()

    const html = buildInvoiceHtml(invoice)
    await page.setContent(html, { waitUntil: 'networkidle0' })

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' },
    })

    await browser.close()
    return Buffer.from(pdfBuffer)
  } catch (error) {
    console.warn('Puppeteer not available, returning placeholder PDF:', error)
    // Return a minimal placeholder PDF buffer
    return Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] >>\nendobj\nxref\n0 4\n0000000000 65535 f\ntrailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n0\n%%EOF')
  }
}

function buildInvoiceHtml(invoice: any): string {
  if (!invoice || !invoice.number || !invoice.lineItems?.length) {
    throw new Error('Invalid invoice data for PDF generation: missing required fields (number, lineItems)')
  }
  const lineItems = invoice.lineItems
  const subtotal = lineItems.reduce((sum: number, item: any) => sum + item.totalUSD, 0)

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 12px; color: #111; padding: 20px; }
    .header { display: flex; justify-content: space-between; margin-bottom: 40px; }
    .firm-name { font-size: 24px; font-weight: bold; }
    .firm-info { text-align: right; font-size: 10px; color: #666; }
    .invoice-title { font-size: 28px; font-weight: bold; margin-bottom: 5px; }
    .invoice-meta { color: #666; font-size: 11px; }
    .section { margin-bottom: 30px; }
    .section-title { font-size: 10px; text-transform: uppercase; color: #888; letter-spacing: 1px; margin-bottom: 8px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th { background: #f5f5f5; padding: 8px 10px; text-align: left; font-size: 10px; text-transform: uppercase; color: #666; }
    td { padding: 8px 10px; border-bottom: 1px solid #eee; }
    td.right { text-align: right; }
    .totals { margin-top: 20px; }
    .totals tr td { border: none; padding: 4px 10px; }
    .totals .grand-total { font-size: 16px; font-weight: bold; }
    .footer { margin-top: 50px; font-size: 10px; color: #888; text-align: center; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="firm-name">CHAO Arquitectura S.R.L.</div>
      <div class="firm-info">
        Santa Cruz de la Sierra, Bolivia<br>
        www.chaoarquitectura.bo
      </div>
    </div>
    <div style="text-align: right;">
      <div class="invoice-title">FACTURA</div>
      <div class="invoice-meta">
        <div>${invoice.number}</div>
        <div>Fecha: ${new Date(invoice.issuedAt).toLocaleDateString('es-BO')}</div>
        <div>Vence: ${new Date(invoice.dueDate).toLocaleDateString('es-BO')}</div>
      </div>
    </div>
  </div>

  <div class="grid-2 section">
    <div>
      <div class="section-title">Facturar a</div>
      <div>${invoice.client.name}</div>
      <div>${invoice.client.company}</div>
      <div>${invoice.client.email || ''}</div>
    </div>
    <div>
      <div class="section-title">Proyecto</div>
      <div>${invoice.project?.name || '—'}</div>
      <div style="color: #888">${invoice.project?.code || ''}</div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Detalle</div>
    <table>
      <thead>
        <tr>
          <th>Descripción</th>
          <th class="right">Cantidad</th>
          <th class="right">Precio Unit.</th>
          <th class="right">Total</th>
        </tr>
      </thead>
      <tbody>
        ${lineItems.length > 0 ? lineItems.map((item: any) => `
        <tr>
          <td>${item.description}</td>
          <td class="right">${item.quantity}</td>
          <td class="right">$${item.unitPriceUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
          <td class="right">$${item.totalUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
        </tr>
        `).join('') : `
        <tr>
          <td colspan="4">${invoice.milestoneLabel || '—'}</td>
        </tr>
        `}
      </tbody>
    </table>

    <table class="totals">
      <tr>
        <td colspan="3" class="right"><strong>Subtotal:</strong></td>
        <td class="right">$${(lineItems.length > 0 ? subtotal : invoice.amountUSD).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
      </tr>
      ${invoice.currency === 'BOB' ? `
      <tr>
        <td colspan="3" class="right">Tipo de cambio:</td>
        <td class="right">${invoice.exchangeRate}</td>
      </tr>` : ''}
      <tr class="grand-total">
        <td colspan="3" class="right"><strong>TOTAL ${invoice.currency}:</strong></td>
        <td class="right"><strong>$${invoice.amountUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong></td>
      </tr>
    </table>
  </div>

  ${invoice.notes ? `
  <div class="section">
    <div class="section-title">Notas</div>
    <p>${invoice.notes}</p>
  </div>
  ` : ''}

  <div class="footer">
    CHAO Arquitectura S.R.L. · Santa Cruz de la Sierra, Bolivia<br>
    Esta factura es un documento provisional — verifique con su contador.
  </div>
</body>
</html>
  `
}