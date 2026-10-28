'use client'

import { Check, ChevronDown } from 'lucide-react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

type Option = {
  label: string
  value: string
}

interface MultiSelectProps {
  options: (string | Option)[]
  value: string[]
  onChange: (value: string[]) => void
  placeholder?: string
}

export function MultiSelect({
  options,
  value,
  onChange,
  placeholder = '전체',
}: MultiSelectProps) {
  const toggleValue = (item: string) => {
    onChange(
      value.includes(item)
        ? value.filter(v => v !== item)
        : [...value, item]
    )
  }

  const selectedLabels = options
    .filter(option => {
      const item =
        typeof option === 'string'
          ? { label: option, value: option }
          : option

      return value.includes(item.value)
    })
    .map(option =>
      typeof option === 'string'
        ? option
        : option.label
    )

  const displayText =
    value.length === 0
      ? placeholder
      : value.length === 1
        ? selectedLabels[0]
        : `${value.length}개 선택`

  return (
    <Popover>
      <PopoverTrigger
        className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm font-normal"
      >
        <span className="truncate">{displayText}</span>
        <ChevronDown className="w-4 h-4 opacity-50" />
      </PopoverTrigger>

      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-1"
        align="start"
      >
        <div className="max-h-60 overflow-y-auto">
          {options.map(option => {
            const item =
              typeof option === 'string'
                ? { label: option, value: option }
                : option

            const selected = value.includes(item.value)

            return (
              <button
                key={item.value}
                type="button"
                onClick={() => toggleValue(item.value)}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
              >
                <div className="flex h-4 w-4 items-center justify-center rounded border">
                  {selected && <Check className="h-3 w-3" />}
                </div>

                <span>{item.label}</span>
              </button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}