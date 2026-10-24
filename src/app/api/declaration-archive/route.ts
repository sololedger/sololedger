import { createClient } from '@supabase/supabase-js'
import { createDeclarationArchiveHandlers } from '@/lib/declarationArchiveHttp.server'
import { DeclarationArchiveError } from '@/lib/declarationArchiveView'

export const runtime='nodejs'
export const dynamic='force-dynamic'
const handlers=createDeclarationArchiveHandlers({
  appRevision:()=>process.env.SOLOLEDGER_BUILD_REVISION || '',
  clients(token,write) {
    const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY
    if(!url || !key || (write && !serviceKey)) throw new DeclarationArchiveError('Arkivets serverkonfiguration är inte klar.',503,'configuration')
    const auth={persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}
    return {
      auth:createClient(url,key,{auth,global:{headers:{Authorization:`Bearer ${token}`}}}),
      // This client never receives an end-user bearer or a persisted session.
      service:write?createClient(url,serviceKey!,{auth}):null,
    }
  },
})
export const GET=handlers.GET
export const POST=handlers.POST
