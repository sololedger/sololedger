'use client'
import { useState, type FormEvent } from 'react'
import FavoriteChips, { Favorite } from './FavoriteChips'
import type { CompanyVatProfileAdapterResult } from '@/lib/vatProfileAdapter'
import type {
  VatCalculationRateInput,
  VatGoodsOrService,
  VatYesNoUnknown,
} from '@/lib/vatDomain'
import {
  buildVatV2TransactionPreflight,
  describeVatV2PreflightError,
  VAT_V2_SUPPLIER_COUNTRIES,
  type VatV2SupplierCountryInput,
  type VatV2TransactionFacts,
} from '@/lib/vatTransactionPreflight'

export interface FormData {
  date: string
  description: string
  amount: string
  type: string
  vatRate: number
  file: File | null
}

interface KontoplanOption {
  id: string
  name: string
  default_vat_rate?: number | string | null
  credit_account?: string | null
}

interface TransactionFormProps {
  formData: FormData
  setFormData: (data: FormData) => void
  kontoplan: KontoplanOption[]
  isYearLocked: boolean
  editingId: string | null
  editingBooked: boolean
  uploading: boolean
  periodisera: boolean
  setPeriodisera: (val: boolean) => void
  periodMonth: string
  setPeriodMonth: (val: string) => void
  onSubmit: (e: FormEvent<HTMLFormElement>) => void
  onCancelEdit: () => void
  userId: string
  vatStatus: 'registered' | 'not_registered' | 'unknown'
  companyVatProfileResult: CompanyVatProfileAdapterResult
  lastSubmitted: { type: string; amount: string; vatRate: number } | null
  onSaveFavorite: (name: string) => Promise<void>
  onDismissFavorite: () => void
}

const initialVatV2Facts: VatV2TransactionFacts = {
  enabled: false,
  supplierCountry: 'unknown',
  goodsOrService: 'unknown',
  supplierVatCharged: 'unknown',
  calculationRate: 'unknown',
  acquisitionBaseAmount: '',
}

export default function TransactionForm({
  formData,
  setFormData,
  kontoplan,
  isYearLocked,
  editingId,
  editingBooked,
  uploading,
  periodisera,
  setPeriodisera,
  periodMonth,
  setPeriodMonth,
  onSubmit,
  onCancelEdit,
  userId,
  vatStatus,
  companyVatProfileResult,
  lastSubmitted,
  onSaveFavorite,
  onDismissFavorite,
}: TransactionFormProps) {
  const [favName, setFavName] = useState('')
  const [showFavInput, setShowFavInput] = useState(false)
  const [descriptionHighlight, setDescriptionHighlight] = useState(false)
  const [favRefreshKey, setFavRefreshKey] = useState(0)
  const [vatV2Facts, setVatV2Facts] =
    useState<VatV2TransactionFacts>(initialVatV2Facts)
  const isNotVatRegistered = vatStatus === 'not_registered'
  const showVatV2Assessment = !editingId && !editingBooked
  const vatV2AssessmentEnabled =
    showVatV2Assessment && vatV2Facts.enabled
  const vatV2Preflight = buildVatV2TransactionPreflight({
    companyProfile: companyVatProfileResult.profile,
    transaction: {
      ...vatV2Facts,
      enabled: vatV2AssessmentEnabled,
    },
    date: formData.date,
    description: formData.description,
    accountingCategoryId: formData.type,
    ordinaryAmount: formData.amount,
  })

  function updateVatV2Facts(update: Partial<VatV2TransactionFacts>) {
    setVatV2Facts(prev => ({
      ...prev,
      ...update,
    }))
  }

  function handleVatV2Submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    e.stopPropagation()
  }

  function handleFavoriteSelect(fav: Favorite) {
    setFormData({
      ...formData,
      type: fav.type,
      amount: fav.amount.toString(),
      vatRate: isNotVatRegistered ? 0 : fav.vat_rate,
      description: '',
    })
    setDescriptionHighlight(true)
    setTimeout(() => setDescriptionHighlight(false), 2000)
  }

  async function handleSaveFav() {
    if (!favName.trim()) return
    await onSaveFavorite(favName.trim())
    setFavName('')
    setShowFavInput(false)
    setFavRefreshKey(k => k + 1)
  }

  return (
    <div
      className={`bg-white rounded-[2.5rem] border p-4 sm:p-8 mb-6 shadow-sm transition-all ${
        editingId
          ? 'border-amber-300 shadow-amber-100'
          : 'border-gray-100'
      }`}
    >
      {/* Favorit-chips — visas bara när man inte redigerar */}
      {!editingId && (
        <FavoriteChips
          userId={userId}
          onSelect={handleFavoriteSelect}
          refreshKey={favRefreshKey}
        />
      )}

      <form onSubmit={vatV2AssessmentEnabled ? handleVatV2Submit : onSubmit}>
        {editingBooked ? (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-100 bg-amber-50/60 px-5 py-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-wide text-amber-600">
                Hantera bilaga
              </p>

              <p className="mt-1 text-[10px] font-medium text-gray-500">
                Verifikationen är bokförd och låst. Här kan du komplettera eller byta bilaga.
              </p>
            </div>

            {/* Avbryt här uppe — endast desktop */}
            <button
              type="button"
              onClick={onCancelEdit}
              className="hidden lg:block text-[10px] font-black uppercase text-gray-400 hover:text-gray-600 transition-colors"
            >
              Avbryt
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-12 gap-3 items-end mb-4">

            {/* Datum */}
            <div className="lg:col-span-2 flex flex-col gap-1">
              <label className="text-[9px] font-black text-gray-500 uppercase ml-1">
                Datum
              </label>

              <input
                type="date"
                value={formData.date}
                disabled={editingBooked || isYearLocked}
                onChange={e =>
                  setFormData({
                    ...formData,
                    date: e.target.value,
                  })
                }
                className={`p-3 rounded-xl outline-none font-bold text-xs ${
                  editingBooked || isYearLocked
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-gray-50'
                } ${isYearLocked ? 'opacity-40' : ''}`}
                required
              />
            </div>

            {/* Kategori */}
            <div className="lg:col-span-3 flex flex-col gap-1">
              <label className="text-[9px] font-black text-gray-500 uppercase ml-1">
                Kategori
              </label>

              <select
                value={formData.type}
                onChange={e => {
                  const acc = kontoplan.find(
                    k => k.id === e.target.value
                  )

                  setFormData({
                    ...formData,
                    type: e.target.value,
                    vatRate: isNotVatRegistered
                      ? 0
                      : Number(acc?.default_vat_rate) || 0,
                  })
                }}
                disabled={editingBooked || isYearLocked}
                className={`p-3 rounded-xl outline-none font-bold text-xs ${
                  editingBooked || isYearLocked
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-gray-50 cursor-pointer'
                } ${isYearLocked ? 'opacity-40' : ''}`}
              >
                {(() => {
                  const income = kontoplan.filter(
                    k =>
                      k.credit_account?.startsWith('3')
                  )

                  const special = kontoplan.filter(
                    k =>
                      k.id === 'ingående_balans' ||
                      k.id === 'skattekonto_default' ||
                      k.id === 'egen_insättning' ||
                      k.id === 'eget_uttag' ||
                      k.id === 'periodisering'
                  )

                  const costs = kontoplan.filter(
                    k =>
                      !income.includes(k) &&
                      !special.includes(k)
                  )

                  return (
                    <>
                      <optgroup label="── Intäkter ──">
                        {income.map(item => (
                          <option
                            key={item.id}
                            value={item.id}
                          >
                            {item.name}
                          </option>
                        ))}
                      </optgroup>

                      <optgroup label="── Kostnader ──">
                        {costs.map(item => (
                          <option
                            key={item.id}
                            value={item.id}
                          >
                            {item.name}
                          </option>
                        ))}
                      </optgroup>

                      <optgroup label="── Övrigt ──">
                        {special.map(item => (
                          <option
                            key={item.id}
                            value={item.id}
                          >
                            {item.name}
                          </option>
                        ))}
                      </optgroup>
                    </>
                  )
                })()}
              </select>
            </div>

            {/* Beskrivning */}
            <div className="col-span-2 lg:col-span-3 flex flex-col gap-1">
              <label className="text-[9px] font-black text-gray-500 uppercase ml-1">
                Beskrivning
              </label>

              <input
                type="text"
                value={formData.description}
                disabled={isYearLocked}
                onChange={e =>
                  setFormData({
                    ...formData,
                    description: e.target.value,
                  })
                }
                className={`p-3 bg-gray-50 rounded-xl outline-none font-bold text-xs transition-all ${
                  isYearLocked
                    ? 'opacity-40 cursor-not-allowed'
                    : ''
                } ${
                  descriptionHighlight
                    ? 'ring-2 ring-amber-400 bg-amber-50 animate-pulse'
                    : ''
                }`}
                placeholder={
                  descriptionHighlight
                    ? '← Fyll i beskrivning!'
                    : ''
                }
                required
              />
            </div>

            {/* Moms % */}
            <div className="lg:col-span-1 flex flex-col gap-1">
              <label className="text-[9px] font-black text-gray-500 uppercase ml-1">
                Moms %
              </label>

              <select
                value={formData.vatRate}
                onChange={e =>
                  setFormData({
                    ...formData,
                    vatRate: Number(e.target.value),
                  })
                }
                disabled={editingBooked || isYearLocked || isNotVatRegistered}
                className={`p-3 rounded-xl outline-none font-bold text-xs ${
                  editingBooked || isYearLocked || isNotVatRegistered
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-gray-50 cursor-pointer'
                } ${isYearLocked ? 'opacity-40' : ''}`}
                title={isNotVatRegistered ? 'Företaget är markerat som inte momsregistrerat.' : undefined}
              >
                <option value={25}>25%</option>
                <option value={12}>12%</option>
                <option value={6}>6%</option>
                <option value={0}>0%</option>
              </select>
            </div>

            {/* Belopp */}
            <div className="lg:col-span-2 flex flex-col gap-1">
              <label className="text-[9px] font-black text-gray-500 uppercase ml-1">
                {isNotVatRegistered ? 'Belopp' : 'Belopp inkl. moms'}
              </label>

              <input
                type="number"
                step="0.01"
                value={formData.amount}
                onChange={e =>
                  setFormData({
                    ...formData,
                    amount: e.target.value,
                  })
                }
                disabled={editingBooked || isYearLocked}
                className={`p-3 rounded-xl outline-none font-black text-sm ${
                  editingBooked || isYearLocked
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-gray-50'
                } ${isYearLocked ? 'opacity-40' : ''}`}
                required
              />
            </div>

            {/* Submit / Cancel — endast desktop */}
            <div className="hidden lg:col-span-1 lg:flex lg:flex-col gap-1">
              {editingId && (
                <label className="text-[9px] font-black text-amber-400 uppercase ml-1">
                  Redigerar
                </label>
              )}

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={uploading || isYearLocked}
                  className={`flex-1 h-[42px] rounded-xl font-black uppercase text-[9px] shadow-md transition-all text-white ${
                    uploading
                      ? 'bg-gray-400'
                      : isYearLocked
                      ? 'bg-gray-300 opacity-40 cursor-not-allowed'
                      : vatV2AssessmentEnabled
                      ? 'bg-indigo-500 hover:bg-indigo-600'
                      : editingId
                      ? 'bg-amber-500 hover:bg-amber-600'
                      : 'bg-emerald-600 hover:bg-emerald-700'
                  }`}
                >
                  {uploading
                    ? '...'
                    : vatV2AssessmentEnabled
                    ? 'Förhandskolla'
                    : editingId
                    ? 'Spara'
                    : 'Bokför'}
                </button>

                {editingId && (
                  <button
                    type="button"
                    onClick={onCancelEdit}
                    className="h-[42px] px-3 rounded-xl text-gray-400 hover:text-gray-600 font-bold text-sm transition-colors"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
            {isNotVatRegistered && (
              <div className="col-span-2 lg:col-span-12 -mt-1 px-1">
                <p className="text-[9px] font-bold text-gray-400">
                  Företaget är markerat som inte momsregistrerat. Nya bokningar görs därför med 0 % moms.
                </p>
              </div>
            )}
          </div>
        )}

        {showVatV2Assessment && (
          <div
            className={`mb-4 rounded-2xl border-2 transition-all ${
              vatV2Facts.enabled
                ? 'border-indigo-200 bg-indigo-50/50'
                : 'border-gray-100 bg-gray-50/40'
            } ${isYearLocked ? 'opacity-40 cursor-not-allowed' : ''}`}
          >
            <label className="flex items-center gap-3 px-5 py-3.5 cursor-pointer select-none">
              <div className="relative">
                <input
                  type="checkbox"
                  checked={vatV2Facts.enabled}
                  disabled={isYearLocked}
                  onChange={e =>
                    setVatV2Facts(
                      e.target.checked
                        ? { ...initialVatV2Facts, enabled: true }
                        : initialVatV2Facts
                    )
                  }
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-gray-200 peer-checked:bg-indigo-500 rounded-full transition-colors duration-200" />
                <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 peer-checked:translate-x-4" />
              </div>

              <div>
                <span className="text-[10px] font-black uppercase text-gray-600 tracking-wide">
                  Utlandsinköp
                </span>
                <p className="text-[9px] text-gray-400 font-medium mt-0.5">
                  Förhandskontroll för moms. Ingen bokning skapas här.
                </p>
              </div>
            </label>

            {vatV2Facts.enabled && !isYearLocked && (
              <div className="px-5 pb-4 border-t border-indigo-100">
                <div className="grid grid-cols-2 lg:grid-cols-12 gap-3 pt-4 items-end">
                  <div className="col-span-2 lg:col-span-3 flex flex-col gap-1">
                    <label className="text-[9px] font-black text-indigo-500 uppercase ml-1">
                      Leverantörsland
                    </label>
                    <select
                      value={vatV2Facts.supplierCountry}
                      onChange={e =>
                        updateVatV2Facts({
                          supplierCountry: e.target.value as VatV2SupplierCountryInput,
                        })
                      }
                      className="p-3 bg-white border border-indigo-100 rounded-xl outline-none font-bold text-xs text-indigo-700 focus:border-indigo-300 transition-colors"
                    >
                      <option value="unknown">Välj land</option>
                      {VAT_V2_SUPPLIER_COUNTRIES.map(country => (
                        <option key={country.code} value={country.code}>
                          {country.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="col-span-2 lg:col-span-2 flex flex-col gap-1">
                    <label className="text-[9px] font-black text-indigo-500 uppercase ml-1">
                      Vara/tjänst
                    </label>
                    <select
                      value={vatV2Facts.goodsOrService}
                      onChange={e =>
                        updateVatV2Facts({
                          goodsOrService: e.target.value as VatGoodsOrService,
                        })
                      }
                      className="p-3 bg-white border border-indigo-100 rounded-xl outline-none font-bold text-xs text-indigo-700 focus:border-indigo-300 transition-colors"
                    >
                      <option value="unknown">Välj</option>
                      <option value="service">Tjänst</option>
                      <option value="goods">Vara</option>
                    </select>
                  </div>

                  <div className="col-span-2 lg:col-span-2 flex flex-col gap-1">
                    <label className="text-[9px] font-black text-indigo-500 uppercase ml-1">
                      Moms på fakturan
                    </label>
                    <select
                      value={vatV2Facts.supplierVatCharged}
                      onChange={e =>
                        updateVatV2Facts({
                          supplierVatCharged: e.target.value as VatYesNoUnknown,
                        })
                      }
                      className="p-3 bg-white border border-indigo-100 rounded-xl outline-none font-bold text-xs text-indigo-700 focus:border-indigo-300 transition-colors"
                    >
                      <option value="unknown">Okänt</option>
                      <option value="no">Nej</option>
                      <option value="yes">Ja</option>
                    </select>
                  </div>

                  <div className="col-span-2 lg:col-span-2 flex flex-col gap-1">
                    <label className="text-[9px] font-black text-indigo-500 uppercase ml-1">
                      Beräknad moms
                    </label>
                    <select
                      value={vatV2Facts.calculationRate}
                      onChange={e =>
                        updateVatV2Facts({
                          calculationRate:
                            e.target.value === 'unknown'
                              ? 'unknown'
                              : Number(e.target.value) as VatCalculationRateInput,
                        })
                      }
                      className="p-3 bg-white border border-indigo-100 rounded-xl outline-none font-bold text-xs text-indigo-700 focus:border-indigo-300 transition-colors"
                    >
                      <option value="unknown">Välj</option>
                      <option value={25}>25%</option>
                      <option value={12}>12%</option>
                      <option value={6}>6%</option>
                      <option value={0}>0%</option>
                    </select>
                  </div>

                  <div className="col-span-2 lg:col-span-3 flex flex-col gap-1">
                    <label className="text-[9px] font-black text-indigo-500 uppercase ml-1">
                      Inköpsbelopp för moms
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={vatV2Facts.acquisitionBaseAmount}
                      onChange={e =>
                        updateVatV2Facts({
                          acquisitionBaseAmount: e.target.value,
                        })
                      }
                      className="p-3 bg-white border border-indigo-100 rounded-xl outline-none font-black text-sm text-indigo-700 focus:border-indigo-300 transition-colors"
                      placeholder="Beskattningsunderlag"
                    />
                  </div>
                </div>

                <div
                  className={`mt-4 rounded-xl border px-4 py-3 ${
                    vatV2Preflight.status === 'ready'
                      ? 'border-emerald-100 bg-emerald-50'
                      : 'border-amber-100 bg-amber-50'
                  }`}
                >
                  {vatV2Preflight.status === 'ready' ? (
                    <div>
                      <p className="text-[10px] font-black uppercase text-emerald-700">
                        Redo för EU-tjänst med omvänd beskattning
                      </p>
                      <p className="mt-1 text-[10px] font-bold text-emerald-700">
                        Underlag {vatV2Preflight.treatment.taxableBase} kr,
                        utgående moms {vatV2Preflight.treatment.outputVat.amount} kr,
                        beräknad ingående moms {vatV2Preflight.treatment.deductibleInputVat.amount} kr.
                        Bokning kopplas in först i ett senare steg.
                      </p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-[10px] font-black uppercase text-amber-700">
                        Kan inte bedömas säkert ännu
                      </p>
                      <ul className="mt-1 space-y-1">
                        {vatV2Preflight.validation.errors.map((preflightError, index) => (
                          <li
                            key={`${preflightError.code}-${preflightError.path}-${index}`}
                            className="text-[10px] font-bold text-amber-700"
                          >
                            {describeVatV2PreflightError(preflightError)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Bilaga */}
        <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-gray-50">
          <span className="text-[9px] font-black text-gray-500 uppercase whitespace-nowrap">
            Bilaga:
          </span>

          <label
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-wide transition-all shadow-sm ${
              isYearLocked
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed opacity-50'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer hover:shadow-md'
            }`}
          >
            <span>＋</span>
            <span>Välj fil</span>

            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              disabled={isYearLocked}
              onChange={e =>
                setFormData({
                  ...formData,
                  file: e.target.files?.[0] || null,
                })
              }
              className="hidden"
            />
          </label>

          <span
            className={`text-[10px] font-medium truncate max-w-[220px] sm:max-w-md ${
              formData.file
                ? 'text-emerald-600 font-bold'
                : 'text-gray-400'
            }`}
          >
            {formData.file ? (
              <>
                {formData.file.name}{' '}
                <span className="text-emerald-500">
                  ✓
                </span>
              </>
            ) : (
              'Ingen fil vald'
            )}
          </span>
        </div>

        {/* Bokförd transaktion — spara bilaga */}
        {editingBooked && (
          <div className="mt-4 flex gap-2 justify-end">

            {/* Avbryt — endast mobil */}
            <button
              type="button"
              onClick={onCancelEdit}
              className="lg:hidden h-[42px] px-5 rounded-xl font-black uppercase text-[9px] border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 transition-all"
            >
              Avbryt
            </button>

            <button
              type="submit"
              disabled={uploading || isYearLocked}
              className={`h-[42px] px-5 rounded-xl font-black uppercase text-[9px] shadow-md transition-all text-white ${
                uploading
                  ? 'bg-gray-400'
                  : isYearLocked
                  ? 'bg-gray-300 opacity-40 cursor-not-allowed'
                  : 'bg-amber-500 hover:bg-amber-600'
              }`}
            >
              {uploading ? '...' : 'Spara bilaga'}
            </button>
          </div>
        )}

        {/* Periodisering — visas bara när man inte redigerar */}
        {!editingId && (
          <div
            className={`mt-4 rounded-2xl border-2 transition-all duration-200 ${
              periodisera
                ? 'border-blue-300 bg-blue-50/60'
                : 'border-gray-100 bg-gray-50/40'
            } ${
              isYearLocked
                ? 'opacity-40 cursor-not-allowed'
                : ''
            }`}
          >
            <label className="flex items-center gap-3 px-5 py-3.5 cursor-pointer select-none">
              <div className="relative">
                <input
                  type="checkbox"
                  checked={periodisera}
                  disabled={isYearLocked}
                  onChange={e =>
                    setPeriodisera(e.target.checked)
                  }
                  className="sr-only peer"
                />

                <div className="w-9 h-5 bg-gray-200 peer-checked:bg-blue-500 rounded-full transition-colors duration-200" />
                <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 peer-checked:translate-x-4" />
              </div>

              <div>
                <span className="text-[10px] font-black uppercase text-gray-600 tracking-wide">
                  Periodisera till nästa räkenskapsår
                </span>

                <p className="text-[9px] text-gray-400 font-medium mt-0.5">
                  Kostnaden avser ett annat år — parkeras på konto 1790 och aktiveras automatiskt.
                </p>
              </div>
            </label>

            {periodisera && !isYearLocked && (
              <div className="px-5 pb-4 flex flex-wrap items-end gap-6 border-t border-blue-100">
                <div className="flex flex-col gap-1 mt-3">
                  <label className="text-[9px] font-black text-blue-500 uppercase ml-1">
                    Kostnaden avser (år/månad)
                  </label>

                  <input
                    type="month"
                    value={periodMonth}
                    onChange={e =>
                      setPeriodMonth(e.target.value)
                    }
                    className="p-2.5 bg-white border border-blue-200 rounded-xl outline-none font-bold text-xs text-blue-700 focus:border-blue-400 transition-colors"
                  />
                </div>

                <div className="mt-3 text-[9px] leading-relaxed text-blue-600 font-bold bg-blue-100/60 rounded-xl px-4 py-2.5 border border-blue-200">
                  <p className="font-black uppercase mb-1 text-blue-700">
                    Vad händer?
                  </p>

                  <p>
                    📅 <strong>År 1 (idag):</strong>{' '}
                    Bank krediteras.{' '}
                    {isNotVatRegistered
                      ? 'Hela beloppet → konto 1790.'
                      : 'Moms bokas direkt. Netto → konto 1790.'}
                  </p>

                  <p>
                    🔄{' '}
                    <strong>
                      År 2 ({periodMonth}-01):
                    </strong>{' '}
                    1790 krediteras → kostnadskonto
                    debiteras.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Submit / Cancel — endast mobil */}
        {!editingBooked && (
          <div className="lg:hidden mt-4 pt-4 border-t border-gray-100">
            {editingId && (
              <p className="mb-2 text-[9px] font-black text-amber-400 uppercase tracking-wide">
                Redigerar
              </p>
            )}

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={uploading || isYearLocked}
                className={`flex-1 h-[42px] rounded-xl font-black uppercase text-[9px] shadow-md transition-all text-white ${
                  uploading
                    ? 'bg-gray-400'
                    : isYearLocked
                    ? 'bg-gray-300 opacity-40 cursor-not-allowed'
                    : vatV2AssessmentEnabled
                    ? 'bg-indigo-500 hover:bg-indigo-600'
                    : editingId
                    ? 'bg-amber-500 hover:bg-amber-600'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                {uploading
                  ? '...'
                  : vatV2AssessmentEnabled
                  ? 'Förhandskolla'
                  : editingId
                  ? 'Spara'
                  : 'Bokför'}
              </button>

              {editingId && (
                <button
                  type="button"
                  onClick={onCancelEdit}
                  className="h-[42px] px-4 rounded-xl text-gray-400 hover:text-gray-600 font-bold text-sm transition-colors"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        )}
      </form>

      {/* ⭐ Favorit-banner — dyker upp efter att en transaktion bokförts */}
      {lastSubmitted && !editingId && (
        <div className="mt-4 flex flex-wrap items-center gap-y-2 gap-x-3 bg-emerald-50 border border-emerald-100 rounded-2xl px-5 py-3 animate-in fade-in duration-300">
          <span className="text-base">⭐</span>

          <p className="text-[10px] font-black uppercase text-emerald-600 tracking-wide flex-1 min-w-[110px]">
            Spara som favorit?
          </p>

          {showFavInput ? (
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <input
                type="text"
                value={favName}
                onChange={e =>
                  setFavName(e.target.value)
                }
                onKeyDown={e =>
                  e.key === 'Enter' &&
                  handleSaveFav()
                }
                placeholder="Namn på favorit..."
                autoFocus
                className="text-xs font-bold bg-white border border-emerald-200 rounded-lg px-3 py-1.5 outline-none focus:border-emerald-400 transition-colors flex-1 min-w-0 sm:flex-none"
              />

              <button
                onClick={handleSaveFav}
                className="text-[10px] font-black uppercase bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg transition-colors"
              >
                Spara
              </button>

              <button
                onClick={() => {
                  setShowFavInput(false)
                  setFavName('')
                }}
                className="text-gray-300 hover:text-gray-500 font-bold text-sm transition-colors"
              >
                ✕
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={() =>
                  setShowFavInput(true)
                }
                className="text-[10px] font-black uppercase bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg transition-colors"
              >
                Ja, spara ⭐
              </button>

              <button
                onClick={onDismissFavorite}
                className="text-[10px] font-bold text-gray-300 hover:text-gray-400 transition-colors"
              >
                Nej tack
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
