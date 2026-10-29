'use client'

import { useState, useEffect } from 'react'
import { Plus, Trash2, Loader2, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { toast } from 'sonner'
import { notifyDataChanged } from '@/lib/data-events'
import { getSession, buildAuthHeaders } from '@/lib/auth-client'
import { cn } from '@/lib/utils'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

interface ConfigManagerProps {
  configName: string
  label: string
  placeholder?: string
}

function authHeadersOrThrow(): HeadersInit {
  const session = getSession()
  if (!session) {
    throw new Error('로그인이 필요합니다.')
  }
  return {
    'Content-Type': 'application/json',
    ...buildAuthHeaders(session),
  }
}

function Highlight({ text, keyword }: { text: string; keyword: string }) {
  const at = keyword ? text.toLowerCase().indexOf(keyword) : -1
  if (at < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, at)}
      <mark className="rounded-sm bg-amber-200/70 text-foreground dark:bg-amber-400/30">{text.slice(at, at + keyword.length)}</mark>
      {text.slice(at + keyword.length)}
    </>
  )
}

export function ConfigManager({
  configName,
  label,
  placeholder
}: ConfigManagerProps) {

  const [items, setItems] = useState<string[]>([])
  const [newItem, setNewItem] = useState('')
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<'recent' | 'name'>('recent')

  const [deletingItem, setDeletingItem] = useState<string | null>(null)
  const [forceDeleteTarget, setForceDeleteTarget] = useState<string | null>(null)

  const loadItems = async () => {
    setLoading(true)

    const res = await fetch(`/api/config?name=${configName}`)
    const data = await res.json()

    setItems(data.data || [])
    setLoading(false)
  }

  useEffect(() => {
    loadItems()
  }, [configName])

  const handleAdd = async () => {
    const trimmed = newItem.trim()
    if (!trimmed) return
    setAdding(true)

    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: authHeadersOrThrow(),
        body: JSON.stringify({
          name: configName,
          value: trimmed
        })
      })

      const data = await res.json()

      if (!res.ok)
        throw new Error(data.error)

      setItems(data.data)
      setNewItem('')
      notifyDataChanged('config')

      toast.success(`"${trimmed}"이(가) 추가되었습니다.`)

    } catch (err: unknown) {
      toast.error(
        err instanceof Error
          ? err.message
          : '추가에 실패했습니다.'
      )
    } finally {
      setAdding(false)
    }
  }

  const handleDelete = async (value: string) => {
    setDeletingItem(value)

    try {
      const res = await fetch('/api/config', {
        method: 'DELETE',
        headers: authHeadersOrThrow(),
        body: JSON.stringify({
          name: configName,
          value
        })
      })

      const data = await res.json()

      if (res.status === 409 && data.used === true) {
        setForceDeleteTarget(value)
        return
      }
      if (!res.ok)
        throw new Error(data.error)
      setItems(data.data)
      notifyDataChanged('config')
      toast.success(`"${value}"이(가) 삭제되었습니다.`)

    } catch (err: unknown) {
      toast.error(
        err instanceof Error
          ? err.message
          : '삭제에 실패했습니다.'
      )

    } finally {
      setDeletingItem(null)
    }
  }

  const handleForceDelete = async () => {
    if (!forceDeleteTarget)
      return
    const value = forceDeleteTarget
    setDeletingItem(value)

    try {
      const res = await fetch('/api/config', {
        method: 'DELETE',
        headers: authHeadersOrThrow(),
        body: JSON.stringify({
          name: configName,
          value,
          force: true
        })
      })
      const data = await res.json()
      if (!res.ok)
        throw new Error(data.error)
      setItems(data.data)
      notifyDataChanged('config')
      toast.success(`"${value}"이(가) 삭제되었습니다.`)
      setForceDeleteTarget(null)
    } catch (err: unknown) {
      toast.error(
        err instanceof Error
          ? err.message
          : '삭제에 실패했습니다.'
      )
    } finally {
      setDeletingItem(null)
    }
  }

  const forceDeleting = Boolean(
    forceDeleteTarget && deletingItem === forceDeleteTarget,
  )

  const keyword = query.trim().toLowerCase()
  const indexed = items.map((value, index) => ({ value, index }))
  const filtered = indexed.filter(({ value }) => !keyword || value.toLowerCase().includes(keyword))
  const visible = sort === 'name'
    ? [...filtered].sort((a, b) => a.value.localeCompare(b.value, 'ko'))
    : filtered
  const duplicate = Boolean(newItem.trim()) && items.includes(newItem.trim())

  return (
    <>
    <div className="space-y-3">
      <div className="rounded-xl border bg-muted/40 p-3">
        <p className="mb-2 text-xs font-semibold text-muted-foreground">새 {label} 추가</p>
        <div className="flex gap-2">
          <Input
            value={newItem}
            onChange={e => setNewItem(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing && !duplicate)
                void handleAdd()
            }}
            placeholder={placeholder || `새 ${label} 입력`}
            className="flex-1 bg-background"
          />
          <Button onClick={() => void handleAdd()} disabled={adding || !newItem.trim() || duplicate} className="gap-1">
            {adding ? <Loader2 className="h-4 w-4 animate-spin"/> : <Plus className="h-4 w-4"/>}
            추가
          </Button>
        </div>
        {duplicate && (
          <p className="mt-1.5 text-xs font-medium text-destructive">이미 등록된 {label}입니다.</p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={`${label} 검색`}
            className="pl-9 pr-8"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="검색어 지우기"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex rounded-lg border p-0.5 text-xs font-semibold">
          {([['recent', '등록순'], ['name', '가나다']] as const).map(([key, text]) => (
            <button
              key={key}
              type="button"
              onClick={() => setSort(key)}
              className={cn(
                'rounded-md px-2.5 py-1.5 transition-colors',
                sort === key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {text}
            </button>
          ))}
        </div>
      </div>

      <p className="px-1 text-xs text-muted-foreground">
        {keyword ? <>검색 결과 <b className="text-foreground">{visible.length}</b>개 / </> : null}
        전체 <b className="text-foreground">{items.length}</b>개
      </p>

      <div className="overflow-hidden rounded-xl border">
        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground"/>
          </div>
        ) : visible.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            {keyword ? `"${query.trim()}" 검색 결과가 없습니다.` : '등록된 항목이 없습니다.'}
          </div>
        ) : (
          <ScrollArea className="h-[min(420px,50vh)]">
            <div className="divide-y divide-border">
              {visible.map(({ value, index }) => (
                <div
                  key={value}
                  className={cn(
                    'group flex items-center gap-3 px-3 py-2 transition-colors hover:bg-muted/50',
                    deletingItem === value && 'opacity-50'
                  )}
                >
                  <span className="w-7 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">{index + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-sm" title={value}>
                    <Highlight text={value} keyword={keyword} />
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive opacity-100 hover:bg-destructive/10 hover:text-destructive sm:opacity-0 sm:group-hover:opacity-100"
                    onClick={() => void handleDelete(value)}
                    disabled={deletingItem === value}
                    aria-label={`${value} 삭제`}
                  >
                    {deletingItem === value
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin"/>
                      : <Trash2 className="h-3.5 w-3.5"/>}
                  </Button>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>

    <AlertDialog
      open={!!forceDeleteTarget}
      onOpenChange={(open) => {
        if (!open && !forceDeleting) setForceDeleteTarget(null)
      }}
    >
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>사용 중인 항목 삭제</AlertDialogTitle>
          <AlertDialogDescription
            render={<div />}
            className="space-y-2 text-left text-sm text-muted-foreground"
          >
            <p>
              <span className="font-semibold text-foreground">{forceDeleteTarget}</span>
              은(는) 등록된 문서에서 사용 중입니다. 목록에서 제거하시겠습니까?
            </p>
            <p className="text-xs">
              이미 등록된 문서의 값은 그대로 남고, 선택 목록에서만 제거됩니다.
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={forceDeleting}>취소</AlertDialogCancel>
          <AlertDialogAction
            disabled={forceDeleting}
            className="bg-destructive text-white hover:bg-destructive/90"
            onClick={(event) => {
              event.preventBaseUIHandler()
              void handleForceDelete()
            }}
          >
            {forceDeleting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              '삭제'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  )
}
