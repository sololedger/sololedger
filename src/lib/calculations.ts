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
  
  export function calculateDashboard(balances: DashboardBalances, taxRate: number): DashboardData {
    const bankSaldo = getBankSaldo(balances)
    const intakter = getIntakter(balances)
    const kostnader = getKostnader(balances)
  
    const bokfortResultat = Math.round((intakter - kostnader) * 100) / 100
    const ejAvdragsgillt = Math.abs(balances['6992'] || 0)
    const skattemassigVinst = Math.round((bokfortResultat + ejAvdragsgillt) * 100) / 100
    
    const momsNetto = Math.round((Math.abs(balances['2611'] || 0) - Math.abs(balances['2641'] || 0)) * 100) / 100
    
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
      momsNetto,
      skattReserv,
      sakertUttag
    }
  }