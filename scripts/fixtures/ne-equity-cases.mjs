// Balanced synthetic journals. Shared by offline consumer and isolated SQL tests.
const entry = (rows, year = 2026) => ({ rows, date: `${year}-10-01` })
const sale = entry({1930: 1000, 3010: -1000})
const transfer = entry({8999: 1000, 2019: -1000})
const opening = entry({1930: 2000, 2010: -2000})
export const equityCases = [
  {name:'ordinary-profit', entries:[sale], equity:1000},
  {name:'profit-transfer', entries:[sale, transfer], equity:1000, old:2000},
  {name:'loss-transfer', entries:[opening, entry({1930:-1000,5010:1000}),entry({8999:-1000,2019:1000})],equity:1000,old:0},
  {name:'partial-transfer', entries:[sale,entry({8999:400,2019:-400})],equity:1000,old:1400},
  {name:'partial-reversal', entries:[sale,transfer,entry({8999:-400,2019:400})],equity:1000,old:1600},
  {name:'full-reversal', entries:[sale,transfer,entry({8999:-1000,2019:1000})],equity:1000},
  {name:'8990-transfer', entries:[sale,entry({8990:1000,2019:-1000})],equity:1000,old:2000},
  {name:'8990-8999-chain', entries:[sale,entry({8990:1000,2019:-1000}),entry({8999:1000,8990:-1000})],equity:1000,old:2000},
  {name:'opening-2019', entries:[entry({1930:1000,2019:-1000})],equity:1000},
  {name:'opening-2010', entries:[opening],equity:2000},
  {name:'opening-and-profit-transfer', entries:[entry({1930:1000,2019:-1000}),sale,transfer],equity:2000,old:3000},
  {name:'owner-deposits-withdrawals', entries:[sale,transfer,entry({1930:300,2018:-500,2013:200})],equity:1300,old:2300},
  {name:'owner-reversals', entries:[sale,transfer,entry({1930:300,2017:-500,2011:50,2012:50,2013:50,2014:50}),entry({1930:-30,2017:50,2011:-5,2012:-5,2013:-5,2014:-5})],equity:1270,old:2270},
  {name:'automatic-next-year', entries:[sale],year:2027,equity:1000},
  {name:'transfer-carry-forward', entries:[sale,transfer],year:2027,equity:1000,old:2000},
  {name:'transfer-to-2010', entries:[sale,transfer,entry({2019:1000,2010:-1000},2027)],year:2027,equity:1000,old:2000},
  {name:'next-year-profit', entries:[sale,transfer,entry({1930:500,3010:-500},2027)],year:2027,equity:1500,old:2500},
  {name:'next-year-reversal', entries:[sale,transfer,entry({8999:-1000,2019:1000},2027)],year:2027,equity:1000},
  {name:'before-next-year-reversal', entries:[sale,transfer,entry({8999:-1000,2019:1000},2027)],equity:1000,old:2000},
  {name:'closed-pnl-observation', entries:[sale,entry({3010:1000,8990:-1000}),entry({8990:1000,8999:-1000}),transfer],equity:1000,zeroResult:true},
  {name:'untransferred-closed-pnl', entries:[sale,entry({3010:1000,8990:-1000})],equity:1000,old:0,zeroResult:true},
  {name:'unclassified-closing-offset', entries:[entry({8999:1000,2890:-1000})],equity:-1000,old:0,blocked:true,oldClose:'ok'},
]

export function sumEntries(entries, year, annual = false) {
  const balances = {}
  for (const e of entries) if (annual ? Number(e.date.slice(0,4)) === year : Number(e.date.slice(0,4)) <= year) {
    for (const [account, amount] of Object.entries(e.rows)) balances[account] = (balances[account] ?? 0) + amount
  }
  return balances
}
