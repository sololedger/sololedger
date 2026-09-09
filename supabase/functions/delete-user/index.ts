import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type Action = 'dry-run' | 'delete'

const TABLES = [
  'journal_entries',
  'transactions',
  'favorites',
  'import_batches',
  'accounts',
  'closed_years',
  'ver_nr_sequences',
] as const

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return jsonResponse({ error: 'Unauthorized' }, 401)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')

  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return jsonResponse({ error: 'Server configuration saknas' }, 500)
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)
  const supabaseUser = createClient(
    supabaseUrl,
    anonKey,
    { global: { headers: { Authorization: authHeader } } }
  )

  // Verifiera den inloggade användaren från access-token.
  const {
    data: { user: caller },
    error: callerError,
  } = await supabaseUser.auth.getUser()

  if (callerError || !caller) {
    return jsonResponse({ error: 'Unauthorized' }, 401)
  }

  // Adminrollen läses server-side med service role.
  const { data: callerProfile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', caller.id)
    .single()

  if (profileError || callerProfile?.role !== 'admin') {
    return jsonResponse({ error: 'Forbidden' }, 403)
  }

  let body: { userId?: string; action?: Action }

  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Ogiltig JSON' }, 400)
  }

  const userId = body.userId
  const action: Action = body.action ?? 'delete'

  if (!userId) {
    return jsonResponse({ error: 'userId krävs' }, 400)
  }

  if (action !== 'dry-run' && action !== 'delete') {
    return jsonResponse({ error: 'Ogiltig action' }, 400)
  }

  if (userId === caller.id) {
    return jsonResponse({ error: 'Kan inte radera ditt eget konto' }, 400)
  }

  try {
    // Kontrollera att målprofilen finns och hämta e-post för adminvyn.
    const { data: targetProfile, error: targetProfileError } = await supabaseAdmin
      .from('profiles')
      .select('id, email, role')
      .eq('id', userId)
      .single()

    if (targetProfileError || !targetProfile) {
      return jsonResponse({ error: 'Användaren hittades inte' }, 404)
    }

    if (targetProfile.role === 'admin') {
      return jsonResponse({ error: 'Admin-konton kan inte raderas här' }, 400)
    }

    const counts = await getUserCounts(supabaseAdmin, userId)
    const attachmentPaths = await listAllAttachmentPaths(supabaseAdmin, userId)

    const summary = {
      userId,
      email: targetProfile.email,
      counts: {
        ...counts,
        attachments: attachmentPaths.length,
      },
    }

    if (action === 'dry-run') {
      return jsonResponse({
        success: true,
        action: 'dry-run',
        ...summary,
      })
    }

    // Storage först. Om borttagningen misslyckas lämnas DB/Auth orörda.
    if (attachmentPaths.length > 0) {
      const { error: storageError } = await supabaseAdmin.storage
        .from('attachments')
        .remove(attachmentPaths)

      if (storageError) {
        throw new Error(`Kunde inte radera bilagor: ${storageError.message}`)
      }
    }

    // Databasen raderas i beroendeordning.
    // journal_entries före transactions, och transactions före import_batches.
    await deleteByUserId(supabaseAdmin, 'journal_entries', userId)
    await deleteByUserId(supabaseAdmin, 'transactions', userId)
    await deleteByUserId(supabaseAdmin, 'favorites', userId)
    await deleteByUserId(supabaseAdmin, 'import_batches', userId)
    await deleteByUserId(supabaseAdmin, 'accounts', userId)
    await deleteByUserId(supabaseAdmin, 'closed_years', userId)
    await deleteByUserId(supabaseAdmin, 'ver_nr_sequences', userId)

    // Profilen sist av DB-raderna.
    const { error: profileDeleteError } = await supabaseAdmin
      .from('profiles')
      .delete()
      .eq('id', userId)

    if (profileDeleteError) {
      throw new Error(`Kunde inte radera profil: ${profileDeleteError.message}`)
    }

    // Auth-användaren raderas allra sist.
    const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(userId)

    if (authDeleteError) {
      throw new Error(`Bokföringsdata raderades men Auth-användaren kunde inte raderas: ${authDeleteError.message}`)
    }

    return jsonResponse({
      success: true,
      action: 'delete',
      ...summary,
    })
  } catch (err: any) {
    return jsonResponse(
      { error: err?.message || 'Okänt fel vid radering' },
      500
    )
  }
})

async function getUserCounts(supabaseAdmin: any, userId: string) {
  const results = await Promise.all(
    TABLES.map(async (table) => {
      const { count, error } = await supabaseAdmin
        .from(table)
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)

      if (error) {
        throw new Error(`Kunde inte räkna ${table}: ${error.message}`)
      }

      return [table, count ?? 0] as const
    })
  )

  return Object.fromEntries(results) as Record<(typeof TABLES)[number], number>
}

async function deleteByUserId(
  supabaseAdmin: any,
  table: string,
  userId: string
) {
  const { error } = await supabaseAdmin
    .from(table)
    .delete()
    .eq('user_id', userId)

  if (error) {
    throw new Error(`Kunde inte radera ${table}: ${error.message}`)
  }
}

async function listAllAttachmentPaths(
  supabaseAdmin: any,
  userId: string
): Promise<string[]> {
  const bucket = supabaseAdmin.storage.from('attachments')
  const paths: string[] = []

  async function walk(prefix: string) {
    let offset = 0
    const limit = 100

    while (true) {
      const { data: items, error } = await bucket.list(prefix, {
        limit,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      })

      if (error) {
        throw new Error(`Kunde inte läsa bilagor: ${error.message}`)
      }

      if (!items || items.length === 0) break

      for (const item of items) {
        const fullPath = prefix ? `${prefix}/${item.name}` : item.name

        // Storage-mappar saknar normalt id/metadata.
        if (item.id) {
          paths.push(fullPath)
        } else {
          await walk(fullPath)
        }
      }

      if (items.length < limit) break
      offset += limit
    }
  }

  await walk(userId)
  return paths
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
}
