import type { MomsBreakdown } from './accountingService'
import { calculateBusinessResult } from './resultEngine'

export interface DashboardBalances {
  [accountNumber: string]: number
}

export interface DashboardData {
  bankSaldo: number
  intakter: number
  kostnader: number
  bokfortResultat: number
  ejAvdragsgillt: number
  skattemassigVinst: number
  utgaendeMoms: number
  ingaendeMoms: number
  momsNetto: number
  skattReserv: number
  sakertUttag: number
}

export function getBankSaldo(balances: DashboardBalances): number {
  return balances['1930'] || 0
}

/**
 * Behålls som exporterad hjälpfunktion för bakåtkompatibilitet.
 *
 * Intäkterna hämtas nu från samma gemensamma resultatmotor som används
 * för bokfört resultat och NE-bilagan.
 */
export function getIntakter(balances: DashboardBalances): number {
  return calculateBusinessResult(balances).intakter
}

/**
 * Behålls som exporterad hjälpfunktion för bakåtkompatibilitet.
 *
 * Kostnaderna hämtas nu från samma gemensamma resultatmotor som används
 * för bokfört resultat och NE-bilagan.
 */
export function getKostnader(balances: DashboardBalances): number {
  return calculateBusinessResult(balances).kostnader
}

/**
 * Dashboardens resultatberäkning.
 *
 * Bokfört resultat, intäkter, kostnader och skattemässigt resultat
 * kommer från resultEngine.ts. Dashboard och NE-bilagan kan därför
 * inte längre ha varsin separat definition av bokfört resultat.
 *
 * Moms beräknas fortsatt i accountingService.ts via getMomsBreakdown(),
 * eftersom korrekt momsberäkning kräver verifikationsnivå och inte kan
 * återskapas från hopslagna kontosaldon.
 */
export function calculateDashboard(
  balances: DashboardBalances,
  taxRate: number,
  momsBreakdown: MomsBreakdown
): DashboardData {
  const bankSaldo = getBankSaldo(balances)

  // EN gemensam resultatmotor för både Dashboard och NE.
  const businessResult = calculateBusinessResult(balances)

  const {
    intakter,
    kostnader,
    bokfortResultat,
    ejAvdragsgillt,
    skattemassigtResultat,
  } = businessResult

  const {
    utgaendeMoms,
    ingaendeMoms,
    momsNetto,
  } = momsBreakdown

  const skattemassigVinst = skattemassigtResultat

  const skattReserv =
    skattemassigVinst > 0
      ? Math.round(skattemassigVinst * (taxRate / 100) * 100) / 100
      : 0

  const sakertUttag =
    Math.round(
      (bankSaldo - skattReserv - (momsNetto > 0 ? momsNetto : 0)) * 100
    ) / 100

  return {
    bankSaldo,
    intakter,
    kostnader,
    bokfortResultat,
    ejAvdragsgillt,
    skattemassigVinst,
    utgaendeMoms,
    ingaendeMoms,
    momsNetto,
    skattReserv,
    sakertUttag,
  }
}