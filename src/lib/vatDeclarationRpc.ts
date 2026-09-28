export function buildDeclareVatPeriodRpcArgs(
  periodId: string,
  skvSubmittedOn: string
) {
  return {
    p_vat_period_id: periodId,
    p_skv_submitted_on: skvSubmittedOn,
  }
}
