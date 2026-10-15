import { createClient } from '@supabase/supabase-js'
import { createSieImportHandler } from '@/lib/sieImportServer'

export const runtime = 'nodejs'
const options = { auth: { persistSession: false, autoRefreshToken: false } }

export const POST = createSieImportHandler({
  admin: () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, options),
  user: token => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    ...options, global: { headers: { Authorization: 'Bearer ' + token } },
  }),
})
