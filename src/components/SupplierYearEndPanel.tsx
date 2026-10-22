'use client'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { getSupplierYearEndInvoices, openSupplierAttachment, submitSupplierCommand, supplierExpenseChoices, SupplierRejectedError,
  type SupplierYearEndInvoice, type SupplierCommand } from '@/lib/supplierYearEnd'
import SwedishDateInput from '@/components/SwedishDateInput'
import {formatIsoDateSv} from '@/lib/dateUi'

interface Props {
  owner: string; selectedYear: number; isYearLocked: boolean
  accountingReady?: boolean
  onUploadAttachment: (file: File) => Promise<string>; onBookkeepingChanged: () => Promise<void>
  onOpenBookkeeping?: (year: number) => void
}
const money = (n: number) => Number(n).toLocaleString('sv-SE',{minimumFractionDigits:2,maximumFractionDigits:2})
const inputClass = 'block w-full rounded-lg border p-2 text-base text-gray-900'
export default function SupplierYearEndPanel({owner,selectedYear,isYearLocked,accountingReady=true,onUploadAttachment,onBookkeepingChanged,onOpenBookkeeping}: Props) {
  const [rows,setRows] = useState<SupplierYearEndInvoice[]>([])
  const [ready,setReady] = useState(false)
  const [error,setError] = useState('')
  const [notice,setNotice] = useState('')
  const [pending,setPending] = useState<SupplierCommand | null>(null)
  const [busy,setBusy] = useState(false)
  const [storageReady,setStorageReady] = useState(false)
  const [storageError,setStorageError] = useState('')
  const [file,setFile] = useState<File | null>(null)
  const [invoiceDate,setInvoiceDate]=useState('')
  const [receivedDate,setReceivedDate]=useState('')
  const [paymentDates,setPaymentDates]=useState<Record<string,string>>({})
  const inFlight = useRef(false)
  const loadSeq = useRef(0)
  const alive = useRef(true)
  const key = `sololedger.supplierYearEnd.${owner}`
  async function load() {
    const seq=++loadSeq.current
    setReady(false); setRows([]); setError('')
    try {
      const data=await getSupplierYearEndInvoices(selectedYear,owner)
      if(alive.current && seq===loadSeq.current) {setRows(data);setReady(true)}
    } catch {if(alive.current && seq===loadSeq.current) setError('Skulderna kunde inte hämtas. Inga tidigare belopp visas. Försök igen.')}
  }
  useEffect(()=>{
    alive.current=true
    let disposed=false
    void Promise.resolve().then(()=>{
    if(disposed)return
    try {
      const saved=localStorage.getItem(key)
      if(saved) {
        const parsed=JSON.parse(saved)
        if(parsed.owner!==owner || typeof parsed.command?.request_key!=='string') throw Error('invalid')
        setPending(parsed.command)
      }
      setStorageReady(true)
    } catch {setStorageError('Det sparade försöket kunde inte läsas. Skapa ingen ny bokning innan det kontrollerats.'); return}
    void load()
    })
    return ()=>{disposed=true;alive.current=false}
    // Parent keys the panel by owner and year, including auth generation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[owner,selectedYear,key])
  async function perform(command: SupplierCommand) {
    if(inFlight.current) return
    inFlight.current=true;setBusy(true);setNotice('')
    let confirmed=false
    try {
      if(!storageReady || !navigator.locks) throw new Error('Säker bokningslagring saknas. Använd en uppdaterad webbläsare och kontrollera det sparade försöket.')
      await navigator.locks.request(`sololedger.supplierYearEnd.${owner}`,async()=>{
      const saved=localStorage.getItem(key)
      if(saved && saved!==JSON.stringify({owner,command})) {
        const previous=JSON.parse(saved)
        if(previous.owner!==owner) throw new Error('Försökets ägare kunde inte verifieras.')
        setPending(previous.command)
        throw new Error('Ett annat sparat försök finns. Återuppta det först.')
      }
      // Persist the exact immutable request before submitting; reload replays this key/payload.
      localStorage.setItem(key,JSON.stringify({owner,command}))
      setPending(command)
      const receipt=await submitSupplierCommand(owner,command)
      confirmed=true
      localStorage.removeItem(key);setPending(null)
      if(!alive.current)return
      setNotice(`Bokningen är bekräftad som VER-${receipt.ver_nr}. Kontrollera journalen i Bokföring.`)
      await load(); await onBookkeepingChanged()
      })
    } catch(e) {
      if(!alive.current)return
      if(e instanceof SupplierRejectedError && !confirmed) {
        localStorage.removeItem(key);setPending(null)
        setNotice(`Ingen ny bokning genomfördes: ${e.message}`)
      } else setNotice(confirmed ? 'Bokningen är bekräftad men visningen kunde inte uppdateras. Läs in skulderna igen.'
        : e instanceof Error ? e.message : 'Osäkert svar. Återuppta samma försök.')
    } finally {inFlight.current=false;if(alive.current)setBusy(false)}
  }
  async function book(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if(pending || busy || inFlight.current || !storageReady || !ready || isYearLocked || !file)return
    const form=e.currentTarget
    const values=new FormData(form)
    // Prevent duplicate uploads before perform() starts and preserve verified owner in uploader.
    inFlight.current=true;setBusy(true)
    try {
      const path=await onUploadAttachment(file)
      if(!alive.current)return
      const command: SupplierCommand={action:'book',request_key:crypto.randomUUID(),fiscal_year:selectedYear,
        country:'SE',currency:'SEK',invoice_kind:'ordinary_expense',wholly_unpaid:true,delivered_in_year:true,
        not_previously_booked:true,not_credit_or_partial:true,attachment_path:path}
      for(const name of ['supplier_name','supplier_identity','invoice_number','invoice_date','received_date','expense_account','deduction']) command[name]=String(values.get(name)??'')
      for(const name of ['gross_amount','vat_rate','invoice_vat']) command[name]=Number(values.get(name))
      inFlight.current=false
      await perform(command)
    } catch(e) {if(alive.current)setNotice(e instanceof Error?e.message:'Bilagan kunde inte laddas upp.')}
    finally {inFlight.current=false;if(alive.current)setBusy(false)}
  }
  function act(row: SupplierYearEndInvoice,action: string,form: HTMLFormElement) {
    if(pending || busy || !storageReady)return
    const values=new FormData(form)
    const command:SupplierCommand={action,invoice_id:row.id,request_key:crypto.randomUUID()}
    if(action==='pay'){command.payment_date=String(values.get('payment_date'));command.paid_amount=Number(values.get('paid_amount'))}
    else command.reason=String(values.get('reason'))
    if(!confirm(action==='pay' ? `Bokför hela betalningen ${money(row.gross_amount)} kr? Detta reglerar skulden utan ny kostnad eller moms.`
      : 'Skapa en spårbar spegelbokning på ursprungsdatumet? Låst år eller momsperiod ändras inte.'))return
    void perform(command)
  }
  return <section className="mx-auto max-w-3xl space-y-5 rounded-2xl bg-white p-4 sm:p-8">
    <h2 className="text-xl font-bold">Obetalda leverantörsfakturor vid bokslut {selectedYear}</h2>
    <p>Öppna fakturorna och jämför med bankens betalningar till och med 31 december. Ta bara med helt obetalda svenska kostnadsfakturor i SEK som hör till året. Du bekräftar själv att alla underlag finns med; SoloLedger kan inte hitta saknade fakturor.</p>
    <p>Först bokas kostnad, eventuell avdragsgill moms och skuld den 31 december. När betalningen kommer nästa år öppnar du samma skuld här. <strong>Bokför inte betalningen som en ny vanlig kostnad.</strong></p>
    <p className="text-sm">Delbetalningar, kreditfakturor, utlandsinköp, inventarier, lager, förskott och osäker eller delvis avdragsgill moms stöds inte här. Stanna och kontrollera underlaget; ingen automatisk alternativ bokning görs.</p>
    {error && <p role="alert">{error}</p>}
    {storageError && <p role="alert">{storageError}</p>}
    {notice && <p role="status" className="rounded-lg bg-amber-50 p-3">{notice}</p>}
    <button type="button" disabled={busy} onClick={()=>void load()} className="rounded-lg border p-2">Läs in skulderna igen</button>
    {pending && <div className="rounded-lg border border-amber-500 p-3"><p>Ett sparat försök behöver bekräftas. Inga nya försök kan skapas under tiden.</p>
      <button disabled={busy} onClick={()=>void perform(pending)} className="rounded-lg bg-emerald-700 p-3 text-white">Återuppta samma försök</button></div>}
    {!ready && !error && <p>Hämtar rätt års skulder…</p>}
    {ready && <>
      <p>{rows.filter(r=>r.status==='booked').length} registrerade obetalda bokslutsskulder till och med {selectedYear}. En registrerad post är också bokförd.</p>
      {rows.map(row=><article key={row.id} className="space-y-3 rounded-lg border p-4 break-words">
        <h3 className="font-bold">{row.supplier_name} · {row.invoice_number}</h3>
        <p>Bokslut {row.fiscal_year}: {money(row.gross_amount)} kr. {row.status==='booked'?'Bokförd skuld, ännu inte betald':row.status==='paid'?'Betalningen är bokförd':'Rättad med spegelbokning'}.</p>
        <p className="text-sm">Fakturamoms {money(row.invoice_vat)} kr; avdragsgill del {money(row.deductible_vat)} kr.</p>
        <button type="button" className="rounded-lg border p-2" onClick={()=>void openSupplierAttachment(owner,row.attachment_path).catch(()=>setNotice('Bilagan kunde inte öppnas. Försök igen.'))}>Öppna fakturabilagan</button>
        {row.events?.map((event,i)=><p key={i} className="text-sm">
          {{year_end:'Bokslutsskuld',payment:'Betalning',payment_reversal:'Återförd betalning',year_end_reversal:'Återförd skuld'}[event.kind] ?? 'Bokföringshändelse'} {formatIsoDateSv(event.event_date)} · VER-{event.ver_nr}
          {onOpenBookkeeping && <button type="button" className="ml-2 underline" onClick={()=>onOpenBookkeeping(Number(event.event_date.slice(0,4)))}>Visa i Bokföring</button>}
        </p>)}
        {row.status==='booked' && <form onSubmit={e=>{e.preventDefault();act(row,'pay',e.currentTarget)}} className="space-y-2">
          <label className="block">Betalningsdatum <SwedishDateInput ariaLabel="Betalningsdatum" value={paymentDates[row.id]??''} onChange={v=>setPaymentDates(p=>({...p,[row.id]:v}))} required min={`${row.fiscal_year+1}-01-01`} className={inputClass}/><input type="hidden" name="payment_date" value={paymentDates[row.id]??''}/></label>
          <label className="block">Hela beloppet som betalats (kr) <input name="paid_amount" type="number" step="0.01" required defaultValue={row.gross_amount} className={inputClass}/></label>
          <button disabled={busy||!!pending||!storageReady} className="rounded-lg bg-emerald-700 p-3 text-white">Bokför betalning av denna skuld</button>
        </form>}
        {row.status!=='cancelled' && <details><summary>Rätta en felbokning</summary><p>Historiken sparas. Rättelse görs på ursprungsdatum och stoppas om året eller relevant momsperiod är låst. En betald skuld behöver först få betalningen återförd. Registrera sedan korrekt underlag om själva skulden var fel.</p>
          <form onSubmit={e=>{e.preventDefault();act(row,row.status==='paid'?'undo_payment':'cancel',e.currentTarget)}}>
            <label className="block">Orsak <input name="reason" required minLength={5} maxLength={300} className={inputClass}/></label>
            <button disabled={busy||!!pending||!storageReady} className="rounded-lg border p-2">{row.status==='paid'?'Återför felaktig betalning':'Återför felaktig bokslutsskuld'}</button>
          </form></details>}
      </article>)}
      <details open><summary className="font-bold">Registrera och bokför en obetald faktura för {selectedYear}</summary>
        {!accountingReady ? <p>Årets ekonomiska uppgifter kunde inte kontrolleras. Läs om dem före en ny bokslutsskuld. Ett sparat försök kan fortfarande återupptas säkert.</p>
          : isYearLocked && <p>Året är låst. Nya bokslutsskulder kan inte läggas till.</p>}
        <form onSubmit={book} className="mt-3 space-y-3">
          <fieldset disabled={busy||!!pending||isYearLocked||!storageReady} className="space-y-3">
            <label className="block">Leverantörens namn <input name="supplier_name" required maxLength={160} className={inputClass}/></label>
            <label className="block">Leverantörens organisations- eller personnummer (10 siffror) <input name="supplier_identity" required pattern="[0-9 -]{10,12}" className={inputClass}/></label>
            <label className="block">Fakturanummer <input name="invoice_number" required maxLength={80} className={inputClass}/></label>
            <label className="block">Fakturadatum <SwedishDateInput ariaLabel="Fakturadatum" value={invoiceDate} onChange={setInvoiceDate} required min={`${selectedYear}-01-01`} max={`${selectedYear}-12-31`} className={inputClass}/><input type="hidden" name="invoice_date" value={invoiceDate}/></label>
            <label className="block">Datum du fick fakturan <SwedishDateInput ariaLabel="Datum du fick fakturan" value={receivedDate} onChange={setReceivedDate} required max={`${selectedYear}-12-31`} className={inputClass}/><input type="hidden" name="received_date" value={receivedDate}/></label>
            <label className="block">Vad gäller inköpet? <select name="expense_account" required defaultValue="" className={inputClass}><option value="" disabled>Välj vanlig kostnad</option>{supplierExpenseChoices.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
            <label className="block">Hela fakturabeloppet inklusive moms (SEK) <input name="gross_amount" type="number" min="0.01" step="0.01" required className={inputClass}/></label>
            <label className="block">Fakturans svenska momssats <select name="vat_rate" required defaultValue="" className={inputClass}><option value="" disabled>Kontrollera fakturan</option>{[0,6,12,25].map(n=><option key={n} value={n}>{n} %</option>)}</select></label>
            <label className="block">Momsbelopp som faktiskt står på fakturan (kr) <input name="invoice_vat" type="number" min="0" step="0.01" required className={inputClass}/></label>
            <label className="block">Rätt att dra av denna moms <select name="deduction" required defaultValue="" className={inputClass}><option value="" disabled>Kontrollera avdragsrätten</option><option value="none">Ingen avdragsrätt – hela fakturan blir kostnad</option><option value="full">Full avdragsrätt för detta inköp</option></select></label>
            <label className="block">Fakturabilaga <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" required onChange={e=>setFile(e.target.files?.[0]??null)} className={inputClass}/></label>
            <label className="block"><input type="checkbox" required/> Jag har kontrollerat att detta är en svensk vanlig kostnad i SEK för leverans under {selectedYear}, helt obetald 31 december, inte tidigare bokförd och utan kredit eller delbetalning. Moms och avdragsrätt är klara.</label>
            <p>Bekräfta först när årets underlag är klart. Knappen bokför skulden den 31 december; den betalar inte fakturan och låser inte året.</p>
            <button className="rounded-lg bg-emerald-700 p-3 text-white">Registrera och bokför bokslutsskulden</button>
          </fieldset>
        </form>
      </details>
    </>}
  </section>
}
