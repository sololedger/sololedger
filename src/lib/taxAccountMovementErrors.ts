export type TaxAccountMovementSubmissionFailureKind =
  | 'authoritative_rejection'
  | 'indeterminate'

export class TaxAccountMovementSubmissionError extends Error {
  readonly kind: TaxAccountMovementSubmissionFailureKind
  readonly serverMessage: string | null

  constructor(
    kind: TaxAccountMovementSubmissionFailureKind,
    serverMessage: string | null = null
  ) {
    super('Tax account movement submission failed')
    this.name = 'TaxAccountMovementSubmissionError'
    this.kind = kind
    this.serverMessage = serverMessage
  }
}

function isStructuredPostgrestError(
  error: unknown
): error is { code: string; message: string } {
  if (!error || typeof error !== 'object') return false
  const candidate = error as { code?: unknown; message?: unknown }
  return typeof candidate.code === 'string' && typeof candidate.message === 'string'
}

export function classifyTaxAccountMovementRpcError(
  error: unknown
): TaxAccountMovementSubmissionFailureKind {
  return isStructuredPostgrestError(error)
    ? 'authoritative_rejection'
    : 'indeterminate'
}

export function createTaxAccountMovementSubmissionError(error: unknown) {
  return new TaxAccountMovementSubmissionError(
    classifyTaxAccountMovementRpcError(error),
    isStructuredPostgrestError(error) ? error.message : null
  )
}

export function taxAccountMovementSubmissionFailureKind(
  error: unknown
): TaxAccountMovementSubmissionFailureKind {
  if (error instanceof TaxAccountMovementSubmissionError) return error.kind
  return 'indeterminate'
}

export function taxAccountMovementSubmissionErrorMessage(
  kindOrError: TaxAccountMovementSubmissionFailureKind | unknown
) {
  const kind = taxAccountMovementSubmissionFailureKind(kindOrError)
  const serverMessage = kindOrError instanceof TaxAccountMovementSubmissionError
    ? kindOrError.serverMessage
    : null

  if (kind === 'authoritative_rejection') {
    if (
      serverMessage?.includes('Betalningskonto för') ||
      serverMessage?.includes('konfigurerade betalningskontot') ||
      serverMessage?.includes('betalningskontot finns inte')
    ) {
      return 'Betalningskontot för den valda pengaflytten behöver kontrolleras i inställningarna innan överföringen kan registreras.'
    }

    return 'Överföringen kunde inte registreras. Kontrollera uppgifterna och försök igen.'
  }

  return 'SoloLedger kunde inte bekräfta om överföringen registrerades. Försök igen med samma uppgifter; då används samma försök så dubbelregistrering undviks.'
}
