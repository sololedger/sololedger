'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useId, type FormEvent } from 'react'
import {
  bookFixedAssetAcquisition,
  bookFixedAssetDepreciation,
  getFixedAssetDepreciationRuns,
  getFixedAssetDepreciationPreview,
  getFixedAssets,
  getTaxRuleParametersForYear,
  retireFixedAsset,
} from '@/lib/accountingService'
import {
  assessFixedAssetGroup,
  calculateFixedAssetDecision,
  calculateFixedAssetInvoiceAmounts,
  isFixedAssetVatRate,
  type FixedAsset,
  type FixedAssetConnectionAssessment,
  type FixedAssetDepreciationRun,
  type FixedAssetDepreciationPreview,
  type FixedAssetTaxRuleParameters,
  type FixedAssetUsefulLifeAnswer,
  type FixedAssetVatRate,
  type FixedAssetVatDeductionEntitlement,
} from '@/lib/fixedAssets'
import type { PaymentAccountRole } from '@/lib/paymentAccountRoles'
import type { ConfiguredPaymentAccountRole } from '@/lib/paymentAccountRoles'
import type { CompanyVatProfileAdapterResult } from '@/lib/vatProfileAdapter'

type PaymentSourceChoice = 'business_account' | 'owner_private'

interface FixedAssetsPanelProps {
  verifyProfile: () => Promise<string>
  selectedYear: number
  isYearLocked: boolean
  companyVatProfileResult: CompanyVatProfileAdapterResult
  paymentAccountRoles: ConfiguredPaymentAccountRole[]
  paymentAccountRolesLoading: boolean
  paymentAccountRolesLoaded: boolean
  paymentAccountRolesError: string | null
  onRefreshPaymentAccountRoles: () => void
  onOpenPaymentAccountSettings: () => void
  onBookkeepingChanged: () => void | Promise<void>
}

const paymentSourceRole: Record<PaymentSourceChoice, PaymentAccountRole> = {
  business_account: 'business_payment_account',
  owner_private: 'owner_private_payment',
}

const paymentSourceLabels: Record<PaymentSourceChoice, string> = {
  business_account: 'Företagets konto',
  owner_private: 'Privat betalning',
}

const fixedAssetVatRates: FixedAssetVatRate[] = [25, 12, 6, 0]

function formatMoney(amount: number) {
  return amount.toLocaleString('sv-SE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function parseAmount(value: string) {
  const normalized = value.replace(/\s/g, '').replace(',', '.')
  if (!normalized) return 0
  return Number(normalized)
}

function dateInYear(year: number) {
  const today = new Date()
  if (today.getFullYear() === year) {
    return today.toISOString().slice(0, 10)
  }

  return `${year}-01-01`
}

function decisionLabel(decisionType: FixedAsset['decisionType']) {
  if (decisionType === 'immediate_expense_small_value') return 'Direkt kostnad: mindre värde'
  if (decisionType === 'immediate_expense_short_life') return 'Direkt kostnad: kort livslängd'
  return 'Inventarie: skrivs av vid bokslut'
}

function depreciationMethodLabel(method: FixedAssetDepreciationRun['method']) {
  if (method === 'k1_half_pbb_full_writeoff') return 'Helt avdrag eftersom underlaget är högst halvt PBB'
  return '30 procent enligt K1 huvudregel'
}

function defaultFixedAssetVatDeduction(
  profile: CompanyVatProfileAdapterResult['profile']
): FixedAssetVatDeductionEntitlement {
  return profile.defaultDeductionEntitlement === 'full' ? 'full' : 'none'
}

function fixedAssetVatDeductionNotice(
  profile: CompanyVatProfileAdapterResult['profile']
) {
  if (profile.defaultDeductionEntitlement === 'none') {
    return 'Företagsprofilen anger ingen normal avdragsrätt för ingående moms. Inventarier bokförs därför utan momsavdrag.'
  }

  if (profile.defaultDeductionEntitlement === 'unknown') {
    return 'Företagsprofilen saknar säker uppgift om avdragsrätt. Fullt momsavdrag är låst tills Profil uppdateras; köpet kan bokföras utan momsavdrag.'
  }

  if (profile.defaultDeductionEntitlement === 'partial') return 'Delvis momsavdrag stöds inte här. Om du väljer inget momsavdrag ingår hela fakturabeloppet i kostnaden eller inventarievärdet.'
  return null
}

function HelpHint({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ left: 16, top: 24 })
  const id = useId()
  return <span className="relative inline-flex align-middle">
    <button type="button" aria-label="Visa förklaring" aria-expanded={open} aria-controls={id}
      onClick={event => {
        event.preventDefault()
        const rect = event.currentTarget.getBoundingClientRect()
        setPosition({ left: Math.max(16, Math.min(rect.left, window.innerWidth - 272)), top: Math.max(16, Math.min(rect.bottom + 8, window.innerHeight - 220)) })
        setOpen(value => !value)
      }}
      onBlur={() => setOpen(false)} onKeyDown={event => { if (event.key === 'Escape') setOpen(false) }}
      className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-gray-300 bg-white text-xs font-black text-gray-600 focus:ring-2 focus:ring-emerald-300">?</button>
    {open && <span id={id} role="note" style={position} className="fixed z-20 max-h-[50vh] w-64 max-w-[calc(100vw-32px)] overflow-auto rounded-lg border border-gray-200 bg-white p-3 text-xs font-medium normal-case leading-relaxed text-gray-700 shadow-lg">{text}</span>}
  </span>
}

export default function FixedAssetsPanel({
  verifyProfile,
  selectedYear,
  isYearLocked,
  companyVatProfileResult,
  paymentAccountRoles,
  paymentAccountRolesLoading,
  paymentAccountRolesLoaded,
  paymentAccountRolesError,
  onRefreshPaymentAccountRoles,
  onOpenPaymentAccountSettings,
  onBookkeepingChanged,
}: FixedAssetsPanelProps) {
  const panelLoadSequence = useRef(0)
  const [panelLoadError, setPanelLoadError] = useState<string | null>(null)
  const [taxRules, setTaxRules] = useState<FixedAssetTaxRuleParameters | null>(null)
  const [assets, setAssets] = useState<FixedAsset[]>([])
  const [depreciationRuns, setDepreciationRuns] = useState<FixedAssetDepreciationRun[]>([])
  const [depreciationPreview, setDepreciationPreview] = useState<FixedAssetDepreciationPreview | null>(null)
  const [normalYearConfirmed, setNormalYearConfirmed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [unsupportedYear, setUnsupportedYear] = useState<string | null>(null)

  const [description, setDescription] = useState('')
  const [acquisitionDate, setAcquisitionDate] = useState(dateInYear(selectedYear))
  const [supplierCountry, setSupplierCountry] = useState<'SE' | 'foreign'>('SE')
  const [grossAmount, setGrossAmount] = useState('')
  const [vatRate, setVatRate] = useState<FixedAssetVatRate>(25)
  const [vatDeductionEntitlement, setVatDeductionEntitlement] =
    useState<FixedAssetVatDeductionEntitlement>(
      defaultFixedAssetVatDeduction(companyVatProfileResult.profile)
    )
  const [paymentSource, setPaymentSource] = useState<PaymentSourceChoice>('business_account')
  const [connectionAssessment, setConnectionAssessment] =
    useState<FixedAssetConnectionAssessment | ''>('')
  const [plannedGroupBasisAmount, setPlannedGroupBasisAmount] = useState('')
  const [acquisitionGroupName, setAcquisitionGroupName] = useState('')
  const [connectedAssetIds, setConnectedAssetIds] = useState<string[]>([])
  const [usefulLifeAnswer, setUsefulLifeAnswer] =
    useState<FixedAssetUsefulLifeAnswer | ''>('')
  const acquisitionSubmissionRef = useRef<{ signature: string; key: string } | null>(null)

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setAcquisitionDate(dateInYear(selectedYear))
    }, 0)

    return () => window.clearTimeout(handle)
  }, [selectedYear])

  const loadPanel = useCallback(async () => {
    const sequence = ++panelLoadSequence.current
    const isCurrent = () => panelLoadSequence.current === sequence
    setPanelLoadError(null)
    setLoading(true)
    setError(null)
    setUnsupportedYear(null)

    try {
      const [rules, assetRows, runRows, preview] = await Promise.all([
        getTaxRuleParametersForYear(selectedYear),
        getFixedAssets(selectedYear),
        getFixedAssetDepreciationRuns(selectedYear),
        getFixedAssetDepreciationPreview(selectedYear),
      ])
      if (!isCurrent()) return
      setTaxRules(rules)
      setAssets(assetRows)
      setDepreciationRuns(runRows)
      setDepreciationPreview(preview)
      setNormalYearConfirmed(false)
    } catch (err) {
      if (!isCurrent()) return
      setPanelLoadError(`Kunde inte hämta inventarieuppgifter för ${selectedYear}. Inga belopp visas. Försök igen.`)
      setTaxRules(null)
      setUnsupportedYear(
        err instanceof Error ? err.message : 'Skatteregeln för året saknas.'
      )
    } finally {
      if (isCurrent()) setLoading(false)
    }
  }, [selectedYear])

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void loadPanel()
    }, 0)

    return () => window.clearTimeout(handle)
  }, [loadPanel])

  const paymentRole = paymentSourceRole[paymentSource]
  const fullVatDeductionAllowed =
    companyVatProfileResult.profile.defaultDeductionEntitlement === 'full'
  const vatDeductionNotice = fixedAssetVatDeductionNotice(
    companyVatProfileResult.profile
  )
  const allowedVatDeductionOptions = useMemo(
    () =>
      fullVatDeductionAllowed
        ? [
            ['full', 'Fullt momsavdrag'],
            ['none', 'Inget momsavdrag'],
          ] as const
        : [['none', 'Inget momsavdrag']] as const,
    [fullVatDeductionAllowed]
  )
  const vatDeductionEntitlementAllowed = allowedVatDeductionOptions.some(
    ([value]) => value === vatDeductionEntitlement
  )
  const effectiveVatDeductionEntitlement = vatDeductionEntitlementAllowed
    ? vatDeductionEntitlement
    : allowedVatDeductionOptions[0][0]
  const configuredPaymentRole = paymentAccountRoles.find(
    candidate => candidate.role === paymentRole
  )
  const priorConnectableAssets = useMemo(
    () =>
      assets.filter(asset =>
        asset.fiscalYear === selectedYear &&
        asset.assetStatus !== 'retired' &&
        asset.acquisitionDate <= acquisitionDate
      ),
    [acquisitionDate, assets, selectedYear]
  )
  const parsedGrossAmount = parseAmount(grossAmount)
  const hasValidPurchaseAmount =
    grossAmount.trim() !== '' &&
    Number.isFinite(parsedGrossAmount) &&
    parsedGrossAmount > 0 &&
    isFixedAssetVatRate(vatRate)
  const invoiceAmounts = useMemo(() => {
    if (!hasValidPurchaseAmount) return null

    try {
      return calculateFixedAssetInvoiceAmounts({
        grossAmount: parsedGrossAmount,
        vatRate,
      })
    } catch {
      return null
    }
  }, [hasValidPurchaseAmount, parsedGrossAmount, vatRate])
  const groupAssessment = useMemo(() => {
    if (!invoiceAmounts) return { value: null, error: null }
    try {
      return { value: assessFixedAssetGroup({
        assets,
        connectedAssetIds: connectionAssessment === 'connected' ? connectedAssetIds : [],
        acquisitionDate,
        fiscalYear: selectedYear,
        currentTaxableBaseAmount: invoiceAmounts.taxableBaseAmount,
        plannedGroupBasisAmount: connectionAssessment === 'connected' && plannedGroupBasisAmount.trim() !== ''
          ? parseAmount(plannedGroupBasisAmount) : null,
      }), error: null }
    } catch (err) {
      return { value: null, error: err instanceof Error ? err.message : 'Paketet kunde inte kontrolleras.' }
    }
  }, [assets, connectedAssetIds, connectionAssessment, acquisitionDate, selectedYear, invoiceAmounts, plannedGroupBasisAmount])
  const previewThresholdBasisAmount = groupAssessment.value?.thresholdBasisAmount ?? 0

  const decision = useMemo(() => {
    if (!taxRules) return null
    if (connectionAssessment === '' || connectionAssessment === 'uncertain') return null
    if (!hasValidPurchaseAmount || !groupAssessment.value) return null

    try {
      return calculateFixedAssetDecision(
        {
          grossAmount: parseAmount(grossAmount),
          vatRate,
          vatDeductionEntitlement: effectiveVatDeductionEntitlement,
          thresholdBasisAmount: previewThresholdBasisAmount,
          usefulLifeAnswer: usefulLifeAnswer || null,
        },
        taxRules
      )
    } catch {
      return null
    }
  }, [
    connectionAssessment,
    hasValidPurchaseAmount,
    grossAmount,
    previewThresholdBasisAmount,
    groupAssessment.value,
    taxRules,
    vatRate,
    usefulLifeAnswer,
    effectiveVatDeductionEntitlement,
  ])

  const purchaseBlockReason = isYearLocked ? 'Året är låst.'
    : decision?.status === 'ready' && decision.decisionType === 'capitalized' && depreciationRuns.some(run => run.fiscalYear >= selectedYear) ? 'Inventarieunderlaget är redan fastställt genom årsavskrivning. Senare aktivering kräver en kontrollerad rättelse som ännu inte stöds.'
    : supplierCountry !== 'SE' ? 'Endast svenska inköp stöds i det här flödet.'
    : connectionAssessment === 'uncertain' ? 'Sambandet med annan utrustning behöver klarläggas först.'
    : groupAssessment.error ? groupAssessment.error
    : !connectionAssessment ? 'Välj om köpet är fristående eller hör till ett paket.'
    : !hasValidPurchaseAmount ? 'Ange ett giltigt belopp inklusive moms.'
    : !configuredPaymentRole ? 'Välj ett sparat betalningskonto i Profil först.'
    : decision?.status === 'needs_useful_life' ? 'Ange ekonomisk livslängd för att bedöma direktavdrag eller aktivering.'
    : !decision ? 'Underlaget är inte tillräckligt för en säker bedömning.' : null

  const capitalizedAssets = assets.filter(
    asset => asset.assetStatus === 'active' && asset.capitalizedAmount > 0
  )
  const showUsefulLifeQuestion = hasValidPurchaseAmount || usefulLifeAnswer !== ''
  const latestRun = depreciationRuns.find(run => run.fiscalYear === selectedYear)
  const estimatedDepreciation = depreciationPreview?.status === 'ready' ? {
    basis: depreciationPreview.basis_amount!, depreciationAmount: depreciationPreview.depreciation_amount!,
    method: depreciationPreview.method!,
  } : null
  const totalCapitalizedAcquisitionValue = capitalizedAssets.reduce(
    (sum, asset) => sum + asset.capitalizedAmount,
    0
  )
  const totalBookedDepreciation = depreciationRuns.reduce(
    (sum, run) => sum + run.depreciationAmount,
    0
  )
  const collectiveBookValue = depreciationPreview?.book_value ?? null

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setMessage(null)

    if (!taxRules) {
      setError('Skatteregeln för året saknas. Bokningen stoppas.')
      return
    }

    if (supplierCountry !== 'SE') {
      setError('Utländska utrustningsköp stoppas tills EU-varuflödet finns.')
      return
    }

    if (isYearLocked) {
      setError(`Räkenskapsår ${selectedYear} är låst.`)
      return
    }

    if (!paymentAccountRolesLoaded || paymentAccountRolesLoading) {
      setError('Betalningskonton behöver laddas innan bokning.')
      return
    }

    if (paymentAccountRolesError) {
      setError('Betalningskonton kunde inte kontrolleras.')
      return
    }

    if (!configuredPaymentRole) {
      setError(`Välj konto för ${paymentSourceLabels[paymentSource]} i Profil först.`)
      return
    }

    if (!connectionAssessment) {
      setError('Ange om köpet är fristående eller hör ihop med annan utrustning.')
      return
    }

    if (connectionAssessment === 'uncertain') {
      setError('Bokningen stoppas när sambandet är osäkert. Kontrollera om köpet hör ihop med annan utrustning först.')
      return
    }

    if (groupAssessment.error || !groupAssessment.value) {
      setError(groupAssessment.error ?? 'Kontrollera belopp och anskaffningsgrupp.')
      return
    }
    if (decision?.status === 'needs_useful_life') {
      setError('Ange om utrustningen beräknas användas högst tre år.')
      return
    }

    if (!vatDeductionEntitlementAllowed) {
      setError('Valt momsavdrag stöds inte av företagets profil.')
      setVatDeductionEntitlement(effectiveVatDeductionEntitlement)
      return
    }

    setSaving(true)
    try {
      const acquisitionInput = {
        date: acquisitionDate,
        description,
        supplierCountry: 'SE' as const,
        paymentAccountRole: paymentRole,
        vatDeductionEntitlement: effectiveVatDeductionEntitlement,
        grossAmount: parseAmount(grossAmount),
        vatRate,
        thresholdBasisAmount: previewThresholdBasisAmount,
        expectedPriorAssetIds: groupAssessment.value.priorAssets.map(asset => asset.id).sort(),
        expectedReclassificationAmount: decision?.status === 'ready' && decision.decisionType === 'capitalized'
          ? groupAssessment.value.reclassificationAmount : 0,
        connectionAssessment,
        acquisitionGroupName:
          connectionAssessment === 'connected'
            ? acquisitionGroupName.trim() || description
            : null,
        connectedAssetIds:
          connectionAssessment === 'connected' ? connectedAssetIds : [],
        plannedGroupBasisAmount:
          connectionAssessment === 'connected' &&
          plannedGroupBasisAmount.trim() !== ''
            ? parseAmount(plannedGroupBasisAmount)
            : null,
        usefulLifeAnswer: usefulLifeAnswer || null,
      }
      const signature = JSON.stringify(acquisitionInput)
      if (acquisitionSubmissionRef.current?.signature !== signature) {
        acquisitionSubmissionRef.current = {
          signature,
          key: crypto.randomUUID(),
        }
      }

      await verifyProfile()
      const result = await bookFixedAssetAcquisition({
        ...acquisitionInput,
        idempotencyKey: acquisitionSubmissionRef.current.key,
      })

      setMessage(
        `${result.idempotentReplay ? 'Inventariet var redan bokfört' : 'Bokfört'} som ${decisionLabel(result.decisionType)}. Verifikation ${result.verNr}.${result.reclassificationAmount > 0 ? ` Tidigare kostnadsförda delar omklassades med ${formatMoney(result.reclassificationAmount)} kr i en separat verifikation.` : ''}`
      )
      acquisitionSubmissionRef.current = null
      setDescription('')
      setGrossAmount('')
      setConnectionAssessment('')
      setPlannedGroupBasisAmount('')
      setAcquisitionGroupName('')
      setConnectedAssetIds([])
      setUsefulLifeAnswer('')
      await loadPanel()
      await onBookkeepingChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Inventariet kunde inte bokföras.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDepreciation() {
    setError(null)
    setMessage(null)
    setSaving(true)

    try {
      if (!depreciationPreview || !normalYearConfirmed) throw new Error('Bekräfta tolvmånadersåret och att inventarieköpen är färdiga.')
      const result = await bookFixedAssetDepreciation(selectedYear, depreciationPreview, normalYearConfirmed)
      setMessage(
        result.idempotentReplay
          ? `Avskrivningen för ${selectedYear} var redan bokförd.`
          : `Avskrivning bokförd med ${formatMoney(result.depreciationAmount)} kr.`
      )
      await loadPanel()
      await onBookkeepingChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Avskrivningen kunde inte bokföras.')
    } finally {
      setSaving(false)
    }
  }

  async function handleRetire(asset: FixedAsset) {
    setError(null)
    setMessage(null)
    setSaving(true)

    try {
      await retireFixedAsset(asset.id, `${selectedYear}-12-31`, 'Avslutad i inventarieregistret')
      setMessage('Utrustningen markerades som inte längre i bruk. Bokföringen är oförändrad.')
      await loadPanel()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Inventariet kunde inte avslutas.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm font-bold text-gray-500 shadow-sm">
        Hämtar inventarieregistret...
      </div>
    )
  }

  if (panelLoadError) {
    return <div role="alert" className="rounded-2xl border bg-white p-6">{panelLoadError}<button type="button" onClick={() => void loadPanel()} className="ml-3 underline">Försök igen</button></div>
  }

  if (unsupportedYear || !taxRules) {
    return (
      <div className="rounded-2xl border-2 border-amber-200 bg-amber-50 p-6 shadow-sm">
        <p className="text-[11px] font-black uppercase tracking-widest text-amber-700">
          Året stöds inte än
        </p>
        <p className="mt-2 text-sm font-bold text-amber-800">
          SoloLedger saknar fastställda inventarieregler för {selectedYear}. Bokning stoppas hellre än att återanvända ett gammalt prisbasbelopp.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[11px] font-black uppercase tracking-widest text-gray-400">
                Köp av utrustning
              </p>
              <h2 className="mt-1 text-lg font-black text-gray-900">
                Nytt köp
              </h2>
            </div>
            <div className="rounded-xl bg-emerald-50 px-3 py-2 text-right">
              <p className="text-[10px] font-black uppercase text-emerald-700">
                {selectedYear}
              </p>
              <p className="text-xs font-bold text-emerald-800">
                Halvt PBB {formatMoney(taxRules.halfPriceBaseAmount)} kr <HelpHint text={`Beloppsgränsen följer regelåret ${taxRules.taxYear}. Mindre värde kräver ett belopp strikt under ${formatMoney(taxRules.halfPriceBaseAmount)} kr exklusive fakturamoms. Ej avdragsgill moms ingår ändå i bokförd kostnad eller tillgång.`} />
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="space-y-1 text-xs font-bold text-gray-600">
              Datum
              <input
                type="date"
                value={acquisitionDate}
                onChange={(event) => setAcquisitionDate(event.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-bold text-gray-800 outline-none focus:border-emerald-400"
                required
              />
            </label>

            <label className="space-y-1 text-xs font-bold text-gray-600">
              Leverantörsland
              <select aria-label="Leverantörsland"
                value={supplierCountry}
                onChange={(event) =>
                  setSupplierCountry(event.target.value === 'SE' ? 'SE' : 'foreign')
                }
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-bold text-gray-800 outline-none focus:border-emerald-400"
              >
                <option value="SE">Sverige</option>
                <option value="foreign">Annat land</option>
              </select>
            </label>

            <label className="space-y-1 text-xs font-bold text-gray-600 sm:col-span-2">
              Beskrivning
              <input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Kamera, objektiv, dator..."
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-bold text-gray-800 outline-none focus:border-emerald-400"
                required
              />
            </label>

            <label className="space-y-1 text-xs font-bold text-gray-600">
              Belopp inkl. moms
              <input
                inputMode="decimal"
                value={grossAmount}
                onChange={(event) => setGrossAmount(event.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-bold text-gray-800 outline-none focus:border-emerald-400"
                required
              />
            </label>

            <label className="space-y-1 text-xs font-bold text-gray-600">
              Moms på fakturan
              <select aria-label="Moms på fakturan"
                value={vatRate}
                onChange={(event) => {
                  const nextRate = Number(event.target.value)
                  if (isFixedAssetVatRate(nextRate)) {
                    setVatRate(nextRate)
                  }
                }}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-bold text-gray-800 outline-none focus:border-emerald-400"
              >
                {fixedAssetVatRates.map(rate => (
                  <option key={rate} value={rate}>
                    {rate} %
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-xs font-bold text-gray-600">
              Momsavdrag
              <select aria-label="Momsavdrag"
                value={effectiveVatDeductionEntitlement}
                onChange={(event) =>
                  setVatDeductionEntitlement(
                    event.target.value as FixedAssetVatDeductionEntitlement
                  )
                }
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-bold text-gray-800 outline-none focus:border-emerald-400"
              >
                {allowedVatDeductionOptions.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              {vatDeductionNotice && (
                <span className="block text-[11px] leading-relaxed text-amber-700">
                  {vatDeductionNotice}
                </span>
              )}
            </label>

            <label className="space-y-1 text-xs font-bold text-gray-600">
              Betalning
              <select aria-label="Betalning"
                value={paymentSource}
                onChange={(event) =>
                  setPaymentSource(event.target.value as PaymentSourceChoice)
                }
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-bold text-gray-800 outline-none focus:border-emerald-400"
              >
                <option value="business_account">Företagets konto</option>
                <option value="owner_private">Privat betalning</option>
              </select>
            </label>
          </div>

          <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div className="flex items-center gap-2">
              <p className="text-xs font-black uppercase tracking-widest text-gray-500">
                Samband med annan utrustning
              </p>
              <HelpHint text="Utrustning som hör ihop och köps för gemensam användning under samma beskattningsår kan behöva bedömas som ett paket, även vid delleveranser. Välj tidigare delar som hör till paketet. Inköp från olika år grupperas inte automatiskt." />
            </div>
            <div className="mt-3 grid gap-2">
              {[
                ['standalone', 'Fristående köp'],
                ['connected', 'Del av paket, delleverans eller ihopkopplat köp'],
                ['uncertain', 'Osäkert'],
              ].map(([value, label]) => (
                <label key={value} className="flex items-start gap-3 text-sm font-bold text-gray-700">
                  <input
                    type="radio"
                    name="fixed-asset-connection"
                    value={value}
                    checked={connectionAssessment === value}
                    onChange={() => {
                      setConnectionAssessment(value as FixedAssetConnectionAssessment)
                      if (value !== 'connected') {
                        setConnectedAssetIds([])
                        setPlannedGroupBasisAmount('')
                        setAcquisitionGroupName('')
                      }
                    }}
                    className="mt-1 h-4 w-4 accent-emerald-600"
                    required
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>

            {connectionAssessment === 'connected' && (
              <div className="mt-4 space-y-4">
                <label className="block space-y-1 text-xs font-bold text-gray-600">
                  <span className="inline-flex items-center gap-2">
                    Gruppnamn
                    <HelpHint text="Namnet hjälper dig känna igen paketet i efterhand. Exempel: Kamerapaket, datorarbetsplats eller ljudrigg." />
                  </span>
                  <input
                    value={acquisitionGroupName}
                    onChange={(event) => setAcquisitionGroupName(event.target.value)}
                    placeholder="Kamerapaket"
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-bold text-gray-800 outline-none focus:border-emerald-400"
                  />
                </label>

                <label className="block space-y-1 text-xs font-bold text-gray-600">
                  <span className="inline-flex items-center gap-2">
                    Planerat paketbelopp exklusive fakturamoms
                    <HelpHint text="Ange hela paketets belopp exklusive fakturamoms. Ta inte med bekräftade korttidsinventarier. Vid osäkert samband ska köpet stoppas för kontroll." />
                  </span>
                  <input
                    inputMode="decimal"
                    value={plannedGroupBasisAmount}
                    onChange={(event) => setPlannedGroupBasisAmount(event.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-bold text-gray-800 outline-none focus:border-emerald-400"
                  />
                </label>

                <div className="space-y-2">
                  <p className="text-xs font-bold text-gray-600">
                    Koppla tidigare registrerade delar
                  </p>
                  <p className="text-xs font-bold leading-relaxed text-gray-500">
                    Kopplingen ändrar inte den gamla verifikationen. Om paketet ska aktiveras skapar SoloLedger en separat omklassning för tidigare kostnadsförda delar.
                  </p>
                  {priorConnectableAssets.length === 0 ? (
                    <p className="text-xs font-bold text-gray-500">
                      Inga tidigare inventarieköp finns att koppla för året.
                    </p>
                  ) : (
                    <div className="max-h-40 space-y-2 overflow-auto rounded-xl border border-gray-200 bg-white p-3">
                      {priorConnectableAssets.map(asset => (
                        <label key={asset.id} className="flex items-start gap-3 text-xs font-bold text-gray-700">
                          <input
                            type="checkbox"
                            checked={connectedAssetIds.includes(asset.id)}
                            onChange={(event) =>
                              setConnectedAssetIds(current =>
                                event.target.checked
                                  ? [...current, asset.id]
                                  : current.filter(id => id !== asset.id)
                              )
                            }
                            className="mt-1 h-4 w-4 accent-emerald-600"
                          />
                          <span>
                            {asset.description} · {formatMoney(asset.taxableBaseAmount)} kr · {asset.acquisitionDate}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {showUsefulLifeQuestion && (
            <div className="mt-4 block space-y-1 text-xs font-bold text-gray-600">
              <div>Beräknad ekonomisk livslängd (valfritt under beloppsgränsen) <HelpHint text="Hur länge utrustningen beräknas vara användbar i verksamheten. Högst tre år kan ge direktavdrag även över beloppsgränsen. Välj inte kort livslängd om det är osäkert." /></div>
              <select aria-label="Beräknad ekonomisk livslängd"
                value={usefulLifeAnswer}
                onChange={(event) =>
                  setUsefulLifeAnswer(event.target.value as FixedAssetUsefulLifeAnswer)
                }
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-bold text-gray-800 outline-none focus:border-emerald-400"
                required={decision?.status === 'needs_useful_life'}
              >
                <option value="">Välj</option>
                <option value="max_three_years">Högst tre år</option>
                <option value="more_than_three_years_or_unknown">Mer än tre år eller osäkert</option>
              </select>
            </div>
          )}

          {purchaseBlockReason && <p role={groupAssessment.error ? "alert" : "status"} className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Ingen bokföring kan göras ännu: {purchaseBlockReason}</p>}
          {decision?.status === 'ready' && !purchaseBlockReason && (
            <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50 p-4">
              <p className="text-[11px] font-black uppercase tracking-widest text-emerald-700">
                Förhandsbedömning <HelpHint text="Direkt kostnad minskar resultatet vid köpet. En aktiverad inventarie bokförs som tillgång; resultatet påverkas senare genom avskrivning." />
              </p>
              <p className="mt-1 text-sm font-black text-emerald-900">
                {decisionLabel(decision.decisionType)}
              </p>
              <p className="mt-2 text-xs font-bold text-emerald-800">
                Faktura {formatMoney(decision.grossAmount)} kr inkl. moms · Underlag {formatMoney(decision.taxableBaseAmount)} kr · Fakturamoms {formatMoney(decision.supplierVatAmount)} kr ({decision.vatRate} %)
              </p>
              <ul className="mt-3 space-y-2 text-sm text-emerald-950" aria-label="Det händer när du bokför">
                <li>{paymentSource === 'owner_private'
                  ? <>Du betalar privat {formatMoney(decision.totalPaidAmount)} kr. Egen insättning bokförs på {configuredPaymentRole?.accountNumber}; företagets bankkonto påverkas inte.</>
                  : <>Företagets betalningskonto {configuredPaymentRole?.accountNumber} minskar med {formatMoney(decision.totalPaidAmount)} kr.</>}</li>
                <li>{decision.deductibleVatAmount > 0 ? <>Avdragsgill moms: {formatMoney(decision.deductibleVatAmount)} kr tas med i momsrapporten.</> : <>Momsavdrag: 0 kr. Ingen ingående moms dras av.</>}</li>
                <li>{decision.decisionType === 'capitalized'
                  ? <>Inventarievärdet ökar med {formatMoney(decision.capitalizedAmount)} kr. Köpet ger ingen kostnad i resultatet direkt.</>
                  : <>Kostnad direkt: {formatMoney(decision.expensedAmount)} kr. Årets resultat minskar med samma belopp.</>}</li>
                {decision.nonDeductibleVatAmount > 0 && <li className="text-xs">Fakturamoms som inte får dras av, {formatMoney(decision.nonDeductibleVatAmount)} kr, ingår i {decision.decisionType === 'capitalized' ? 'inventarievärdet' : 'kostnaden'} ovan.</li>}
              </ul>
              <p className="mt-1 text-xs font-bold text-emerald-800">
                Bedömningsvärde exklusive fakturamoms: {formatMoney(decision.thresholdBasisAmount)} kr <HelpHint text={`Mindre värde kräver ett belopp strikt under halvt prisbasbelopp: ${formatMoney(taxRules.halfPriceBaseAmount)} kr för ${taxRules.taxYear}. Paket bedöms tillsammans för samma år. Ej avdragsgill moms ingår i bokfört värde men inte i denna gränsprövning.`} />
              </p>
            </div>
          )}

          {decision?.status === 'ready' && decision.decisionType === 'capitalized' && groupAssessment.value && groupAssessment.value.reclassificationAmount > 0 && (
            <p className="mt-3 text-sm font-bold text-amber-800">Tidigare direktkostnadsförda delar: {formatMoney(groupAssessment.value.reclassificationAmount)} kr flyttas från kostnad till inventarievärde. Tidigare kostnader minskar och årets resultat ökar med det beloppet, genom en separat verifikation. Ingen ny betalning eller moms uppstår; originalköpen ändras inte. Bekräftade korttidsinventarier behåller sitt direktavdrag.</p>
          )}
          {connectionAssessment &&
            connectionAssessment !== 'uncertain' &&
            !hasValidPurchaseAmount && (
              <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
                <p className="text-[11px] font-black uppercase tracking-widest text-gray-500">
                  Förhandsbedömning
                </p>
                <p className="mt-1 text-sm font-bold text-gray-600">
                  Ange inköpsbelopp inklusive moms så visar SoloLedger om köpet kan kostnadsföras direkt eller ska bli inventarie.
                </p>
              </div>
            )}

          {supplierCountry !== 'SE' && (
            <div className="mt-4 rounded-xl border-2 border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">
              Endast svenska varuköp stöds här. Köp från utlandet behöver hanteras separat.
            </div>
          )}

          {message && (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">
              {message}
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-xl border-2 border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
              {error}
            </div>
          )}

          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs font-bold text-gray-500">
              {configuredPaymentRole
                ? `Betalningskonto ${configuredPaymentRole.accountNumber}`
                : 'Betalningskonto behöver vara valt i Profil.'}
            </div>
            <div className="flex gap-2">
              {!configuredPaymentRole && (
                <button
                  type="button"
                  onClick={onOpenPaymentAccountSettings}
                  className="h-10 rounded-xl border border-blue-200 bg-blue-50 px-4 text-[10px] font-black uppercase tracking-wider text-blue-700 hover:bg-blue-100"
                >
                  Öppna Profil
                </button>
              )}
              <button
                type="button"
                onClick={onRefreshPaymentAccountRoles}
                className="h-10 rounded-xl border border-gray-200 bg-white px-4 text-[10px] font-black uppercase tracking-wider text-gray-500 hover:bg-gray-50"
              >
                Uppdatera konton
              </button>
              <button
                type="submit"
                disabled={saving || purchaseBlockReason !== null}
                className="h-10 rounded-xl bg-emerald-600 px-5 text-[10px] font-black uppercase tracking-wider text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                Bokför
              </button>
            </div>
          </div>
        </form>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-[11px] font-black uppercase tracking-widest text-gray-400">
            Årsavskrivning
          </p>
          <h2 className="mt-1 text-lg font-black text-gray-900">
            K1 kollektivt underlag <HelpHint text="Årsavskrivning görs normalt vid årsbokslutet när årets inventarieinköp är klara. K1 bedömer det samlade kvarvarande värdet. Det granskade underlaget avgör om hela beloppet eller 30 procent skrivs av." />
          </h2>

          {depreciationPreview?.status === 'blocked' ? (
            <p role="alert" className="mt-5 text-sm font-bold text-amber-800">{depreciationPreview.reason}</p>
          ) : latestRun ? (
            <div className="mt-5 rounded-xl border border-emerald-100 bg-emerald-50 p-4">
              <p className="text-sm font-black text-emerald-900">
                Avskrivning för {selectedYear} är bokförd
              </p>
              <p className="mt-1 text-xs font-bold text-emerald-800">
                {formatMoney(latestRun.depreciationAmount)} kr · {depreciationMethodLabel(latestRun.method)}
              </p>
            </div>
          ) : estimatedDepreciation ? (
            <div className="mt-5 space-y-4">
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <p className="text-xs font-bold text-gray-500">Beräknat underlag</p>
                <p className="mt-1 text-2xl font-black text-gray-900">
                  {formatMoney(estimatedDepreciation.basis)} kr
                </p>
                <p className="mt-1 text-xs font-bold text-gray-600">
                  Preliminär avskrivning {formatMoney(estimatedDepreciation.depreciationAmount)} kr · {depreciationMethodLabel(estimatedDepreciation.method)}
                </p>
              </div>
              <p className="text-sm text-gray-700">Årets resultat och bokfört inventarievärde minskar med {formatMoney(estimatedDepreciation.depreciationAmount)} kr. Ingen ny bankbetalning görs och momsen påverkas inte.</p>
              <button
                type="button"
                onClick={handleDepreciation}
                disabled={saving || isYearLocked || !normalYearConfirmed}
                className="h-10 w-full rounded-xl bg-gray-900 px-4 text-[10px] font-black uppercase tracking-wider text-white hover:bg-black disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                Bokför årsavskrivning
              </button>
              <div className="flex items-start gap-2"><label className="flex gap-2 text-xs font-bold text-gray-600">
                <input type="checkbox" checked={normalYearConfirmed} onChange={event => setNormalYearConfirmed(event.target.checked)} />
                Jag bekräftar att räkenskapsåret är 1 januari–31 december, tolv månader, och att årets inventarieköp är färdiga. Beloppet ovan ska bokföras per 31 december. Senare aktivering och automatisk rättelse av årets avskrivning stöds inte.</label> <HelpHint text="Årtalet i registret bevisar inte årslängden. Bekräfta att året verkligen är tolv månader, 1 januari–31 december, och att alla årets inventarieköp är klara. Bokningen fastställer underlaget; senare aktiveringar eller omklassningar som påverkar det spärras. Automatisk rättelse stöds inte." />
              </div>
            </div>
          ) : (
            <p className="mt-5 text-sm font-bold text-gray-500">
              Det finns inget aktivt inventarieunderlag att skriva av för {selectedYear}.
            </p>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-widest text-gray-400">
              Register
            </p>
            <h2 className="mt-1 text-lg font-black text-gray-900">
              Inventarier till och med {selectedYear} <HelpHint text="Inte längre i bruk ändrar bara registerstatus för direktkostnadsförd utrustning. Ingen försäljning, kreditnota eller bokföringsrättelse skapas. Aktiverade tillgångar kan inte avslutas i detta flöde." />
            </h2>
          </div>
        </div>

        {assets.length === 0 ? (
          <p className="mt-5 text-sm font-bold text-gray-500">
            Inga inventarier registrerade än.
          </p>
        ) : (
          <>
            {totalCapitalizedAcquisitionValue > 0 && (
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">
                    Anskaffningsvärde
                  </p>
                  <p className="mt-1 text-lg font-black text-gray-900">
                    {formatMoney(totalCapitalizedAcquisitionValue)} kr
                  </p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">
                    Bokförda avskrivningar
                  </p>
                  <p className="mt-1 text-lg font-black text-gray-900">
                    {formatMoney(totalBookedDepreciation)} kr
                  </p>
                </div>
                <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4">
                  <p className="text-[10px] font-black uppercase tracking-wider text-emerald-700">
                    Bokfört värde kollektivt
                  </p>
                  <p className="mt-1 text-lg font-black text-emerald-900">
                    {collectiveBookValue == null ? 'Kräver kontroll' : `${formatMoney(collectiveBookValue)} kr`}
                  </p>
                </div>
              </div>
            )}

            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-[10px] font-black uppercase tracking-wider text-gray-400">
                  <th className="py-3 pr-4">Datum</th>
                  <th className="py-3 pr-4">Inventarie</th>
                  <th className="py-3 pr-4">Beslut</th>
                  <th className="py-3 pr-4 text-right">Kostnad</th>
                  <th className="py-3 pr-4 text-right">Anskaffningsvärde</th>
                  <th className="py-3 pr-4">Status</th>
                  <th className="py-3 text-right">Åtgärd</th>
                </tr>
              </thead>
              <tbody>
                {assets.map(asset => (
                  <tr key={asset.id} className="border-b border-gray-50 font-bold text-gray-700">
                    <td className="py-3 pr-4">{asset.acquisitionDate}</td>
                    <td className="py-3 pr-4">
                      <div className="font-black text-gray-900">{asset.description}</div>
                      <div className="text-xs text-gray-400">
                        {paymentSourceLabels[
                          asset.paymentAccountRole === 'owner_private_payment'
                            ? 'owner_private'
                            : 'business_account'
                        ]} · regel {asset.ruleYear}
                      </div>
                    </td>
                    <td className="py-3 pr-4">{decisionLabel(asset.decisionType)}</td>
                    <td className="py-3 pr-4 text-right tabular-nums">
                      {formatMoney(asset.expensedAmount)}
                    </td>
                    <td className="py-3 pr-4 text-right tabular-nums">
                      {formatMoney(asset.capitalizedAmount)}
                    </td>
                    <td className="py-3 pr-4">
                      {asset.assetStatus === 'active'
                        ? 'Aktiv'
                        : asset.assetStatus === 'retired'
                          ? 'Avslutad'
                          : 'Direkt kostnadsförd'}
                    </td>
                    <td className="py-3 text-right">
                      {asset.assetStatus === 'expensed' ? (
                        <button
                          type="button"
                          title="Ändrar bara registerstatus. Ingen försäljning, kreditnota eller bokföringsrättelse skapas."
                          onClick={() => void handleRetire(asset)}
                          disabled={saving || isYearLocked}
                          className="rounded-lg border border-gray-200 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:bg-gray-100"
                        >
                          Inte längre i bruk
                        </button>
                      ) : (
                        <span className="text-xs font-bold text-gray-400">
                          Avyttring stöds inte
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
