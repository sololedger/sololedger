'use client'

import { useId } from 'react'
import type { AttachmentDisplayItem, AttachmentGroupItem } from '@/lib/transactionAttachmentGroups'

export interface AttachmentGroupMember extends AttachmentGroupItem {
  tx: AttachmentGroupItem['tx'] & {
    id: string
    description?: string | null
    amount?: number | string | null
    corrects_ver_nr?: number | null
    booked?: boolean
  }
  verNr?: number | null
  journal: Array<{
    id: string
    account_number: string | number
    debit?: number | string | null
    credit?: number | string | null
    description?: string | null
  }>
  isCorrection: boolean
  isNeutralized: boolean
  offerGenericEdit: boolean
  offerGenericCorrection: boolean
}

interface Props {
  group: Extract<AttachmentDisplayItem<AttachmentGroupMember>, { kind: 'attachmentGroup' }>
  expanded: boolean
  onToggle: () => void
  onOpenAttachment: (path: string) => void
  isYearLocked: boolean
  onEdit: (tx: AttachmentGroupMember['tx']) => void
  onDelete: (tx: AttachmentGroupMember['tx']) => void
}

function money(value: number | string | null | undefined) {
  return Number(value ?? 0).toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// The same content is used in desktop table cells and mobile cards.
export default function AttachmentTransactionGroup({
  group, expanded, onToggle, onOpenAttachment, isYearLocked, onEdit, onDelete,
}: Props) {
  const detailsId = useId()
  const dateLabel = group.startDate === group.endDate
    ? group.startDate
    : `${group.startDate} – ${group.endDate}`

  return (
    <section aria-label="Gemensamt underlag" className="min-w-0 rounded-2xl border border-gray-200 bg-gray-50 p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-bold text-gray-800">Gemensamt underlag</h3>
          <p className="text-sm text-gray-600">{dateLabel}</p>
          <p className="text-sm font-bold text-gray-600">{group.items.length} verifikationer</p>
        </div>
        <button type="button" onClick={() => onOpenAttachment(group.fileUrl)}
          className="text-sm font-bold text-emerald-700 underline underline-offset-2">
          Visa gemensam bilaga
        </button>
      </div>
      <button type="button" aria-expanded={expanded} aria-controls={detailsId} onClick={onToggle}
        className="mt-3 rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-700">
        {expanded ? 'Dölj verifikationer' : 'Visa verifikationer'}
      </button>
      {expanded && (
        <div id={detailsId} className="mt-4 space-y-4">
          {group.items.map(member => (
            <article key={member.tx.id} aria-label={`VER-${member.verNr ?? '–'}`}
              className="min-w-0 rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex flex-wrap justify-between gap-2 text-sm font-bold text-gray-700">
                <p>VER-{member.verNr ?? '–'} · {member.tx.date}</p>
                <p>Belopp: {money(member.tx.amount)} kr</p>
              </div>
              {member.isCorrection && <p className="text-sm text-amber-700">Korrigering · rättar VER-{member.tx.corrects_ver_nr ?? '–'}</p>}
              {member.isNeutralized && <p className="text-sm text-gray-600">Rättad med korrigeringsverifikation</p>}
              <p className="mt-2 whitespace-pre-wrap break-words text-sm text-gray-800">{member.tx.description}</p>
              <dl className="mt-3 space-y-2 text-xs text-gray-700">
                {member.journal.map(row => (
                  <div key={row.id} className="rounded-lg bg-gray-50 p-2">
                    <dt className="font-bold">Konto {row.account_number}</dt>
                    <dd>Debet: {money(row.debit)} kr · Kredit: {money(row.credit)} kr</dd>
                    {row.description && <dd className="whitespace-pre-wrap break-words">{row.description}</dd>}
                  </div>
                ))}
              </dl>
              <p className="mt-3 text-xs text-gray-600">Bilaga: gemensamt underlag, öppnas ovan.</p>
              {!isYearLocked && !member.isCorrection && !member.isNeutralized && (
                <div className="mt-3 flex flex-wrap gap-3 text-xs font-bold">
                  {member.offerGenericEdit && <button type="button" onClick={() => onEdit(member.tx)} className="text-emerald-700 underline">
                    {member.tx.booked ? 'Hantera bilaga' : 'Redigera'}
                  </button>}
                  {member.offerGenericCorrection && <button type="button" onClick={() => onDelete(member.tx)} className="text-red-700 underline">Korrigera</button>}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
