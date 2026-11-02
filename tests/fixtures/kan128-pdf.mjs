// New synthetic fixtures only. Historical Staging files must never be repaired.
export function validAttachmentPdf(label = 'KAN128 synthetic original') {
  if (!/^[a-zA-Z0-9 -]+$/.test(label)) throw new Error('ASCII fixture label required')
  const stream = `BT /F1 18 Tf 35 100 Td (${label}) Tj ET`
  const bodies = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 420 180] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ]
  let document = '%PDF-1.4\n'
  const offsets = []
  for (const [index, body] of bodies.entries()) {
    offsets.push(Buffer.byteLength(document))
    document += `${index + 1} 0 obj\n${body}\nendobj\n`
  }
  const xref = Buffer.byteLength(document)
  return Buffer.from(document + 'xref\n0 6\n0000000000 65535 f \n'
    + offsets.map(offset => String(offset).padStart(10, '0') + ' 00000 n \n').join('')
    + `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`)
}

// Deliberately invalid, despite its PDF MIME type, header and suffix.
export const invalidAttachmentPdf = Buffer.from('%PDF-1.4\n% KAN128 invalid synthetic fixture\n%%EOF\n')
