'use client'
import { useState, useRef, useCallback } from 'react'
import { decodeSieBuffer, parseSieFile } from '@/lib/sieParser'
import type { SieParseResult } from '@/lib/sieParser'
import { importSieBatch, SieImportError } from '@/lib/sieImport'
import type { ImportSieBatchResult } from '@/lib/sieImport'

interface SieImportModalProps {
  isOpen: boolean
  onClose: () => void
  refreshData: () => void | Promise<void>
}

type Step = 'select' | 'parsing' | 'preview' | 'importing' | 'done'

export default function SieImportModal({ isOpen, onClose, refreshData }: SieImportModalProps) {
  const [step, setStep] = useState<Step>('select')
  const [isDragging, setIsDragging] = useState(false)
  const [filename, setFilename] = useState<string>('')
  const [encoding, setEncoding] = useState<string>('')
  const [decodeWarnings, setDecodeWarnings] = useState<string[]>([])
  const [parseResult, setParseResult] = useState<SieParseResult | null>(null)
  const [importResult, setImportResult] = useState<ImportSieBatchResult | null>(null)
  const [importErrorMessage, setImportErrorMessage] = useState<string | null>(null)
  const [importErrorIsInfo, setImportErrorIsInfo] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const reset = () => {
    setStep('select')
    setFilename('')
    setEncoding('')
    setDecodeWarnings([])
    setParseResult(null)
    setImportResult(null)
    setImportErrorMessage(null)
    setImportErrorIsInfo(false)
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const handleFile = useCallback(async (file: File) => {
    setFilename(file.name)
    setStep('parsing')
    try {
      const buffer = await file.arrayBuffer()
      const decoded = decodeSieBuffer(buffer)
      const result = parseSieFile(decoded.content)
      setEncoding(decoded.encoding)
      setDecodeWarnings(decoded.warnings)
      setParseResult(result)
      setStep('preview')
    } catch (err) {
      setImportErrorMessage(
        'Filen kunde inte läsas: ' + (err instanceof Error ? err.message : 'okänt fel.')
      )
      setImportErrorIsInfo(false)
      setStep('done')
    }
  }, [])

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    e.target.value = ''
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  const handleImport = async () => {
    if (!parseResult) return
    setStep('importing')
    setImportErrorMessage(null)
    setImportErrorIsInfo(false)
    try {
      const result = await importSieBatch(parseResult, filename)
      setImportResult(result)
      await refreshData()
      setStep('done')
    } catch (err) {
      if (err instanceof SieImportError) {
        setImportErrorMessage(err.message)
        setImportErrorIsInfo(err.code === 'ALREADY_IMPORTED')
      } else {
        setImportErrorMessage(
          'Importen misslyckades: ' + (err instanceof Error ? err.message : 'okänt fel.')
        )
        setImportErrorIsInfo(false)
      }
      setStep('preview')
    }
  }

  const hasBlockingErrors = (parseResult?.errors.length ?? 0) > 0

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4">
      <div className="w-full sm:max-w-2xl max-h-[92vh] sm:max-h-[85vh] overflow-y-auto bg-white rounded-t-[2rem] sm:rounded-[2rem] shadow-xl border border-gray-100">

        {/* ── HEADER ── */}
        <div className="sticky top-0 bg-white/95 backdrop-blur-sm border-b border-gray-100 p-6 sm:p-8 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-wide text-sky-500">SIE-import</p>
            <h2 className="text-xl font-black text-gray-800">Importera bokföring</h2>
          </div>
          <button
            onClick={handleClose}
            className="w-9 h-9 rounded-full flex items-center justify-center text-gray-300 hover:text-gray-600 hover:bg-gray-50 transition-colors text-lg font-bold"
            aria-label="Stäng"
          >
            ✕
          </button>
        </div>

        <div className="p-6 sm:p-8">

          {/* ── STEG 1: VÄLJ FIL ── */}
          {step === 'select' && (
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`rounded-2xl border-2 border-dashed p-10 sm:p-14 text-center cursor-pointer transition-colors ${
                isDragging
                  ? 'border-sky-400 bg-sky-50'
                  : 'border-gray-200 hover:border-sky-300 hover:bg-gray-50'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".se,.sie"
                onChange={handleFileInputChange}
                className="hidden"
              />
              <p className="text-3xl mb-3">📄</p>
              <p className="font-bold text-gray-700 mb-1">
                Släpp din SIE-fil här, eller klicka för att välja
              </p>
              <p className="text-sm text-gray-400">
                Stöder .se och .sie-filer (SIE Typ 4)
              </p>
            </div>
          )}

          {/* ── PARSAR ── */}
          {step === 'parsing' && (
            <div className="py-16 text-center">
              <div className="w-8 h-8 mx-auto mb-4 border-[3px] border-sky-200 border-t-sky-500 rounded-full animate-spin" />
              <p className="font-bold text-gray-500">Läser {filename}...</p>
            </div>
          )}

          {/* ── STEG 2: FÖRHANDSGRANSKNING ── */}
          {step === 'preview' && parseResult && (
            <div className="space-y-6">
              <div>
                <p className="text-[10px] font-black uppercase tracking-wide text-gray-400 mb-1">Fil</p>
                <p className="font-bold text-gray-700">{filename}</p>
              </div>

              {/* Statgrid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <StatCard label="Företag" value={parseResult.companyName ?? '–'} />
                <StatCard label="Org.nr" value={parseResult.orgNr ?? '–'} />
                <StatCard label="Räkenskapsår" value={parseResult.year ? String(parseResult.year) : '–'} />
                <StatCard label="Verifikationer" value={String(parseResult.verificationCount)} />
                <StatCard label="Konton" value={String(parseResult.accountCount)} />
                <StatCard label="Kodning" value={encoding.toUpperCase()} />
              </div>

              {/* Fel (blockerande) */}
              {parseResult.errors.length > 0 && (
                <MessageList
                  tone="error"
                  title={`${parseResult.errors.length} fel hittades – importen är blockerad`}
                  items={parseResult.errors}
                />
              )}

              {/* Varningar (icke-blockerande) */}
              {(parseResult.warnings.length > 0 || decodeWarnings.length > 0) && (
                <MessageList
                  tone="warning"
                  title={`${parseResult.warnings.length + decodeWarnings.length} varningar`}
                  items={[...decodeWarnings, ...parseResult.warnings]}
                />
              )}

              {parseResult.errors.length === 0 && parseResult.warnings.length === 0 && (
                <p className="text-sm text-emerald-600 font-bold">
                  ✓ Filen ser bra ut — inga fel eller varningar.
                </p>
              )}

              {/* Info/redan-importerad-meddelande om ett tidigare försök stötte på det */}
              {importErrorMessage && (
                <MessageList
                  tone={importErrorIsInfo ? 'info' : 'error'}
                  title={importErrorIsInfo ? 'Redan importerad' : 'Importen misslyckades'}
                  items={[importErrorMessage]}
                />
              )}

              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <button
                  onClick={reset}
                  className="flex-1 h-12 rounded-2xl bg-gray-50 hover:bg-gray-100 text-gray-500 font-black text-sm transition-colors"
                >
                  Välj annan fil
                </button>
                <button
                  onClick={handleImport}
                  disabled={hasBlockingErrors}
                  title={hasBlockingErrors ? 'Åtgärda felen i källfilen och försök igen' : undefined}
                  className={`flex-1 h-12 rounded-2xl font-black text-sm transition-colors ${
                    hasBlockingErrors
                      ? 'bg-gray-100 text-gray-300 cursor-not-allowed'
                      : 'bg-sky-500 hover:bg-sky-600 text-white'
                  }`}
                >
                  Importera {parseResult.verificationCount} verifikationer
                </button>
              </div>
            </div>
          )}

          {/* ── STEG 3: IMPORTERAR ── */}
          {step === 'importing' && (
            <div className="py-16 text-center">
              <div className="w-8 h-8 mx-auto mb-4 border-[3px] border-sky-200 border-t-sky-500 rounded-full animate-spin" />
              <p className="font-bold text-gray-500">Importerar bokföring...</p>
              <p className="text-xs text-gray-400 mt-1">Detta kan ta en liten stund för stora filer.</p>
            </div>
          )}

          {/* ── RESULTAT ── */}
          {step === 'done' && (
            <div className="space-y-6">
              {importResult ? (
                <>
                  <div className="text-center py-4">
                    <p className="text-3xl mb-2">✓</p>
                    <p className="font-black text-lg text-gray-800">Importen lyckades</p>
                    <p className="text-sm text-gray-400 mt-1">
                      {importResult.importedCount} av {importResult.verificationCount} verifikationer importerade
                    </p>
                  </div>
                  <button
                    onClick={handleClose}
                    className="w-full h-12 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-black text-sm transition-colors"
                  >
                    Stäng
                  </button>
                </>
              ) : (
                <>
                  <MessageList
                    tone="error"
                    title="Filen kunde inte importeras"
                    items={[importErrorMessage ?? 'Ett okänt fel uppstod.']}
                  />
                  <div className="flex flex-col sm:flex-row gap-3">
                    <button
                      onClick={reset}
                      className="flex-1 h-12 rounded-2xl bg-gray-50 hover:bg-gray-100 text-gray-500 font-black text-sm transition-colors"
                    >
                      Försök igen
                    </button>
                    <button
                      onClick={handleClose}
                      className="flex-1 h-12 rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-500 font-black text-sm transition-colors"
                    >
                      Stäng
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

// ── Delkomponenter ──────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4">
      <p className="text-[9px] font-black uppercase tracking-wide text-gray-400 mb-0.5">{label}</p>
      <p className="font-bold text-gray-700 text-sm truncate">{value}</p>
    </div>
  )
}

function MessageList({
  tone,
  title,
  items,
}: {
  tone: 'error' | 'warning' | 'info'
  title: string
  items: string[]
}) {
  const styles = {
    error: 'bg-red-50 border-red-100 text-red-500',
    warning: 'bg-amber-50 border-amber-100 text-amber-600',
    info: 'bg-sky-50 border-sky-100 text-sky-600',
  }[tone]

  return (
    <div className={`rounded-2xl border p-4 ${styles}`}>
      <p className="text-[10px] font-black uppercase tracking-wide mb-2">{title}</p>
      <ul className="space-y-1 max-h-40 overflow-y-auto text-xs font-medium pr-1">
        {items.map((item, i) => (
          <li key={i} className="leading-snug">• {item}</li>
        ))}
      </ul>
    </div>
  )
}