export const ADMIN_DELETE_DRY_RUN_COUNT_KEYS = [
  'tax_account_movements',
  'tax_account_events',
  'vat_audit_snapshots',
  'vat_periods',
  'company_payment_account_roles',
  'transactions',
  'journal_entries',
  'favorites',
  'import_batches',
  'accounts',
  'closed_years',
  'ver_nr_sequences',
  'attachments',
] as const

export type AdminDeleteDryRunCountKey =
  (typeof ADMIN_DELETE_DRY_RUN_COUNT_KEYS)[number]

export type AdminDeleteDryRunCounts = Record<AdminDeleteDryRunCountKey, number>

export const ADMIN_DELETE_DRY_RUN_COUNT_LABELS: Record<
  AdminDeleteDryRunCountKey,
  string
> = {
  tax_account_movements: 'skattekontorörelser',
  tax_account_events: 'momsavräkningshändelser',
  vat_audit_snapshots: 'moms-auditsnapshots',
  vat_periods: 'momsperioder',
  company_payment_account_roles: 'betalningskontoinställningar',
  transactions: 'transaktioner',
  journal_entries: 'journalposter',
  favorites: 'favoriter',
  import_batches: 'SIE-importer',
  accounts: 'konton',
  closed_years: 'låsta år',
  ver_nr_sequences: 'verifikationsnummer',
  attachments: 'bilagor (storage)',
}

export function normalizeAdminDeleteDryRunCounts(
  counts: Partial<Record<AdminDeleteDryRunCountKey, unknown>> | null | undefined
): AdminDeleteDryRunCounts {
  return Object.fromEntries(
    ADMIN_DELETE_DRY_RUN_COUNT_KEYS.map(key => [
      key,
      typeof counts?.[key] === 'number' ? counts[key] : 0,
    ])
  ) as AdminDeleteDryRunCounts
}
