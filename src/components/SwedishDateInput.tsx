'use client'

import { useEffect, useRef, useState } from 'react'
import { formatIsoDateSv, parseSvDateToIso } from '@/lib/dateUi'

interface SwedishDateInputProps {
  value: string
  onChange: (isoDate: string) => void
  className?: string
  disabled?: boolean
  required?: boolean
  min?: string
  max?: string
  title?: string
  ariaLabel?: string
}

export default function SwedishDateInput({
  value,
  onChange,
  className,
  disabled,
  required,
  min,
  max,
  title,
  ariaLabel,
}: SwedishDateInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const pickerRef = useRef<HTMLInputElement>(null)
  const [text, setText] = useState(formatIsoDateSv(value))

  useEffect(() => {
    setText(formatIsoDateSv(value))
  }, [value])

  function validate(nextText: string) {
    if (nextText.trim() === '') return required ? 'Datum krävs.' : ''
    const isoDate = parseSvDateToIso(nextText)
    if (!isoDate) return 'Ange ett giltigt datum som dd/mm/åååå.'
    if (min && isoDate < min) return `Datumet får inte vara före ${formatIsoDateSv(min)}.`
    if (max && isoDate > max) return `Datumet får inte vara efter ${formatIsoDateSv(max)}.`
    return ''
  }

  function setValidity(message: string) {
    inputRef.current?.setCustomValidity(message)
  }

  function commit(nextText: string) {
    const validationMessage = validate(nextText)
    setValidity(validationMessage)
    if (validationMessage) return
    const isoDate = parseSvDateToIso(nextText)
    if (!isoDate) return
    onChange(isoDate)
    setText(formatIsoDateSv(isoDate))
  }

  function openPicker() {
    const picker = pickerRef.current
    if (!picker) return
    if (typeof picker.showPicker === 'function') {
      picker.showPicker()
    } else {
      picker.focus()
      picker.click()
    }
  }

  function applyPickerValue(isoDate: string) {
    const validationMessage = validate(formatIsoDateSv(isoDate))
    setValidity(validationMessage)
    if (validationMessage) return
    onChange(isoDate)
    setText(formatIsoDateSv(isoDate))
  }

  const pickerLabel = ariaLabel
    ? `Välj ${ariaLabel.toLowerCase()} i kalender`
    : 'Välj datum i kalender'

  return (
    <span className="relative block min-w-0 flex-1">
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        placeholder="dd/mm/åååå"
        pattern="\d{1,2}/\d{1,2}/\d{4}"
        value={text}
        disabled={disabled}
        required={required}
        aria-label={ariaLabel}
        title={title ?? 'Ange datum som dd/mm/åååå'}
        onChange={event => {
          const nextText = event.target.value
          setText(nextText)
          const validationMessage = validate(nextText)
          setValidity(validationMessage)
          if (validationMessage) {
            if (nextText.trim() === '') onChange('')
            return
          }
          const isoDate = parseSvDateToIso(nextText)
          if (isoDate) onChange(isoDate)
        }}
        onBlur={() => commit(text)}
        className={`${className ?? ''} w-full pr-11`}
      />
      <button
        type="button"
        aria-label={pickerLabel}
        title="Välj datum i kalender"
        disabled={disabled}
        onClick={openPicker}
        className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg border border-gray-200 bg-white text-[13px] font-black text-gray-500 shadow-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
      >
        ▦
      </button>
      <input
        ref={pickerRef}
        type="date"
        value={value || ''}
        min={min}
        max={max}
        disabled={disabled}
        tabIndex={-1}
        aria-label={pickerLabel}
        onInput={event => applyPickerValue(event.currentTarget.value)}
        onChange={event => applyPickerValue(event.currentTarget.value)}
        className="pointer-events-none absolute right-2 top-1/2 h-px w-px -translate-y-1/2 opacity-0"
      />
    </span>
  )
}
