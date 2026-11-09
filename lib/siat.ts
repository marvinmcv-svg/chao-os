/**
 * Bolivian fiscal helpers (SIN — Sistema de Facturación en Línea / SIAT).
 *
 * Pure functions only: CUF generation, amounts in words, the QR
 * verification URL and IVA/IT splits. Submitting invoices to the SIN
 * (SOAP services with a delegated token, CUIS/CUFD and a digital
 * signature) is NOT implemented — see `isSiatConfigured()`.
 *
 * Reference: SIN "Especificaciones técnicas — Código Único de Facturación
 * (CUF)". The CUF is the 53-digit concatenation below, plus a módulo 11
 * check digit, converted to base 16, plus the CUFD control code. Verify
 * against the SIN pilot environment before going live.
 */

export const IVA_RATE = 0.13
export const IT_RATE = 0.03

/** SIN identity document types (código tipo documento identidad). */
export const DOC_TYPES = {
  CI: { code: 1, label: 'Cédula de identidad' },
  CEX: { code: 2, label: 'Cédula de identidad de extranjero' },
  PAS: { code: 3, label: 'Pasaporte' },
  OD: { code: 4, label: 'Otro documento de identidad' },
  NIT: { code: 5, label: 'NIT' },
} as const
export type DocType = keyof typeof DOC_TYPES

/** SIN annulment reasons (código motivo anulación). */
export const ANNUL_REASONS: Record<number, string> = {
  1: 'Factura mal emitida',
  2: 'Nota de crédito-débito mal emitida',
  3: 'Datos de emisión incorrectos',
  4: 'Factura o nota de crédito-débito devuelta',
}

export const DEFAULT_LEYENDA =
  'Ley N° 453: El proveedor de servicios debe habilitar medios e instrumentos para efectuar consultas y reclamaciones.'
export const LEYENDA_ILICITO = 'ESTA FACTURA CONTRIBUYE AL DESARROLLO DEL PAÍS, EL USO ILÍCITO SERÁ SANCIONADO PENALMENTE DE ACUERDO A LEY'

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

// ─── CUF ─────────────────────────────────────────────────────────────────

/**
 * SIN's módulo 11 check digit (calculaDigitoMod11 with limMult 9, x10
 * false): weights 2..9 cycling from the rightmost digit; the digit is the
 * sum mod 11, with 10 → "1" (11 cannot occur).
 */
export function mod11(digits: string): string {
  if (!/^\d+$/.test(digits)) throw new Error('mod11: only digits allowed')
  let sum = 0
  let mult = 2
  for (let i = digits.length - 1; i >= 0; i--) {
    sum += mult * Number(digits[i])
    if (++mult > 9) mult = 2
  }
  const dig = sum % 11
  return dig === 10 ? '1' : String(dig)
}

/** Bolivia is UTC−4 all year (no DST). Returns yyyyMMddHHmmssSSS. */
export function boliviaTimestamp(d: Date): string {
  const t = new Date(d.getTime() - 4 * 3_600_000)
  const p = (n: number, w = 2) => String(n).padStart(w, '0')
  return `${t.getUTCFullYear()}${p(t.getUTCMonth() + 1)}${p(t.getUTCDate())}${p(t.getUTCHours())}${p(t.getUTCMinutes())}${p(t.getUTCSeconds())}${p(t.getUTCMilliseconds(), 3)}`
}

export interface CufInput {
  nit: string
  issuedAt: Date
  sucursal: number
  /** 1 = electrónica en línea, 2 = computarizada en línea */
  modalidad: number
  /** 1 = en línea, 2 = fuera de línea, 3 = masiva */
  tipoEmision: number
  /** 1 = factura con derecho a crédito fiscal */
  tipoFactura: number
  /** 1 = compra-venta */
  tipoDocumentoSector: number
  numeroFactura: number
  puntoVenta: number
  /** Control code that comes with the CUFD; '' when there is no CUFD */
  codigoControl: string
}

export function cufDigits(i: CufInput): string {
  const pad = (v: string | number, w: number, name: string) => {
    const s = String(v)
    if (!/^\d+$/.test(s) || s.length > w) throw new Error(`CUF: ${name} inválido`)
    return s.padStart(w, '0')
  }
  return (
    pad(i.nit, 13, 'NIT') +
    boliviaTimestamp(i.issuedAt) +
    pad(i.sucursal, 4, 'sucursal') +
    pad(i.modalidad, 1, 'modalidad') +
    pad(i.tipoEmision, 1, 'tipo de emisión') +
    pad(i.tipoFactura, 1, 'tipo de factura') +
    pad(i.tipoDocumentoSector, 2, 'documento sector') +
    pad(i.numeroFactura, 10, 'número de factura') +
    pad(i.puntoVenta, 4, 'punto de venta')
  )
}

export function generateCuf(i: CufInput): string {
  const digits = cufDigits(i)
  const withDv = digits + mod11(digits)
  return BigInt(withDv).toString(16).toUpperCase() + (i.codigoControl ?? '')
}

// ─── QR / verification ───────────────────────────────────────────────────

/** Public SIN verification URL encoded in the invoice QR (t=2: media página). */
export function siatQrUrl(args: { nit: string; cuf: string; numero: number; ambiente: number }) {
  const host = args.ambiente === 1 ? 'siat.impuestos.gob.bo' : 'pilotosiat.impuestos.gob.bo'
  const q = new URLSearchParams({ nit: args.nit, cuf: args.cuf, numero: String(args.numero), t: '2' })
  return `https://${host}/consulta/QR?${q.toString()}`
}

// ─── Taxes ───────────────────────────────────────────────────────────────

/** Bolivian prices include IVA: débito fiscal is 13% of the invoiced amount. */
export function taxSplit(totalBOB: number) {
  const base = round2(totalBOB)
  const iva = round2(base * IVA_RATE)
  return { base, iva, net: round2(base - iva), it: round2(base * IT_RATE) }
}

// ─── Amount in words ─────────────────────────────────────────────────────

const UNITS = ['', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve']
const TENS = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa']
const HUNDREDS = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos']

function under1000(n: number): string {
  if (n === 0) return ''
  if (n === 100) return 'cien'
  const h = Math.floor(n / 100)
  const r = n % 100
  let rest = ''
  if (r < 30) rest = UNITS[r]
  else rest = TENS[Math.floor(r / 10)] + (r % 10 ? ` y ${UNITS[r % 10]}` : '')
  return [HUNDREDS[h], rest].filter(Boolean).join(' ')
}

/** 'uno' → 'un' / 'veintiuno' → 'veintiún' before a scale word (mil, millones). */
const apocope = (s: string) => (s.endsWith('veintiuno') ? s.slice(0, -9) + 'veintiún' : s.replace(/uno$/, 'un'))

export function integerToWords(n: number): string {
  if (!Number.isInteger(n) || n < 0) throw new Error('integerToWords: entero no negativo')
  if (n === 0) return 'cero'
  const parts: string[] = []
  const billions = Math.floor(n / 1_000_000_000)
  const millions = Math.floor((n % 1_000_000_000) / 1_000_000)
  const thousands = Math.floor((n % 1_000_000) / 1000)
  const rest = n % 1000
  if (billions) parts.push(billions === 1 ? 'mil millones' : `${apocope(integerToWords(billions))} mil millones`)
  if (millions) parts.push(millions === 1 ? 'un millón' : `${apocope(integerToWords(millions))} millones`)
  if (thousands) parts.push(thousands === 1 ? 'mil' : `${apocope(under1000(thousands))} mil`)
  if (rest) parts.push(under1000(rest))
  return parts.join(' ')
}

/** "Son: Mil doscientos treinta y cuatro 50/100 Bolivianos" */
export function amountInWords(amount: number, currency = 'Bolivianos'): string {
  const cents = Math.round(round2(amount) * 100)
  const int = Math.floor(cents / 100)
  const dec = cents % 100
  const w = integerToWords(int)
  return `${w.charAt(0).toUpperCase()}${w.slice(1)} ${String(dec).padStart(2, '0')}/100 ${currency}`
}

// ─── SIAT connection ─────────────────────────────────────────────────────

/**
 * True only when the SIN web-service credentials are present. Even then,
 * transmission is not implemented yet (signed XML over SOAP), so issued
 * invoices stay "pending SIN validation" until that work is done.
 */
export function isSiatConfigured(): boolean {
  return !!(process.env.SIAT_TOKEN && process.env.SIAT_CUIS && process.env.SIAT_SYSTEM_CODE)
}
