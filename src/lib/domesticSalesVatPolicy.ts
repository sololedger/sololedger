import type { DomesticSalesVatTreatment } from './vatDomain'

export type OrdinarySalesVatPolicy =
  | {
      status: 'taxable'
      vatRateLocked: false
      forcedVatRate: null
      amountLabel: 'Belopp inkl. moms'
      blocker: null
      notice: null
    }
  | {
      status: 'exempt'
      vatRateLocked: true
      forcedVatRate: 0
      amountLabel: 'Belopp'
      blocker: null
      notice: string
    }
  | {
      status: 'blocked'
      vatRateLocked: true
      forcedVatRate: 0
      amountLabel: 'Belopp'
      blocker: string
      notice: string
    }

export function getOrdinarySalesVatPolicy(
  treatment: DomesticSalesVatTreatment
): OrdinarySalesVatPolicy {
  if (treatment === 'taxable') {
    return {
      status: 'taxable',
      vatRateLocked: false,
      forcedVatRate: null,
      amountLabel: 'Belopp inkl. moms',
      blocker: null,
      notice: null,
    }
  }

  if (
    treatment === 'small_business_exempt' ||
    treatment === 'exempt_other'
  ) {
    return {
      status: 'exempt',
      vatRateLocked: true,
      forcedVatRate: 0,
      amountLabel: 'Belopp',
      blocker: null,
      notice:
        treatment === 'small_business_exempt'
          ? 'Företagsprofilen säger att svensk försäljning är momsbefriad enligt småföretagarregeln. Direkt försäljning bokförs därför med 0 % moms.'
          : 'Företagsprofilen säger att svensk försäljning är momsfri. Direkt försäljning bokförs därför med 0 % moms.',
    }
  }

  return {
    status: 'blocked',
    vatRateLocked: true,
    forcedVatRate: 0,
    amountLabel: 'Belopp',
    blocker:
      treatment === 'mixed'
        ? 'Företagsprofilen säger blandad svensk försäljning. Välj säkrare fakturaflöde eller uppdatera profilen innan direkt försäljning bokförs.'
        : 'Företagsprofilen saknar uppgift om svensk försäljning. SoloLedger gissar inte moms, så direkt försäljning är stoppad tills profilen är kompletterad.',
    notice:
      treatment === 'mixed'
        ? 'Blandad svensk försäljning kräver ett tydligare momsval än detta direktflöde stödjer.'
        : 'Svensk försäljning saknar säker momsuppgift i profilen.',
  }
}
