import type { MomsBreakdown } from './accountingService'

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
  
  export function getIntakter(balances: DashboardBalances): number {
    return Math.abs(
      Object.entries(balances)
        .filter(([acc]) => acc.startsWith('3'))
        .reduce((sum, [_, val]) => sum + val, 0)
    )
  }
  
  export function getKostnader(balances: DashboardBalances): number {
    return Object.entries(balances)
      .filter(([acc]) => ['4', '5', '6', '7'].some(p => acc.startsWith(p)))
      .reduce((sum, [_, val]) => sum + Math.abs(val), 0)
  }
  
  // momsNetto beräknas INTE längre internt här - den kräver verifikationsnivå-
  // gruppering (vilken transaction_id varje journalrad hör till) för att korrekt
  // kunna exkludera interna momsombokningar ("Alternativ E", se arkitekturbeslut).
  // balances (DashboardBalances) är redan hopslagna kontosaldon utan den
  // grupperingen kvar, så beräkningen görs istället i accountingService.ts
  // (getMomsBreakdown) och skickas in här som ett färdigt objekt - med hela
  // utgående/ingående/netto-uppdelningen, inte bara nettot, så att alla
  // konsumenter (Dashboard-kortet OCH Moms-modalen i OverviewCards) kan visa
  // samma siffror utan att någon räknar själv.
  export function calculateDashboard(balances: DashboardBalances, taxRate: number, momsBreakdown: MomsBreakdown): DashboardData {
    const bankSaldo = getBankSaldo(balances)
    const intakter = getIntakter(balances)
    const kostnader = getKostnader(balances)
    const { utgaendeMoms, ingaendeMoms, momsNetto } = momsBreakdown
  
    const bokfortResultat = Math.round((intakter - kostnader) * 100) / 100
    const ejAvdragsgillt = Math.abs(balances['6992'] || 0)
    const skattemassigVinst = Math.round((bokfortResultat + ejAvdragsgillt) * 100) / 100
    
    const skattReserv = skattemassigVinst > 0
      ? Math.round(skattemassigVinst * (taxRate / 100) * 100) / 100
      : 0
      
    const sakertUttag = Math.round(
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
      sakertUttag
    }
  }