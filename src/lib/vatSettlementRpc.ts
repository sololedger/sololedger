export const RECORD_VAT_SETTLEMENT_RPC_NAME = 'record_vat_settlement_atomic'

export const TAX_ACCOUNT_EVENT_SELECT_COLUMNS =
  'id, vat_period_id, transaction_id, event_kind, event_date, amount, created_at'

export const TAX_ACCOUNT_EVENT_USER_FILTER_COLUMN = 'user_id'

export const TAX_ACCOUNT_EVENT_PERIOD_FILTER_COLUMN = 'vat_period_id'

export function buildRecordVatSettlementRpcArgs(input: {
  periodId: string
  eventDate: string
  amount: number
  idempotencyKey: string
}) {
  return {
    p_vat_period_id: input.periodId,
    p_event_date: input.eventDate,
    p_amount: input.amount,
    p_idempotency_key: input.idempotencyKey,
  }
}

