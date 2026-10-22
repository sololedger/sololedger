import { supabase } from './supabaseClient'
import { verifiedProfileRpc } from './profileWriteGuard'
import { fetchAllRows } from './supabaseFetchAll'

export const supplierExpenseChoices = [
  ['6110', 'Kontorsmaterial'], ['6212', 'Mobiltelefon'], ['6310', 'Företagsförsäkring'],
  ['6540', 'IT-tjänster'], ['5910', 'Annonsering'], ['5420', 'Programvara'],
] as const
export interface SupplierYearEndInvoice {
  id: string; user_id: string; supplier_name: string; supplier_identity: string; invoice_number: string
  invoice_date: string; received_date: string; fiscal_year: number; gross_amount: number
  invoice_vat: number; deductible_vat: number; expense_account: string
  status: 'booked' | 'paid' | 'cancelled'; year_end_transaction_id: string
  attachment_path: string
  events?: {kind: string; event_date: string; ver_nr: number}[]
}
export type SupplierCommand = Record<string, string | number | boolean>
export interface SupplierReceipt { success: true; invoice_id: string; transaction_id: string; ver_nr: number; idempotent_replay: boolean }
export class SupplierRejectedError extends Error {}

export async function getSupplierYearEndInvoices(year: number, owner: string) {
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || user?.id !== owner) throw new Error('Inloggningen har ändrats. Läs skulderna igen.')
  const rows = await fetchAllRows<SupplierYearEndInvoice>({context: 'leverantörsskulder', createQuery: () =>
    supabase.from('supplier_year_end_invoices').select('*', {count:'exact'})
      .eq('user_id',owner).lte('fiscal_year',year).order('created_at').order('id')})
  if (rows.some(row => row.user_id !== owner)) throw new Error('Skuldernas ägare kunde inte verifieras.')
  // Load linked vouchers with exact counts. Never show a silently truncated audit trail.
  for(let start=0;start<rows.length;start+=200) {
    const group=rows.slice(start,start+200)
    const events=await fetchAllRows<{invoice_id:string;transaction_id:string;kind:string;event_date:string}>({
      context:'leverantörsskuldshändelser',createQuery:()=>supabase.from('supplier_year_end_events')
        .select('invoice_id,transaction_id,kind,event_date',{count:'exact'}).eq('user_id',owner).in('invoice_id',group.map(r=>r.id)).order('created_at').order('id')})
    const journal: {transaction_id:string;ver_nr:number}[]=[]
    for(let i=0;i<events.length;i+=200)journal.push(...await fetchAllRows<{transaction_id:string;ver_nr:number}>({
      context:'skuldernas verifikationer',createQuery:()=>supabase.from('journal_entries')
        .select('transaction_id,ver_nr',{count:'exact'}).eq('user_id',owner).in('transaction_id',events.slice(i,i+200).map(e=>e.transaction_id)).order('id')}))
    for(const row of group) {
      const own=events.filter(e=>e.invoice_id===row.id)
      const expected=own.some(e=>e.kind==='year_end_reversal')?'cancelled':
        own.filter(e=>e.kind==='payment').length>own.filter(e=>e.kind==='payment_reversal').length?'paid':'booked'
      if(expected!==row.status || own.filter(e=>e.kind==='year_end').length!==1)throw new Error('Underlaget ändrades. Läs in skulderna igen.')
      row.events=own.map(e=>{
        const numbers=[...new Set(journal.filter(j=>j.transaction_id===e.transaction_id).map(j=>j.ver_nr))]
        if(numbers.length!==1)throw new Error('En journal kunde inte verifieras.')
        return {kind:e.kind,event_date:e.event_date,ver_nr:numbers[0]}
      })
    }
  }
  return rows
}

export async function openSupplierAttachment(owner: string,path: string) {
  const {data:{user},error}=await supabase.auth.getUser()
  if(error || user?.id!==owner || path.split('/')[0]!==owner)throw new Error('Underlagets ägare kunde inte verifieras.')
  const {data,error:readError}=await supabase.storage.from('attachments').createSignedUrl(path,60)
  if(readError || !data?.signedUrl)throw new Error('Bilagan kunde inte öppnas. Försök igen.')
  window.open(data.signedUrl,'_blank','noopener,noreferrer')
}

export async function submitSupplierCommand(owner: string, command: SupplierCommand): Promise<SupplierReceipt> {
  const { userId, rpc } = await verifiedProfileRpc()
  if (userId !== owner) throw new Error('Inloggningen har ändrats. Försöket tillhör ett annat konto.')
  const {data,error} = await rpc('manage_supplier_year_end_invoice',{p_payload:command})
  if (error) {
    if (['23514','23505','22023','22P02','22007','22008','42501'].includes(error.code)) throw new SupplierRejectedError(error.message)
    throw new Error('Försöket kunde inte bekräftas. Behåll samma försök och försök igen.')
  }
  if (!data?.success || !data.transaction_id || !data.invoice_id || !Number.isInteger(data.ver_nr)) {
    throw new Error('Bokningskvittot kunde inte verifieras. Återuppta samma försök.')
  }
  return data as SupplierReceipt
}
