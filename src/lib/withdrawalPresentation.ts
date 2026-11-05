// Presentation only. Never changes the assessment, amounts, or write contract.
import type { buildWithdrawalAssessment, WithdrawalSnapshot } from './withdrawalAssessment'
export type WithdrawalTask = 'coverage'|'tax_account'|'income'|'bank'|'other'|'buffer'|'rate'|'review'
export type WithdrawalAssessment = ReturnType<typeof buildWithdrawalAssessment>
export const withdrawalTaskLabels: Record<WithdrawalTask,string> = {coverage:'Tidigare åtaganden',tax_account:'Skattekontots saldo',income:'Skattebeslut per år',bank:'Bankens saldo',other:'Andra återstående betalningar',buffer:'Extra buffert',rate:'Årsuppskattning',review:'Granska bokföringsunderlaget'}
export const withdrawalHelpIds: Record<WithdrawalTask,string> = {coverage:'uttag-tidigare-ataganden',tax_account:'uttag-skattekonto',income:'uttag-skattebeslut',bank:'uttag-bank',other:'uttag-andra-betalningar',buffer:'uttag-buffert',rate:'uttag-arsprocent',review:'sakert-uttag'}
export function withdrawalIssueTask(issue:string):WithdrawalTask {
 if(issue.startsWith('Kontrollera om äldre åtaganden'))return 'coverage'
 if(/^(Skattehändelser i den tidigare avstämningen|En senare skattebetalning|Skattekontots påverkan|Skattebeslutet behöver en avstämning)/.test(issue))return 'tax_account'
 if(/^(Kontrollera debiterad skatt för|Kontrollera vilka skattebelopp för|Resultatunderlaget för den fasta skatteuppgiften)/.test(issue))return 'income'
 if(/^(Kontrollera andra återstående betalningar|Andra betalningar behöver kontrolleras)/.test(issue))return 'other'
 if(issue.startsWith('Bankens kontrollerade saldo avviker'))return 'bank'
 // Unknown / accounting conflicts always go to review, never to an attestation.
 return 'review'
}
export function withdrawalControlRows(a:WithdrawalAssessment,s:WithdrawalSnapshot,annualRateInCard:boolean){
 const required = new Set(a.result.issues.map(withdrawalIssueTask))
 const income = withdrawalIncomeYears(a)
 const tasks:WithdrawalTask[]=['coverage','tax_account','income','bank','other','buffer',...(!annualRateInCard?['rate' as const]:[]),...(required.has('review')?['review' as const]:[])]
 return tasks.map(task=>{
  const facts=a.facts.filter(f=>task==='income'?f.key.startsWith('income:'):task==='rate'?f.key.startsWith('rate:'):f.key===task)
  let reusable=facts.length>0&&!required.has(task)
  if(task==='bank')reusable=reusable&&facts[0].value.signature===s.signature&&facts[0].value.date===s.as_of&&facts[0].value.amountOre===facts[0].value.bookOre
  if(task==='tax_account')reusable=reusable&&a.result.taxAccountOre!==null&&a.checkedAt===s.as_of
  if(task==='income')reusable=reusable&&!income.missing.length&&!income.review.length
  const detail = task === 'tax_account' && a.checkedAt ? withdrawalTaxAccountNote(a)
   : task === 'income' ? [
    income.missing.length ? `Saknar uppgift för ${income.missing.join(', ')}.` : '',
    income.review.length ? `Behöver granskas för ${income.review.join(', ')}.` : '',
   ].filter(Boolean).join(' ') : ''
  return {task,label:withdrawalTaskLabels[task],group:required.has(task)?'required' as const:reusable?'valid' as const:'optional' as const,observed: facts.map(f=>f.observed_on??s.revision?.as_of_date).filter(Boolean).join(', '),saved:facts.length>0,detail,
   incomeYear: task === 'income' ? income.review[0] ?? income.missing.at(-1) : undefined}
 })
}
export function withdrawalTaxAccountNote(a: WithdrawalAssessment) {
 if (!a.checkedAt) return 'Skattekontot har inte kontrollerats för dagens datum.'
 const saved = `Senast kontrollerat ${a.checkedAt}.`
 if (a.result.issues.some(issue => withdrawalIssueTask(issue) === 'tax_account')) return `${saved} Saldot behöver stämmas av igen.`
 if (a.checkedAt === a.result.asOf) return saved
 return `${saved} Uppskattningen utgår från den senaste kontrollen.`
}
function issueYear(issue: string) {
 const year = issue.match(/\b(?:19|20)\d{2}\b/)?.[0]
 return year ? Number(year) : undefined
}
function withdrawalIncomeYears(a: WithdrawalAssessment) {
 const saved = new Set(a.facts.map(fact => fact.key))
 const missing = a.taxYears.filter(year => !saved.has(`income:${year}`))
 const review = [...new Set(a.result.issues.flatMap(issue => {
  if (withdrawalIssueTask(issue) !== 'income' && !issue.startsWith('Skatteunderlaget för')) return []
  const year = issueYear(issue)
  return year === undefined ? [] : [year]
 }))]
 return { missing, review }
}
export function withdrawalMissingIncomeYear(a: WithdrawalAssessment) {
 return withdrawalIncomeYears(a).missing.at(-1)
}
export function withdrawalNextTask(a:WithdrawalAssessment,s:WithdrawalSnapshot):WithdrawalTask {
 if(a.result.issues[0])return withdrawalIssueTask(a.result.issues[0])
 if(a.result.status!=='estimated')return 'buffer'
 if(a.checkedAt!==s.as_of)return 'tax_account'
 if(withdrawalControlRows(a,s,true).find(r=>r.task==='bank')?.group!=='valid')return 'bank'
 return withdrawalMissingIncomeYear(a)!==undefined?'income':'buffer'
}

export function withdrawalGuidance(a: WithdrawalAssessment, s: WithdrawalSnapshot) {
 const task = withdrawalNextTask(a, s)
 const issue = a.result.issues[0]
 const incomeYear = task === 'income' ? (issue ? issueYear(issue) : withdrawalMissingIncomeYear(a)) : undefined
 const message = issue ?? (a.result.status !== 'estimated' ? null
  : task === 'tax_account' ? withdrawalTaxAccountNote(a)
  : task === 'bank' ? 'Beloppet bygger på bokföringen. Saldot i banken behöver jämföras.'
  : incomeYear !== undefined ? `Skatteuppgift saknas för ${incomeYear}. Den slutliga skatten uppskattas.`
  : 'Den slutliga skatten är fortfarande en uppskattning.')
 return { task, incomeYear, message }
}
