'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { Check, ChevronsUpDown, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { FILTER_CONSONANTS, matchesChosung, chosungSearch } from '@/lib/korean'

interface CompanyPickerProps {
  companies: string[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

export function CompanyPicker({
  companies,
  value,
  onChange,
  placeholder = '업체 선택',
  className,
}: CompanyPickerProps) {
  const [open, setOpen] = useState(false)
  const [consonant, setConsonant] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // 팝오버 열릴 때 인풋 포커스
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50)
    } else {
      setQuery('')
      setConsonant(null)
    }
  }, [open])

  const filtered = useMemo(() => {
    return companies.filter(c => {
      const passConsonant = consonant ? matchesChosung(c, consonant) : true
      const passQuery = query ? chosungSearch(c, query) : true
      return passConsonant && passQuery
    })
  }, [companies, consonant, query])

  // 초성 버튼 — 실제 데이터에 존재하는 초성만 활성화
  const activeConsonants = useMemo(() => {
    return new Set(
      FILTER_CONSONANTS.filter(fc => companies.some(c => matchesChosung(c, fc)))
    )
  }, [companies])

  const handleSelect = (c: string) => {
    onChange(c === value ? '' : c)
    setOpen(false)
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange('')
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        role="combobox"
        aria-expanded={open}
        className={cn(
          "flex h-9 w-full items-center justify-between rounded-lg border border-input bg-background px-3 text-sm font-normal hover:bg-accent transition-colors",
          className
        )}
      >
        <span className={cn("truncate", !value && "text-muted-foreground")}>
          {value || placeholder}
        </span>

        <span className="flex items-center gap-1 ml-2 flex-shrink-0">
          {value && (
            <span
              role="button"
              aria-label="선택 해제"
              onClick={(e) => {
                e.stopPropagation()
                handleClear(e as React.MouseEvent)
              }}
              className="rounded-full hover:bg-muted p-0.5 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-3 h-3" />
            </span>
          )}

          <ChevronsUpDown className="w-4 h-4 text-muted-foreground" />
        </span>
      </PopoverTrigger>

      <PopoverContent
        className="p-0 w-[var(--radix-popover-trigger-width)] min-w-[260px]"
        align="start"
        sideOffset={4}
      >
        {/* 초성 필터 */}
        <div className="p-2 border-b border-border">
          <div className="flex flex-wrap gap-1">
            <button
              onClick={() => setConsonant(null)}
              className={cn(
                'px-2 py-0.5 rounded text-xs font-medium transition-colors',
                consonant === null
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              )}
            >
              전체
            </button>
            {FILTER_CONSONANTS.map(fc => (
              <button
                key={fc}
                onClick={() => setConsonant(prev => prev === fc ? null : fc)}
                disabled={!activeConsonants.has(fc)}
                className={cn(
                  'px-2 py-0.5 rounded text-xs font-medium transition-colors',
                  consonant === fc
                    ? 'bg-primary text-primary-foreground'
                    : activeConsonants.has(fc)
                    ? 'bg-muted text-foreground hover:bg-accent'
                    : 'bg-muted/30 text-muted-foreground/40 cursor-not-allowed'
                )}
              >
                {fc}
              </button>
            ))}
          </div>
        </div>

        {/* 검색 입력 */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
          <Search className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="업체명 검색..."
            className="flex-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground"
          />
          {query && (
            <button onClick={() => setQuery('')} className="text-muted-foreground hover:text-foreground">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* 업체 목록 */}
        <div className="max-h-52 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">검색 결과 없음</p>
          ) : (
            filtered.map(c => (
              <button
                key={c}
                onClick={() => handleSelect(c)}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent transition-colors text-left',
                  value === c && 'bg-accent/60'
                )}
              >
                <Check
                  className={cn('w-3.5 h-3.5 flex-shrink-0', value === c ? 'opacity-100 text-primary' : 'opacity-0')}
                />
                <span className="truncate">{c}</span>
              </button>
            ))
          )}
        </div>

        {filtered.length > 0 && (
          <div className="border-t border-border px-3 py-1.5">
            <p className="text-xs text-muted-foreground">{filtered.length}개 업체</p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
