import type { MomsBreakdown } from './accountingService.ts'
import {
  getVatReportForPeriodFromDb,
  type VatReportServiceResult,
  type VatReportSupabaseClient,
} from './vatReportService.ts'
import { buildVatReportPresentation, vatReportBlockedMessage } from './vatReportPresentation.ts'

const DASHBOARD_VAT_BLOCKED_MESSAGE =
  'Momsöversikten kan inte beräknas säkert. Kontrollera momsrapporten innan säkert uttag används.'

export function dashboardVatBreakdownFromReportResult(
  result: VatReportServiceResult
): MomsBreakdown {
  if (result.status === 'blocked') {
    return {
      utgaendeMoms: 0,
      ingaendeMoms: 0,
      momsNetto: 0,
      manualReviewRequired: true,
      manualReviewMessage:
        vatReportBlockedMessage(result.errors) || DASHBOARD_VAT_BLOCKED_MESSAGE,
    }
  }

  const presentation = buildVatReportPresentation(result.report)

  return {
    utgaendeMoms: presentation.totalOutputVat,
    ingaendeMoms: presentation.deductibleInputVat,
    momsNetto: presentation.netVat,
    manualReviewRequired: false,
    manualReviewMessage: null,
    utgaendeMoms25: presentation.ordinaryOutputVat25,
    utgaendeMoms12: presentation.ordinaryOutputVat12,
    utgaendeMoms6: presentation.ordinaryOutputVat6,
    momspliktigForsaljning25: presentation.domesticSalesBase25,
    momspliktigForsaljning12: presentation.domesticSalesBase12,
    momspliktigForsaljning6: presentation.domesticSalesBase6,
    momspliktigForsaljning: presentation.domesticSalesBase,
  }
}

export async function getDashboardVatBreakdown(
  startDate: string,
  endDate: string
): Promise<MomsBreakdown> {
  try {
    const accountingService = await import('./accountingService.ts')
    const supabaseModule = await import('./supabaseClient.ts') as unknown as {
      supabase: VatReportSupabaseClient
    }
    const userId = await accountingService.getUserId()
    const result = await getVatReportForPeriodFromDb(
      supabaseModule.supabase,
      userId,
      startDate,
      endDate
    )

    return dashboardVatBreakdownFromReportResult(result)
  } catch (err) {
    return {
      utgaendeMoms: 0,
      ingaendeMoms: 0,
      momsNetto: 0,
      manualReviewRequired: true,
      manualReviewMessage:
        err instanceof Error
          ? `${DASHBOARD_VAT_BLOCKED_MESSAGE} (${err.message})`
          : DASHBOARD_VAT_BLOCKED_MESSAGE,
    }
  }
}
