export const RECORD_TAX_ACCOUNT_MOVEMENT_RPC_NAME =
  'record_tax_account_movement_atomic'

export const TAX_ACCOUNT_MOVEMENT_SELECT_COLUMNS =
  'id, vat_period_id, transaction_id, movement_kind, movement_date, amount, payment_account_role, counter_account_number, created_at'

export const TAX_ACCOUNT_MOVEMENT_USER_FILTER_COLUMN = 'user_id'

export const TAX_ACCOUNT_MOVEMENT_PERIOD_FILTER_COLUMN = 'vat_period_id'

export function buildRecordTaxAccountMovementRpcArgs(input: {
  movementKind: string
  movementDate: string
  amount: number
  vatPeriodId: string | null
  idempotencyKey: string
}) {
  return {
    p_movement_kind: input.movementKind,
    p_movement_date: input.movementDate,
    p_amount: input.amount,
    p_vat_period_id: input.vatPeriodId,
    p_idempotency_key: input.idempotencyKey,
  }
}
