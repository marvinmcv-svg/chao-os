import { describe, it, expect } from 'vitest'
import { amountInWords, boliviaTimestamp, cufDigits, generateCuf, integerToWords, mod11, siatQrUrl, taxSplit } from '@/lib/siat'

describe('mod11 (SIN calculaDigitoMod11)', () => {
  it('weights 2..9 from the right and returns sum mod 11', () => {
    // 5·2 + 4·3 + 3·4 + 2·5 + 1·6 = 50 → 50 mod 11 = 6
    expect(mod11('12345')).toBe('6')
    // weights wrap after 9: nine 1s → 2+3+…+9+2 = 46 → 2
    expect(mod11('111111111')).toBe('2')
  })
  it('maps a remainder of 10 to "1"', () => {
    // 5·2 = 10 → 10 mod 11 = 10 → "1"
    expect(mod11('5')).toBe('1')
  })
  it('rejects non-digits', () => {
    expect(() => mod11('12a')).toThrow()
  })
})

describe('CUF', () => {
  const base = {
    nit: '1023456027',
    issuedAt: new Date('2026-11-09T14:05:06.789Z'),
    sucursal: 0,
    modalidad: 2,
    tipoEmision: 2,
    tipoFactura: 1,
    tipoDocumentoSector: 1,
    numeroFactura: 152,
    puntoVenta: 0,
    codigoControl: '',
  }

  it('uses Bolivian local time (UTC−4) with milliseconds', () => {
    expect(boliviaTimestamp(base.issuedAt)).toBe('20261109100506789')
  })

  it('concatenates the 53 fixed-width fields in SIN order', () => {
    const d = cufDigits(base)
    expect(d).toHaveLength(53)
    expect(d).toBe('0001023456027' + '20261109100506789' + '0000' + '2' + '2' + '1' + '01' + '0000000152' + '0000')
  })

  it('is base 16 of digits + check digit, then the CUFD control code', () => {
    const d = cufDigits(base)
    const expected = BigInt(d + mod11(d)).toString(16).toUpperCase()
    expect(generateCuf(base)).toBe(expected)
    expect(generateCuf({ ...base, codigoControl: 'A19E23EF34124CD' })).toBe(expected + 'A19E23EF34124CD')
    expect(expected).toMatch(/^[0-9A-F]+$/)
  })

  it('differs per invoice number and refuses out-of-range fields', () => {
    expect(generateCuf(base)).not.toBe(generateCuf({ ...base, numeroFactura: 153 }))
    expect(() => generateCuf({ ...base, nit: '12345678901234' })).toThrow(/NIT/)
    expect(() => generateCuf({ ...base, sucursal: 10000 })).toThrow(/sucursal/)
  })
})

describe('amounts in words', () => {
  it.each([
    [0, 'Cero 00/100 Bolivianos'],
    [1, 'Uno 00/100 Bolivianos'],
    [21, 'Veintiuno 00/100 Bolivianos'],
    [100, 'Cien 00/100 Bolivianos'],
    [101, 'Ciento uno 00/100 Bolivianos'],
    [1000, 'Mil 00/100 Bolivianos'],
    [21000, 'Veintiún mil 00/100 Bolivianos'],
    [101000, 'Ciento un mil 00/100 Bolivianos'],
    [1234.5, 'Mil doscientos treinta y cuatro 50/100 Bolivianos'],
    [1_000_000, 'Un millón 00/100 Bolivianos'],
    [2_021_121.75, 'Dos millones veintiún mil ciento veintiuno 75/100 Bolivianos'],
    [128_760.04, 'Ciento veintiocho mil setecientos sesenta 04/100 Bolivianos'],
  ])('%s → %s', (n, words) => {
    expect(amountInWords(n)).toBe(words)
  })
  it('handles cents that round up (0.995 → 1.00)', () => {
    expect(amountInWords(0.995)).toBe('Uno 00/100 Bolivianos')
  })
  it('supports another currency name', () => {
    expect(amountInWords(15, 'Dólares estadounidenses')).toBe('Quince 00/100 Dólares estadounidenses')
  })
  it('rejects negatives and fractions in integerToWords', () => {
    expect(() => integerToWords(-1)).toThrow()
    expect(() => integerToWords(1.5)).toThrow()
  })
})

describe('taxes and QR', () => {
  it('IVA is 13% of the price (included), IT 3%', () => {
    expect(taxSplit(1000)).toEqual({ base: 1000, iva: 130, net: 870, it: 30 })
    expect(taxSplit(696)).toEqual({ base: 696, iva: 90.48, net: 605.52, it: 20.88 })
  })
  it('QR points to the SIN pilot or production verification page', () => {
    expect(siatQrUrl({ nit: '1023', cuf: 'ABC', numero: 7, ambiente: 2 })).toBe('https://pilotosiat.impuestos.gob.bo/consulta/QR?nit=1023&cuf=ABC&numero=7&t=2')
    expect(siatQrUrl({ nit: '1023', cuf: 'ABC', numero: 7, ambiente: 1 })).toMatch(/^https:\/\/siat\.impuestos\.gob\.bo\//)
  })
})
