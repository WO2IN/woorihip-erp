'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { Check, ChevronsUpDown, Plus, Search, X } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { chosungSearch } from '@/lib/korean'
import { toast } from 'sonner'
import { notifyDataChanged } from '@/lib/data-events'
import { getJsonAuthHeaders } from '@/lib/auth-client'

interface SearchableComboboxProps {
  configName: string
  options: string[]

  recentOptions?: string[]
  /** 검색 전에도 options 전체를 보여 준다. 없으면 최근 5개만 보인다. */
  listAll?: boolean

  value: string
  onChange: (value: string) => void
  onOptionsChange?: (newOptions: string[]) => void
  placeholder?: string
  label?: string
  className?: string
  required?: boolean
  clearable?: boolean
  /** 목록에 없는 값을 새로 만들지 않는다 */
  creatable?: boolean
  disabled?: boolean
  /** 등록·수정 폼용 — 조금 더 넉넉한 높이·그림자 */
  appearance?: 'default' | 'form'
  /** 목록 하단 안내. 없으면 "N개 항목" */
  listCaption?: string
  /** 목록 영역 높이. 없으면 기본 높이 */
  listClassName?: string
}

export function SearchableCombobox({
  configName,
  options,
  recentOptions = [],
  listAll = false,
  value,
  onChange,
  onOptionsChange,
  placeholder = '선택 또는 입력...',
  className,
  clearable = true,
  creatable = true,
  disabled = false,
  appearance = 'default',
  listCaption,
  listClassName,
}: SearchableComboboxProps) {
  const formStyle = appearance === 'form'
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [highlightIndex, setHighlightIndex] = useState(0)

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 40)
    } else {
      setQuery('')
      setHighlightIndex(0)
    }
  }, [open])

  const filtered = useMemo(() => {
    // 검색어가 없으면 최근 사용 항목 5개만 표시
    if (!query.trim()) {
      return listAll ? options : recentOptions.slice(0, 5)
    }
  
    // 검색하면 전체 options에서 검색
    return options.filter(o =>
      chosungSearch(o, query.trim())
    )
  }, [listAll, options, recentOptions, query])

  const trimmed = query.trim()
  const exactMatch = options.some(o => o.toLowerCase() === trimmed.toLowerCase())
  const showCreateOption = creatable && trimmed.length > 0 && !exactMatch

  const totalItems = filtered.length + (showCreateOption ? 1 : 0)

  useEffect(() => {
    setHighlightIndex(0)
  }, [query])

  const handleSelect = (val: string) => {
    onChange(val)
    setOpen(false)
  }

  const handleCreate = async () => {
    if (!trimmed || adding) return

    setAdding(true)
    try {
      const response = await fetch('/api/config', {
        method: 'POST',
        headers: getJsonAuthHeaders(),
        body: JSON.stringify({ name: configName, value: trimmed }),
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || '항목 추가에 실패했습니다.')
      }

      onOptionsChange?.(data.data || [trimmed, ...options])
      onChange(trimmed)
      notifyDataChanged('config')
      setOpen(false)
      toast.success(`"${trimmed}"이(가) 추가되었습니다.`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '항목 추가에 실패했습니다.')
    } finally {
      setAdding(false)
    }
  }
  
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIndex(i => Math.min(i + 1, totalItems - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (highlightIndex < filtered.length) {
        handleSelect(filtered[highlightIndex])
      } else if (showCreateOption) {
        handleCreate()
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange('')
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        className={cn(
          'flex h-9 w-full cursor-pointer items-center justify-between rounded-lg border border-input bg-background px-3 text-sm transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60',
          formStyle && 'h-10 border-slate-200 bg-white shadow-sm hover:border-slate-300 hover:bg-white data-[state=open]:border-primary/40 data-[state=open]:ring-[3px] data-[state=open]:ring-primary/15 dark:border-border dark:bg-background',
          className,
        )}
      >
        <span className={cn('min-w-0 truncate', !value && 'text-muted-foreground', value && formStyle && 'font-medium text-slate-800 dark:text-foreground')}>
          {value || placeholder}
        </span>

        <span className="ml-2 flex shrink-0 items-center gap-1">
          {value && clearable && (
            <span
              role="button"
              onClick={(e) => {
                e.stopPropagation()
                handleClear(e as unknown as React.MouseEvent)
              }}
              className={cn(
                'rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground',
                formStyle && 'hover:bg-slate-100',
              )}
            >
              <X className="h-3 w-3" />
            </span>
          )}

          <ChevronsUpDown className={cn('h-3.5 w-3.5 text-muted-foreground', formStyle && 'text-slate-400')} />
        </span>
      </PopoverTrigger>

      <PopoverContent
        className={cn(
          'w-[var(--radix-popover-trigger-width)] min-w-[220px] p-0',
          formStyle && 'overflow-hidden rounded-xl border-slate-200 shadow-lg dark:border-border',
        )}
        align="start"
        sideOffset={formStyle ? 6 : 4}
      >
        {/* 검색 입력 */}
        <div className={cn('flex items-center gap-2 border-b border-border px-3 py-2.5', formStyle && 'border-slate-100 bg-slate-50/80 dark:bg-muted/40')}>
          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={creatable ? '검색 또는 직접 입력...' : '검색'}
            className="flex-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground"
          />
          {query && (
            <button onClick={() => setQuery('')} className="text-muted-foreground hover:text-foreground">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* 목록 */}
        <div ref={listRef} className={cn('max-h-52 overflow-y-auto py-1', formStyle && 'px-1 py-1.5', listClassName)}>
          {filtered.length === 0 && !showCreateOption && (
            <p className="py-6 text-center text-sm text-muted-foreground">검색 결과 없음</p>
          )}

          {filtered.map((opt, idx) => (
            <button
              key={opt}
              onClick={() => handleSelect(opt)}
              className={cn(
                'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors',
                formStyle ? 'rounded-lg' : '',
                highlightIndex === idx ? 'bg-accent' : 'hover:bg-accent/60',
                formStyle && highlightIndex === idx && 'bg-slate-100 dark:bg-muted',
                formStyle && value === opt && 'bg-primary/5 text-primary',
                value === opt && 'font-medium',
              )}
            >
              <Check
                className={cn(
                  'h-3.5 w-3.5 shrink-0',
                  value === opt ? 'text-primary opacity-100' : 'opacity-0',
                )}
              />
              <span className="truncate">{opt}</span>
            </button>
          ))}

          {/* 새로 추가 옵션 */}
          {showCreateOption && (
            <button
              onClick={handleCreate}
              disabled={adding}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors text-left border-t border-dashed border-border/60 mt-1',
                highlightIndex === filtered.length ? 'bg-accent' : 'hover:bg-accent/60'
              )}
            >
              <Plus className="w-3.5 h-3.5 flex-shrink-0 text-primary" />
              <span className="text-primary font-medium truncate">
                {adding ? '추가 중...' : `"${trimmed}" 새로 추가`}
              </span>
            </button>
          )}
        </div>

        {filtered.length > 0 && (
          <div className={cn('border-t border-border px-3 py-1.5', formStyle && 'border-slate-100 bg-slate-50/70 dark:bg-muted/30')}>
            <p className="text-xs text-muted-foreground">{listCaption ?? `${filtered.length}개 항목`}</p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
