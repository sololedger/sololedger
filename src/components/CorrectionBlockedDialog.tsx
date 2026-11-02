'use client'

import { useEffect, useRef } from 'react'

export interface CorrectionBlockedNotice {
  message: string
  verNr?: number
  description: string
}

export default function CorrectionBlockedDialog({ notice, onClose, onOpenVatReport }: {
  notice: CorrectionBlockedNotice
  onClose: () => void
  onOpenVatReport: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const element = dialog.current
    const previousFocus = document.activeElement
    element?.showModal()
    element?.querySelector('h2')?.focus()
    if (element) element.scrollTop = 0
    return () => {
      element?.close()
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus()
    }
  }, [])

  // Only separate the existing guidance for readability. Never infer period status
  // or dates from the transaction; the server's rejection remains authoritative.
  const reason = notice.message.split(' Öppna momsrapporten för perioden')[0]
    .replace(/ Inget har bokförts\.$/, '')

  return (
    <dialog ref={dialog} onClose={onClose} aria-labelledby="correction-blocked-title"
      aria-describedby="correction-blocked-reference correction-blocked-reason correction-blocked-result"
      className="m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-2xl border border-gray-200 bg-white p-5 text-gray-900 shadow-xl backdrop:bg-gray-950/40 sm:p-7">
      <h2 id="correction-blocked-title" tabIndex={-1} className="text-xl font-bold outline-none">Rättelsen har stoppats</h2>
      <p id="correction-blocked-reference" className="mt-2 break-words text-sm text-gray-600">
        {notice.verNr != null ? `Originalverifikation VER-${notice.verNr}` : 'Ursprunglig bokning'}
        {notice.description && ` · ${notice.description}`}
      </p>
      <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
        <h3 className="font-bold">Varför stoppas rättelsen?</h3>
        <p id="correction-blocked-reason" className="mt-2 break-words text-sm leading-relaxed">{reason}</p>
      </div>
      <p id="correction-blocked-result" className="mt-4 text-sm font-semibold leading-relaxed">
        Ingen bokföring har ändrats. Ingen ny verifikation har skapats och inget verifikationsnummer har förbrukats.
      </p>
      <h3 className="mt-5 font-bold">Vad kan du göra nu?</h3>
      <p className="mt-2 text-sm leading-relaxed">Öppna momsrapporten och välj den berörda perioden. Granska rapporten, momsavslutet och originalets underlag. Ta vid behov hjälp av en redovisningskunnig för att bedöma rättelsen. En tidigare momsdeklaration kan behöva rättas.</p>
      <p className="mt-2 text-sm leading-relaxed text-gray-600">SoloLedger har ännu inget komplett flöde för den här rättelsen.</p>
      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button type="button" onClick={() => dialog.current?.close()}
          className="min-h-11 rounded-xl border border-gray-300 px-5 py-3 text-sm font-bold text-gray-700 hover:bg-gray-50">Stäng</button>
        <button type="button" onClick={onOpenVatReport}
          className="min-h-11 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-800">Öppna momsrapporten</button>
      </div>
    </dialog>
  )
}
