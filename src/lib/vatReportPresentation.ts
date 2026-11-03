import type { VatReportAggregation } from './vatReportAggregation'
import type { VatReturnField } from './vatDomain'
import type { VatReportServiceError } from './vatReportService'

export interface VatReportDisplayRow {
  field: VatReturnField
  label: string
  description?: string
  amount: number
}

export interface VatReportPresentation {
  historicalReviewRequired: boolean
  closingReconciliationRequired: boolean
  fields: Record<VatReturnField, number>
  domesticSalesBase: number
  domesticSalesBase25: number
  domesticSalesBase12: number
  domesticSalesBase6: number
  ordinaryOutputVat25: number
  ordinaryOutputVat12: number
  ordinaryOutputVat6: number
  euServicePurchases: number
  euServiceOutputVat25: number
  deductibleInputVat: number
  netVat: number
  totalOutputVat: number
  domesticSalesRows: VatReportDisplayRow[]
  ordinaryOutputRows: VatReportDisplayRow[]
  euPurchaseRows: VatReportDisplayRow[]
  inputRows: VatReportDisplayRow[]
  netRows: VatReportDisplayRow[]
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100
}

export function buildVatReportPresentation(
  report: VatReportAggregation
): VatReportPresentation {
  const fields = report.fields
  const totalOutputVat = roundCurrency(
    fields['10'] +
      fields['11'] +
      fields['12'] +
      fields['30'] +
      fields['31'] +
      fields['32'] +
      fields['60'] +
      fields['61'] +
      fields['62']
  )

  return {
    historicalReviewRequired: report.historicalReviewRequired === true,
    closingReconciliationRequired: report.closingReconciliationRequired === true,
    fields,
    domesticSalesBase: fields['05'],
    domesticSalesBase25: report.legacy.domesticSalesBase25,
    domesticSalesBase12: report.legacy.domesticSalesBase12,
    domesticSalesBase6: report.legacy.domesticSalesBase6,
    ordinaryOutputVat25: fields['10'],
    ordinaryOutputVat12: fields['11'],
    ordinaryOutputVat6: fields['12'],
    euServicePurchases: fields['21'],
    euServiceOutputVat25: fields['30'],
    deductibleInputVat: fields['48'],
    netVat: fields['49'],
    totalOutputVat,
    domesticSalesRows: [
      {
        field: '05',
        label: 'Momspliktig försäljning exkl. moms',
        description: 'Försäljningsunderlag för vanlig momspliktig försäljning i Sverige',
        amount: fields['05'],
      },
    ],
    ordinaryOutputRows: [
      { field: '10', label: 'Utgående moms 25 %', amount: fields['10'] },
      { field: '11', label: 'Utgående moms 12 %', amount: fields['11'] },
      { field: '12', label: 'Utgående moms 6 %', amount: fields['12'] },
    ],
    euPurchaseRows: [
      {
        field: '21',
        label: 'Inköp av tjänster från ett annat EU-land',
        amount: fields['21'],
      },
      {
        field: '30',
        label: 'Utgående moms 25 % på inköp i rutorna 20–24',
        amount: fields['30'],
      },
    ],
    inputRows: [
      { field: '48', label: 'Ingående moms att dra av', amount: fields['48'] },
    ],
    netRows: [
      {
        field: '49',
        label: 'Moms att betala eller få tillbaka',
        amount: fields['49'],
      },
    ],
  }
}

export function vatReportBlockedMessage(errors: VatReportServiceError[]) {
  const fallback = 'Momsrapporten kan inte beräknas säkert eftersom underlaget inte kan verifieras. Granska periodens verifikationer och momsunderlag i Bokföring.'
  const reasonFor = (code: string) => {
    switch (code) {
      case 'customer_invoice_voucher_inconsistent':
        return 'En kundfakturas verifikation är ofullständig eller motsägelsefull. Granska fakturans verifikation och momsunderlag i Fakturor/Bokföring.'
      case 'customer_invoice_vat_unsupported':
        return 'En kundfakturas momsunderlag kan inte hanteras säkert i rapporten. Granska fakturans momsunderlag och verifikation i Fakturor/Bokföring.'
      case 'vat_v2_snapshot_missing':
        return 'Momsunderlag saknas för ett inköp med omvänd moms. Granska inköpets verifikation och momsunderlag i Bokföring.'
      case 'vat_v2_snapshot_duplicate':
        return 'Ett inköp med omvänd moms har flera momsunderlag kopplade till samma verifikation. Granska inköpets momsunderlag och verifikation i Bokföring.'
      case 'vat_v2_snapshot_unexpected':
        return 'Ett momsunderlag har en oväntad koppling till bokföringen. Granska underlaget och den berörda verifikationen i Bokföring.'
      case 'vat_v2_snapshot_malformed':
        return 'Ett inköps momsunderlag är ofullständigt eller felaktigt utformat. Granska inköpets momsunderlag och verifikation i Bokföring.'
      case 'vat_v2_snapshot_unsupported':
        return 'Ett inköps momsunderlag har ett format eller en momsbehandling som rapporten inte stöder. Granska inköpets momsunderlag och verifikation i Bokföring.'
      case 'vat_v2_snapshot_inconsistent':
        return 'Momsunderlaget för ett inköp med omvänd moms stämmer inte med verifikationen. Granska inköpets momsunderlag och verifikation i Bokföring.'
      case 'legacy_reverse_charge_ambiguous':
        return 'Äldre eller importerad bokföring innehåller uppgifter om omvänd moms som inte kan tolkas säkert. Granska verifikationen och momsunderlaget i Bokföring.'
      case 'fixed_asset_voucher_inconsistent':
        return 'En inventaries verifikation är ofullständig eller motsägelsefull. Granska inventarien och dess verifikation i Inventarier/Bokföring.'
      case 'supplier_invoice_voucher_inconsistent':
        return 'En leverantörsskulds verifikation är ofullständig eller motsägelsefull. Granska skulden och dess verifikation i Bokslutsskulder/Bokföring.'
      default:
        return fallback
    }
  }

  // Keep every distinct reason, without exposing raw server messages or details.
  const messages = new Set<string>()
  for (const error of errors) {
    if (error.code === 'invalid_loaded_scope') {
      messages.add('Momsrapporten kan inte beräknas säkert eftersom laddad data inte matchar inloggat konto.')
    } else if (error.code === 'query_failed') {
      messages.add('Momsrapporten kunde inte hämtas just nu. Inga belopp visas förrän rapporten kan beräknas säkert.')
    } else if (error.code === 'aggregation_blocked' && error.aggregationErrors?.length) {
      for (const reason of error.aggregationErrors) messages.add(reasonFor(reason.code))
    } else {
      messages.add(fallback)
    }
  }
  if (messages.size === 0) return fallback
  const reasons = [...messages]
  return reasons.length === 1 ? reasons[0] : `Momsrapporten har flera blockeringsorsaker. ${reasons.join(' ')}`
}
