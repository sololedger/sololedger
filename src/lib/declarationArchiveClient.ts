import { supabase } from './supabaseClient'
import { DeclarationArchiveError, type DeclarationCommand, type DeclarationSourceView, type DeclarationSummary, type DeclarationVersion } from './declarationArchiveView'

async function archiveRequest(owner: string, query: string, init: RequestInit = {}) {
  const writing=init.method==='POST'
  let session
  try {session=await supabase.auth.getSession()} catch {throw new DeclarationArchiveError('Inloggningen kunde inte kontrolleras.',401,'unauthorized')}
  const {data,error}=session
  if(error || !data.session || data.session.user.id!==owner) throw new DeclarationArchiveError('Inloggningen har ändrats. Logga in igen.',401,'unauthorized')
  let response: Response
  try {
    response=await fetch('/api/declaration-archive'+query,{...init,signal:init.signal??AbortSignal.timeout(30000),cache:'no-store',credentials:'omit',headers:{
      Authorization:`Bearer ${data.session.access_token}`,...(writing?{'Content-Type':'application/json'}:{}),
    }})
  } catch {throw new DeclarationArchiveError(writing?'Utfallet är okänt. Försök igen med samma sparbegäran.':'Historiken kunde inte hämtas.',503,writing?'uncertain':'unavailable',writing)}
  let current
  try {current=await supabase.auth.getSession()} catch {throw new DeclarationArchiveError('Svaret kunde inte knytas till aktuell inloggning.',401,'unauthorized',writing)}
  if(current.error || current.data.session?.user.id!==owner) throw new DeclarationArchiveError('Inloggningen har ändrats.',401,'unauthorized',writing)
  if(!response.ok) {
    let failure;try{failure=await response.json()}catch{failure=null}
    // Only use bounded messages from our endpoint; never render raw proxy HTML.
    throw new DeclarationArchiveError(typeof failure?.error==='string'?failure.error.slice(0,500):'Arkivet kunde inte läsas.',response.status,failure?.code || 'unavailable',failure?.uncertain ?? writing)
  }
  return response
}
async function json(owner: string, query: string, init?: RequestInit) {
  const response=await archiveRequest(owner,query,init)
  let result
  try {result=await response.json()} catch {throw new DeclarationArchiveError('Svaret kunde inte bekräftas.',503,'uncertain',init?.method==='POST')}
  if(!result || result.owner!==owner) throw new DeclarationArchiveError('Svaret hör inte till aktuell inloggning.',403,'forbidden',init?.method==='POST')
  return result
}
export async function loadDeclarationIndex(owner: string): Promise<DeclarationSummary[]> {
  return (await json(owner,'?view=index')).versions
}
export async function loadDeclarationVersion(owner: string, id: string): Promise<DeclarationVersion> {
  return (await json(owner,'?view=version&id='+encodeURIComponent(id))).version
}
export async function loadDeclarationPreview(owner: string, year: number): Promise<DeclarationSourceView> {
  return (await json(owner,'?view=preview&year='+year)).preview
}
export async function submitDeclarationVersion(owner: string, requestId: string, command: DeclarationCommand): Promise<{id: string; revision_no: number; status: string}> {
  const result=await json(owner,'',{method:'POST',body:JSON.stringify({request_id:requestId,command})})
  if(!result.receipt || !['saved','replayed'].includes(result.receipt.status) || typeof result.receipt.id!=='string' || !Number.isInteger(result.receipt.revision_no)) throw new DeclarationArchiveError('Sparandet kunde inte bekräftas. Försök igen med samma begäran.',503,'uncertain',true)
  return result.receipt
}
export async function loadDeclarationExport(owner: string, id: string) {
  const response=await archiveRequest(owner,'?view=export&id='+encodeURIComponent(id))
  try {return await response.text()} catch {throw new DeclarationArchiveError('Exporten kunde inte hämtas. Försök igen.')}
}
