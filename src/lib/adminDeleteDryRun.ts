export const ADMIN_DELETE_DRY_RUN_COUNT_KEYS = [
  'supplier_year_end_events',
  'supplier_year_end_invoices',
  'profiles',
  'withdrawal_assessment_facts',
  'withdrawal_assessment_revisions',
  'fixed_asset_depreciation_runs',
  'fixed_asset_events',
  'fixed_asset_acquisition_idempotency',
  'fixed_assets',
  'fixed_asset_acquisition_groups',
  'ne_sales_classifications',
  'customer_invoice_bookings',
  'customer_invoices',
  'tax_account_movements',
  'tax_account_events',
  'standard_booking_idempotency',
  'vat_v2_booking_idempotency',
  'vat_audit_snapshots',
  'vat_periods',
  'company_payment_account_roles',
  'transactions',
  'journal_entries',
  'favorites',
  'import_batches',
  'sie_import_inputs',
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
  supplier_year_end_events: 'leverantörsskuldshändelser',
  supplier_year_end_invoices: 'bokslutsförda leverantörsfakturor',
  profiles: 'profil',
  withdrawal_assessment_facts: 'uttagsuppgifter',
  withdrawal_assessment_revisions: 'uttagsavstämningar',
  fixed_asset_depreciation_runs: 'inventarieavskrivningar',
  fixed_asset_events: 'inventariehändelser',
  fixed_asset_acquisition_idempotency: 'inventarie-idempotensposter',
  fixed_assets: 'inventarier',
  fixed_asset_acquisition_groups: 'inventarieanskaffningsgrupper',
  ne_sales_classifications: 'NE-klassificeringar',
  customer_invoice_bookings: 'kundfakturabokningar',
  customer_invoices: 'kundfakturor',
  tax_account_movements: 'skattekontorörelser',
  tax_account_events: 'momsavräkningshändelser',
  standard_booking_idempotency: 'bokningskvitton',
  vat_v2_booking_idempotency: 'VAT V2-idempotensposter',
  vat_audit_snapshots: 'moms-auditsnapshots',
  vat_periods: 'momsperioder',
  company_payment_account_roles: 'betalningskontoinställningar',
  transactions: 'transaktioner',
  journal_entries: 'journalposter',
  favorites: 'favoriter',
  import_batches: 'SIE-importer',
  sie_import_inputs: 'tillfälliga SIE-importkvitton',
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
