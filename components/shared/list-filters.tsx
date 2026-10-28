'use client'

import { useState } from 'react'
import { Check, ChevronsUpDown, Search, X } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { chosungSearch } from '@/lib/korean'
import { cn } from '@/lib/utils'

export function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border bg-card py-0.5 pl-2.5 pr-1 text-xs font-medium">
      {label}
      <button type="button" onClick={onClear} className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={`${label} 필터 지우기`}>
        <X className="h-3 w-3" />
      </button>
    </span>
  )
}

export function FilterSelect({
  label,
  value,
  onChange,
  allLabel,
  options,
  counts,
  format,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  allLabel: string
  options: string[]
  counts?: Map<string, number>
  format?: (value: string) => string
}) {
  const [open, setOpen] = useState(false)
  const [keyword, setKeyword] = useState('')
  const show = (option: string) => (format ? format(option) : option)
  const trimmed = keyword.trim()
  const shown = trimmed ? options.filter((option) => chosungSearch(show(option), trimmed)) : options
  const pick = (next: string) => {
    onChange(next)
    setOpen(false)
    setKeyword('')
  }

  return (
    <div className="space-y-1.5 text-sm font-medium">
      <span>{label}</span>
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) setKeyword('')
        }}
      >
        <PopoverTrigger
          className={cn(
            'flex h-10 w-full items-center gap-2 rounded-lg border border-input bg-background px-3 text-left text-sm font-normal transition-colors hover:bg-muted/60',
            value !== 'all' && 'border-foreground/25 font-semibold',
          )}
        >
          <span className={cn('min-w-0 flex-1 truncate', value === 'all' && 'text-muted-foreground')}>
            {value === 'all' ? allLabel : show(value)}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-(--anchor-width) min-w-64 gap-0 p-0">
          <div className="flex items-center gap-2 border-b px-3 py-2.5">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              autoFocus
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing) return
                if (event.key === 'Enter' && shown[0]) pick(shown[0])
              }}
              placeholder={`${label} 검색 (초성 가능)`}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="max-h-72 overflow-y-auto p-1">
            {!trimmed && (
              <FilterOption selected={value === 'all'} label={allLabel} muted onClick={() => pick('all')} />
            )}
            {shown.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">검색 결과 없음</p>
            ) : (
              shown.map((option) => (
                <FilterOption
                  key={option}
                  selected={value === option}
                  label={show(option)}
                  count={counts?.get(option)}
                  onClick={() => pick(option)}
                />
              ))
            )}
          </div>
          <p className="border-t px-3 py-1.5 text-xs text-muted-foreground">{options.length}개</p>
        </PopoverContent>
      </Popover>
    </div>
  )
}

function FilterOption({
  selected,
  label,
  count,
  muted,
  onClick,
}: {
  selected: boolean
  label: string
  count?: number
  muted?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors',
        selected ? 'bg-amber-50 font-semibold text-amber-900 dark:bg-amber-950/40 dark:text-amber-200' : 'hover:bg-muted',
        muted && !selected && 'text-muted-foreground',
      )}
    >
      <Check className={cn('h-4 w-4 shrink-0 text-amber-600', !selected && 'invisible')} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count != null && <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{count.toLocaleString('ko-KR')}</span>}
    </button>
  )
}
