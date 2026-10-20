import { supabase } from './supabaseClient'
import { requireProfileContext, type ProfileTicket } from './profileContext'

// Pin the verified token to the actual request. A later cross-tab sign-in must
// never make an already prepared A write run with B's bearer token.
export async function verifyProfileWrite(ticket: ProfileTicket) {
  requireProfileContext(ticket)
  const { data: { session }, error: sessionError } = await supabase.auth.getSession()
  if (sessionError || !session) throw new Error('Din session kunde inte verifieras.')
  const { data: { user }, error } = await supabase.auth.getUser(session.access_token)
  requireProfileContext(ticket)
  if (error || user?.id !== ticket.userId) throw new Error('Inloggningen har ändrats. Ladda profilen igen.')
  return session.access_token
}

export async function verifiedProfileRpc() {
  const ticket = requireProfileContext()
  const token = await verifyProfileWrite(ticket)
  return {
    userId: ticket.userId,
    rpc: (name: string, args?: Record<string, unknown>) => {
      requireProfileContext(ticket)
      return supabase.rpc(name, args).setHeader('Authorization', `Bearer ${token}`)
    },
  }
}
