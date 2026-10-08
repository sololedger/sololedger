'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  bookFixedAssetAcquisition,
  bookFixedAssetDepreciation,
  getFixedAssetDepreciationRuns,
  getFixedAssets,
  getTaxRuleParametersForYear,
  retireFixedAsset,
} from '@/lib/accountingService'
import {
  calculateFixedAssetDecision,
  calculateK1CollectiveDepreciation,
  type FixedAsset,
  type FixedAssetConnectionAssessment,
  type FixedAssetDepreciationRun,
  type FixedAssetTaxRuleParameters,
  type FixedAssetUsefulLifeAnswer,
  type FixedAssetVatDeductionEntitlement,
} from '@/lib/fixedAssets'
import type { PaymentAccountRole } from '@/lib/paymentAccountRoles'
import type { ConfiguredPaymentAccountRole } from '@/lib/paymentAccountRoles'
import type { CompanyVatProfileAdapterResult } from '@/lib/vatProfileAdapter'

type PaymentSourceChoice = 'business_account' | 'owner_private'

interface FixedAssetsPanelProps {
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

export default function FixedAssetsPanel({
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
  const [taxRules, setTaxRules] = useState<FixedAssetTaxRuleParameters | null>(null)
  const [assets, setAssets] = useState<FixedAsset[]>([])
  const [depreciationRuns, setDepreciationRuns] = useState<FixedAssetDepreciationRun[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [unsupportedYear, setUnsupportedYear] = useState<string | null>(null)

  const [description, setDescription] = useState('')
  const [acquisitionDate, setAcquisitionDate] = useState(dateInYear(selectedYear))
  const [supplierCountry, setSupplierCountry] = useState<'SE' | 'foreign'>('SE')
  const [taxableBaseAmount, setTaxableBaseAmount] = useState('')
  const [supplierVatAmount, setSupplierVatAmount] = useState('')
  const [vatDeductionEntitlement, setVatDeductionEntitlement] =
    useState<FixedAssetVatDeductionEntitlement>(
      companyVatProfileResult.profile.defaultDeductionEntitlement === 'none'
        ? 'none'
        : 'full'
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
    setLoading(true)
    setError(null)
    setUnsupportedYear(null)

    try {
      const [rules, assetRows, runRows] = await Promise.all([
        getTaxRuleParametersForYear(selectedYear),
        getFixedAssets(selectedYear),
        getFixedAssetDepreciationRuns(selectedYear),
      ])
      setTaxRules(rules)
      setAssets(assetRows)
      setDepreciationRuns(runRows)
    } catch (err) {
      setTaxRules(null)
      setUnsupportedYear(
        err instanceof Error ? err.message : 'Skatteregeln för året saknas.'
      )
    } finally {
      setLoading(false)
    }
  }, [selectedYear])

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void loadPanel()
    }, 0)

    return () => window.clearTimeout(handle)
  }, [loadPanel])

  const paymentRole = paymentSourceRole[paymentSource]
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
  const selectedConnectedAssets = useMemo(
    () => priorConnectableAssets.filter(asset => connectedAssetIds.includes(asset.id)),
    [connectedAssetIds, priorConnectableAssets]
  )
  const previewThresholdBasisAmount = useMemo(() => {
    const currentAmount = parseAmount(taxableBaseAmount)
    if (connectionAssessment !== 'connected') return currentAmount

    const priorBasis = selectedConnectedAssets.reduce(
      (sum, asset) =>
        sum +
        (asset.decisionType === 'immediate_expense_short_life'
          ? 0
          : asset.taxableBaseAmount),
      0
    )
    const plannedBasis = parseAmount(plannedGroupBasisAmount)
    return Math.max(currentAmount + priorBasis, plannedBasis)
  }, [
    connectionAssessment,
    plannedGroupBasisAmount,
    selectedConnectedAssets,
    taxableBaseAmount,
  ])

  const decision = useMemo(() => {
    if (!taxRules) return null
    if (connectionAssessment === '' || connectionAssessment === 'uncertain') return null

    try {
      return calculateFixedAssetDecision(
        {
          taxableBaseAmount: parseAmount(taxableBaseAmount),
          supplierVatAmount: parseAmount(supplierVatAmount),
          vatDeductionEntitlement,
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
    previewThresholdBasisAmount,
    supplierVatAmount,
    taxRules,
    taxableBaseAmount,
    usefulLifeAnswer,
    vatDeductionEntitlement,
  ])

  const capitalizedAssets = assets.filter(
    asset => asset.assetStatus === 'active' && asset.capitalizedAmount > 0
  )
  const latestRun = depreciationRuns.find(run => run.fiscalYear === selectedYear)
  const estimatedDepreciation = useMemo(() => {
    if (!taxRules) return null
    const basis = capitalizedAssets.reduce(
      (sum, asset) => sum + asset.capitalizedAmount,
      0
    )
    if (basis <= 0) return null

    return {
      basis,
      ...calculateK1CollectiveDepreciation({ depreciationBasis: basis, taxRules }),
    }
  }, [capitalizedAssets, taxRules])

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

    if (decision?.status === 'needs_useful_life') {
      setError('Ange om utrustningen beräknas användas högst tre år.')
      return
    }

    setSaving(true)
    try {
      const acquisitionInput = {
        date: acquisitionDate,
        description,
        supplierCountry: 'SE' as const,
        paymentAccountRole: paymentRole,
        vatDeductionEntitlement,
        taxableBaseAmount: parseAmount(taxableBaseAmount),
        supplierVatAmount: parseAmount(supplierVatAmount),
        thresholdBasisAmount: previewThresholdBasisAmount,
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

      const result = await bookFixedAssetAcquisition({
        ...acquisitionInput,
        idempotencyKey: acquisitionSubmissionRef.current.key,
      })

      setMessage(
        `${result.idempotentReplay ? 'Inventariet var redan bokfört' : 'Bokfört'} som ${decisionLabel(result.decisionType)}. Verifikation ${result.verNr}.`
      )
      acquisitionSubmissionRef.current = null
      setDescription('')
      setTaxableBaseAmount('')
      setSupplierVatAmount('')
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
      const result = await bookFixedAssetDepreciation(selectedYear)
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
      setMessage('Inventariet markerades som avslutat.')
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
                Nytt inventarie
              </h2>
            </div>
            <div className="rounded-xl bg-emerald-50 px-3 py-2 text-right">
              <p className="text-[10px] font-black uppercase text-emerald-700">
                {selectedYear}
              </p>
              <p className="text-xs font-bold text-emerald-800">
                Halvt PBB {formatMoney(taxRules.halfPriceBaseAmount)} kr
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
              <select
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
              Belopp exkl. moms
              <input
                inputMode="decimal"
                value={taxableBaseAmount}
                onChange={(event) => setTaxableBaseAmount(event.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-bold text-gray-800 outline-none focus:border-emerald-400"
                required
              />
            </label>

            <label className="space-y-1 text-xs font-bold text-gray-600">
              Moms på fakturan
              <input
                inputMode="decimal"
                value={supplierVatAmount}
                onChange={(event) => setSupplierVatAmount(event.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-bold text-gray-800 outline-none focus:border-emerald-400"
              />
            </label>

            <label className="space-y-1 text-xs font-bold text-gray-600">
              Momsavdrag
              <select
                value={vatDeductionEntitlement}
                onChange={(event) =>
                  setVatDeductionEntitlement(
                    event.target.value as FixedAssetVatDeductionEntitlement
                  )
                }
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-bold text-gray-800 outline-none focus:border-emerald-400"
              >
                <option value="full">Fullt momsavdrag</option>
                <option value="none">Inget momsavdrag</option>
              </select>
            </label>

            <label className="space-y-1 text-xs font-bold text-gray-600">
              Betalning
              <select
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
            <p className="text-xs font-black uppercase tracking-widest text-gray-500">
              Samband med annan utrustning
            </p>
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
                  Gruppnamn
                  <input
                    value={acquisitionGroupName}
                    onChange={(event) => setAcquisitionGroupName(event.target.value)}
                    placeholder="Kamerapaket"
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-bold text-gray-800 outline-none focus:border-emerald-400"
                  />
                </label>

                <label className="block space-y-1 text-xs font-bold text-gray-600">
                  Känt samlat belopp exkl. moms om hela paketet redan är känt
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

          {decision?.status === 'needs_useful_life' && (
            <label className="mt-4 block space-y-1 text-xs font-bold text-gray-600">
              Beräknad användningstid
              <select
                value={usefulLifeAnswer}
                onChange={(event) =>
                  setUsefulLifeAnswer(event.target.value as FixedAssetUsefulLifeAnswer)
                }
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-bold text-gray-800 outline-none focus:border-emerald-400"
                required
              >
                <option value="">Välj</option>
                <option value="max_three_years">Högst tre år</option>
                <option value="more_than_three_years_or_unknown">Mer än tre år eller osäkert</option>
              </select>
            </label>
          )}

          {decision?.status === 'ready' && (
            <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50 p-4">
              <p className="text-[11px] font-black uppercase tracking-widest text-emerald-700">
                Förhandsbedömning
              </p>
              <p className="mt-1 text-sm font-black text-emerald-900">
                {decisionLabel(decision.decisionType)}
              </p>
              <p className="mt-1 text-xs font-bold text-emerald-800">
                Kostnad {formatMoney(decision.expensedAmount)} kr · Inventarievärde {formatMoney(decision.capitalizedAmount)} kr · Momsavdrag {formatMoney(decision.deductibleVatAmount)} kr
              </p>
            </div>
          )}

          {supplierCountry !== 'SE' && (
            <div className="mt-4 rounded-xl border-2 border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">
              Utländska varuköp stoppas i KAN-36 och hanteras först när EU-varuflödet finns.
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
                disabled={saving || isYearLocked || supplierCountry !== 'SE'}
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
            K1 kollektivt underlag
          </h2>

          {latestRun ? (
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
              <button
                type="button"
                onClick={handleDepreciation}
                disabled={saving || isYearLocked}
                className="h-10 w-full rounded-xl bg-gray-900 px-4 text-[10px] font-black uppercase tracking-wider text-white hover:bg-black disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                Bokför årsavskrivning
              </button>
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
              Inventarier till och med {selectedYear}
            </h2>
          </div>
        </div>

        {assets.length === 0 ? (
          <p className="mt-5 text-sm font-bold text-gray-500">
            Inga inventarier registrerade än.
          </p>
        ) : (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-[10px] font-black uppercase tracking-wider text-gray-400">
                  <th className="py-3 pr-4">Datum</th>
                  <th className="py-3 pr-4">Inventarie</th>
                  <th className="py-3 pr-4">Beslut</th>
                  <th className="py-3 pr-4 text-right">Kostnad</th>
                  <th className="py-3 pr-4 text-right">Inventarievärde</th>
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
                          onClick={() => void handleRetire(asset)}
                          disabled={saving || isYearLocked}
                          className="rounded-lg border border-gray-200 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:bg-gray-100"
                        >
                          Avsluta
                        </button>
                      ) : (
                        <span className="text-xs font-bold text-gray-400">
                          Avyttring stöds inte i V1
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
