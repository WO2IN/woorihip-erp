'use client'

import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { Check, ChevronsUpDown, Plus, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { chosungSearch } from '@/lib/korean'
import { toast } from 'sonner'
import { notifyDataChanged } from '@/lib/data-events'
import { buildAuthHeaders, getSession } from '@/lib/auth-client'

interface SearchableComboboxProps {
  configName: string
  options: string[]

  recentOptions?: string[]

  value: string
  onChange: (value: string) => void
  onOptionsChange?: (newOptions: string[]) => void
  placeholder?: string
  label?: string
  className?: string
  required?: boolean
  clearable?: boolean
}

export function SearchableCombobox({
  configName,
  options,
  recentOptions = [],
  value,
  onChange,
  onOptionsChange,
  placeholder = '선택 또는 입력...',
  className,
  clearable = true,
}: SearchableComboboxProps) {
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
      return recentOptions.slice(0, 5)
    }
  
    // 검색하면 전체 options에서 검색
    return options.filter(o =>
      chosungSearch(o, query.trim())
    )
  }, [options, recentOptions, query])

  const trimmed = query.trim()
  const exactMatch = options.some(o => o.toLowerCase() === trimmed.toLowerCase())
  const showCreateOption = trimmed.length > 0 && !exactMatch

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
        headers: {
          'Content-Type': 'application/json',
          ...buildAuthHeaders(getSession()!),
        },
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
        className={cn(
          "w-full h-9 rounded-lg border border-input bg-background px-3 flex items-center justify-between text-sm cursor-pointer hover:bg-accent transition-colors",
          className
        )}
      >
        <span className={cn("truncate", !value && "text-muted-foreground")}>
          {value || placeholder}
        </span>

        <span className="flex items-center gap-1 ml-2 flex-shrink-0">
          {value && clearable && (
            <span
              role="button"
              onClick={(e) => {
                e.stopPropagation()
                handleClear(e as unknown as React.MouseEvent)
              }}
              className="rounded-full hover:bg-muted p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X className="w-3 h-3" />
            </span>
          )}

          <ChevronsUpDown className="w-3.5 h-3.5 text-muted-foreground" />
        </span>
      </PopoverTrigger>

      <PopoverContent
        className="p-0 w-[var(--radix-popover-trigger-width)] min-w-[220px]"
        align="start"
        sideOffset={4}
      >
        {/* 검색 입력 */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
          <Search className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="검색 또는 직접 입력..."
            className="flex-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground"
          />
          {query && (
            <button onClick={() => setQuery('')} className="text-muted-foreground hover:text-foreground">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* 목록 */}
        <div ref={listRef} className="max-h-52 overflow-y-auto py-1">
          {filtered.length === 0 && !showCreateOption && (
            <p className="text-sm text-muted-foreground text-center py-6">검색 결과 없음</p>
          )}

          {filtered.map((opt, idx) => (
            <button
              key={opt}
              onClick={() => handleSelect(opt)}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors text-left',
                highlightIndex === idx ? 'bg-accent' : 'hover:bg-accent/60',
                value === opt && 'font-medium'
              )}
            >
              <Check
                className={cn(
                  'w-3.5 h-3.5 flex-shrink-0',
                  value === opt ? 'opacity-100 text-primary' : 'opacity-0'
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
          <div className="border-t border-border px-3 py-1.5">
            <p className="text-xs text-muted-foreground">{filtered.length}개 항목</p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
