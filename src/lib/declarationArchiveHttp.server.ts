import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { archiveUuid, parseDeclarationCommand } from './declarationArchive'
import { DeclarationArchiveError } from './declarationArchiveView'
import { listDeclarationVersions, previewDeclaration, readDeclarationVersion } from './declarationArchiveRead.server'
import { saveDeclarationRevision } from './declarationArchive.server'
import { exportDeclarationHtml } from './declarationArchiveExport.server'

type Dependencies = {
  clients: (token: string, write: boolean) => { auth: SupabaseClient; service: SupabaseClient | null };
  appRevision: () => string;
}
const privateHeaders={'Cache-Control':'private, no-store, max-age=0',Vary:'Authorization','X-Content-Type-Options':'nosniff'}
const bad=()=>new DeclarationArchiveError('Ogiltig arkivbegäran.',400,'invalid')
function exactKeys(value: unknown, keys: string[]): asserts value is Record<string, unknown> {
  if(!value || typeof value!=='object' || Array.isArray(value) || Object.keys(value).length!==keys.length || Object.keys(value).some(k=>!keys.includes(k))) throw bad()
}
async function body(request: Request) {
  if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw bad()
  const reader=request.body?.getReader();if(!reader) throw bad()
  const chunks: Uint8Array[]=[];let size=0
  while(true) {
    const {done,value}=await reader.read();if(done) break
    size+=value.byteLength
    if(size>262144) {await reader.cancel();throw new DeclarationArchiveError('Uppgifterna är för stora för att sparas.',413,'invalid')}
    chunks.push(value)
  }
  try {const all=new Uint8Array(size);let offset=0;for(const chunk of chunks){all.set(chunk,offset);offset+=chunk.length}return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(all))}
  catch {throw bad()}
}
export function createDeclarationArchiveHandlers(deps: Dependencies) {
  async function handle(request: Request) {
    let saving=false
    try {
      const write=request.method==='POST'
      const match=request.headers.get('authorization')?.match(/^Bearer ([^\s]+)$/i)
      if(!match) throw new DeclarationArchiveError('Logga in igen för att öppna deklarationshistoriken.',401,'unauthorized')
      if(write && request.headers.has('origin') && request.headers.get('origin')!==new URL(request.url).origin) throw new DeclarationArchiveError('Begäran måste komma från samma webbplats.',403,'forbidden')
      const token=match[1],clients=deps.clients(token,write)
      const identity=await clients.auth.auth.getUser(token)
      if(identity.error || !identity.data.user) throw new DeclarationArchiveError('Inloggningen kunde inte verifieras. Logga in igen.',401,'unauthorized')
      const owner=identity.data.user.id,url=new URL(request.url)
      if(write) {
        if([...url.searchParams].length) throw bad()
        const value: unknown=await body(request);exactKeys(value,['request_id','command'])
        let command,requestId
        try {command=parseDeclarationCommand(value.command);requestId=archiveUuid(value.request_id)} catch {throw bad()}
        const appRevision=deps.appRevision()
        if(!clients.service || !/^[a-f0-9]{40}$/.test(appRevision)) throw new DeclarationArchiveError('Arkivets serverkonfiguration är inte klar.',503,'configuration')
        saving=true
        const receipt=await saveDeclarationRevision(clients.auth,clients.service,token,requestId,command,appRevision)
        return Response.json({owner,receipt},{headers:privateHeaders})
      }
      if([...url.searchParams.keys()].some(k=>!['view','year','id'].includes(k)) || [...url.searchParams.keys()].some(k=>url.searchParams.getAll(k).length!==1)) throw bad()
      const view=url.searchParams.get('view')
      if(view==='index' && url.searchParams.size===1) return Response.json({owner,versions:await listDeclarationVersions(clients.auth,owner)},{headers:privateHeaders})
      if(view==='preview' && url.searchParams.size===2 && url.searchParams.has('year')) {
        const text=url.searchParams.get('year')!,year=Number(text)
        if(!/^\d{4}$/.test(text) || year<1900 || year>9998) throw bad()
        return Response.json({owner,preview:await previewDeclaration(clients.auth,token,year)},{headers:privateHeaders})
      }
      if((view==='version' || view==='export') && url.searchParams.size===2 && url.searchParams.has('id')) {
        let id;try{id=archiveUuid(url.searchParams.get('id'))}catch{throw bad()}
        const version=await readDeclarationVersion(clients.auth,owner,id)
        if(view==='version') return Response.json({owner,version},{headers:privateHeaders})
        return new Response(exportDeclarationHtml(version),{headers:{...privateHeaders,'Content-Type':'text/html; charset=utf-8',
          'Content-Disposition':`attachment; filename="Deklarationshistorik-${version.income_year}-v${version.revision_no}.html"`,
          'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'self'"}})
      }
      throw bad()
    } catch(error) {
      const known=error instanceof DeclarationArchiveError?error:new DeclarationArchiveError(saving?'Utfallet kunde inte bekräftas. Försök igen med samma sparbegäran.':'Deklarationsarkivet kunde inte läsas. Kontrollera anslutningen och att arkivet är installerat.',503,saving?'uncertain':'unavailable',saving)
      return Response.json({error:known.message,code:known.code,uncertain:known.uncertain},{status:known.status,headers:privateHeaders})
    }
  }
  return {GET:handle,POST:handle}
}
