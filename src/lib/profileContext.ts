// One active profile generation per browser client. A new load invalidates all
// earlier reads and writes, including A -> B -> A and same-owner refreshes.
export type ProfileTicket = Readonly<{ userId: string | null; sequence: number }>
let current: ProfileTicket = { userId: null, sequence: 0 }
let ready = false

export function beginProfileContext(userId: string | null): ProfileTicket {
  current = { userId, sequence: current.sequence + 1 }
  ready = false
  return current
}

export function isCurrentProfileContext(ticket: ProfileTicket): boolean {
  return ticket === current
}

export function acceptProfileContext(ticket: ProfileTicket, profileId: string): boolean {
  if (!isCurrentProfileContext(ticket) || ticket.userId !== profileId) return false
  ready = true
  return true
}

export function requireProfileContext(ticket = current): ProfileTicket {
  if (!ready || !ticket.userId || !isCurrentProfileContext(ticket)) {
    throw new Error('Företagsprofilen är inte verifierad för aktuell inloggning. Ladda profilen igen innan du sparar eller bokför.')
  }
  return ticket
}
