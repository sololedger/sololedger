export type VatSettlementSubmissionFailureKind =
  | 'authoritative_rejection'
  | 'indeterminate'

export class VatSettlementSubmissionError extends Error {
  readonly kind: VatSettlementSubmissionFailureKind

  constructor(kind: VatSettlementSubmissionFailureKind) {
    super('VAT settlement submission failed')
    this.name = 'VatSettlementSubmissionError'
    this.kind = kind
  }
}

function isStructuredPostgrestError(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const candidate = error as { code?: unknown; message?: unknown }
  return typeof candidate.code === 'string' && typeof candidate.message === 'string'
}

export function classifyVatSettlementRpcError(
  error: unknown
): VatSettlementSubmissionFailureKind {
  return isStructuredPostgrestError(error)
    ? 'authoritative_rejection'
    : 'indeterminate'
}

export function createVatSettlementSubmissionError(error: unknown) {
  return new VatSettlementSubmissionError(classifyVatSettlementRpcError(error))
}

export function vatSettlementSubmissionFailureKind(
  error: unknown
): VatSettlementSubmissionFailureKind {
  if (error instanceof VatSettlementSubmissionError) return error.kind
  return 'indeterminate'
}

export function vatSettlementSubmissionErrorMessage(
  kind: VatSettlementSubmissionFailureKind
) {
  if (kind === 'authoritative_rejection') {
    return 'Avräkningen kunde inte registreras. Uppdatera uppgifterna och försök igen.'
  }

  return 'SoloLedger kunde inte bekräfta om avräkningen registrerades. Försök igen med samma uppgifter; då används samma försök så dubbelregistrering undviks.'
}
