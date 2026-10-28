'use client'

import { cn } from '@/lib/utils'

interface CellSelectProps {
  value: string
  options: readonly string[]
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  'aria-label'?: string
  disabled?: boolean
}

export function CellSelect({
  value,
  options,
  onChange,
  placeholder = '선택',
  className,
  'aria-label': ariaLabel,
  disabled = false,
}: CellSelectProps) {
  const choices = value && !(options as readonly string[]).includes(value) ? [value, ...options] : options

  return (
    <select
      aria-label={ariaLabel}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        'print-compact-select h-8 w-full rounded-none border-0 bg-transparent px-0.5 text-center text-xs shadow-none outline-none focus-visible:ring-0',
        className,
      )}
    >
      {!value && <option value="">{placeholder}</option>}
      {choices.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  )
}
