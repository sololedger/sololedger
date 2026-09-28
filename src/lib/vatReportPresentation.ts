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
  if (errors.some(error => error.code === 'invalid_loaded_scope')) {
    return 'Momsrapporten kan inte beräknas säkert eftersom laddad data inte matchar inloggat konto.'
  }

  if (errors.some(error => error.code === 'query_failed')) {
    return 'Momsrapporten kunde inte hämtas just nu. Inga belopp visas förrän rapporten kan beräknas säkert.'
  }

  return 'Momsrapporten kan inte beräknas säkert eftersom ett inköp med omvänd moms saknar kontrollerbart underlag.'
}
