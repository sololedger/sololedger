'use client'

import { useEffect, useState } from 'react'
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
  const [text, setText] = useState(formatIsoDateSv(value))

  useEffect(() => {
    setText(formatIsoDateSv(value))
  }, [value])

  function commit(nextText: string) {
    const isoDate = parseSvDateToIso(nextText)
    if (!isoDate) return
    if (min && isoDate < min) return
    if (max && isoDate > max) return
    onChange(isoDate)
    setText(formatIsoDateSv(isoDate))
  }

  return (
    <input
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
        if (nextText.trim() === '') {
          onChange('')
          return
        }
        const isoDate = parseSvDateToIso(nextText)
        if (isoDate && (!min || isoDate >= min) && (!max || isoDate <= max)) {
          onChange(isoDate)
        }
      }}
      onBlur={() => commit(text)}
      className={className}
    />
  )
}
