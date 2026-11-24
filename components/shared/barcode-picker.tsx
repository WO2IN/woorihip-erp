'use client'

import { useEffect, useMemo, useState } from 'react'
import { Link2, Plus } from 'lucide-react'
import { BarcodeRegisterDialog } from '@/components/shared/barcode-register-dialog'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { getAuthHeaders } from '@/lib/auth-client'
import { BARCODE_STATUS_LABEL, type TraceBarcodeOption } from '@/lib/trace'
import { cn } from '@/lib/utils'

const dot = (value: string) => value.replace(/-/g, '.')

/**
 * 이력카드에 연결할 제품 바코드를 고르는 버튼.
 * 입고등록 한 건당 바코드가 하나이고, LOT 를 나눠 이력카드를 여러 장 만들어도 같은 바코드를 고르면 한 바코드로 묶인다.
 */
export function BarcodePicker({
  company,
  product,
  value,
  onSelect,
  className,
}: {
  company: string
  product: string
  value: string
  onSelect: (barcode: string) => void
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [registerOpen, setRegisterOpen] = useState(false)
  const [options, setOptions] = useState<TraceBarcodeOption[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [query, setQuery] = useState('')

  const scoped = Boolean(company.trim() && product.trim())

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setOptions(null)
    setFailed(false)
    setShowAll(!scoped)
    setQuery('')
    fetch('/api/trace-barcodes', { cache: 'no-store', headers: getAuthHeaders() })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('barcodes'))))
      .then((body) => { if (!cancelled) setOptions(Array.isArray(body?.data) ? body.data : []) })
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [open, scoped])

  const shown = useMemo(() => {
    const needle = query.trim().toUpperCase()
    return (options ?? [])
      .filter((item) => showAll || !scoped || (item.company === company.trim() && item.product === product.trim()))
      .filter((item) => !needle || [item.barcode, item.company, item.product].some((text) => text.toUpperCase().includes(needle)))
  }, [options, query, showAll, scoped, company, product])

  function choose(barcode: string) {
    onSelect(barcode)
    setOpen(false)
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn('no-print', className)}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={() => setOpen(true)}
      >
        <Link2 className="h-3.5 w-3.5" />
        {value ? '바코드 변경' : '바코드 선택'}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent overlayClassName="!z-[90]" className="!z-[100] max-h-[88dvh] overflow-y-auto sm:max-w-lg" onPointerDown={(event) => event.stopPropagation()}>
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">바코드 선택</DialogTitle>
            <DialogDescription>
              입고등록에서 발급된 바코드를 고르세요. 같은 입고분을 LOT로 나눈 이력카드는 같은 바코드를 고르면 하나로 묶입니다.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap items-center gap-2">
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="바코드, 업체, 품명 검색" className="min-w-0 flex-1" autoComplete="off" />
            {scoped && (
              <button
                type="button"
                onClick={() => setShowAll((current) => !current)}
                aria-pressed={showAll}
                className={cn('h-9 shrink-0 rounded-md border px-3 text-xs font-semibold', showAll ? 'border-blue-400 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200' : 'hover:bg-muted')}
              >
                {showAll ? '전체 보는 중' : '이 업체·품명만'}
              </button>
            )}
          </div>

          <div className="space-y-2">
            {failed ? (
              <p className="rounded-xl border border-dashed px-3 py-4 text-sm text-rose-600">바코드 목록을 불러오지 못했습니다.</p>
            ) : options === null ? (
              <p className="px-1 py-4 text-sm text-muted-foreground">불러오는 중…</p>
            ) : shown.length === 0 ? (
              <p className="rounded-xl border border-dashed px-3 py-4 text-sm text-muted-foreground">
                {scoped && !showAll ? '이 업체·품명으로 발급된 바코드가 없습니다. 입고등록을 하거나 아래에서 직접 등록하세요.' : '조건에 맞는 바코드가 없습니다.'}
              </p>
            ) : (
              shown.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => choose(item.barcode)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition hover:border-blue-400 hover:bg-blue-50/60 dark:hover:bg-blue-950/30',
                    item.barcode === value && 'border-blue-500 bg-blue-50 dark:bg-blue-950/40',
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-mono text-[15px] font-bold tracking-[0.08em]">{item.barcode}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {[item.company, item.product].filter(Boolean).join(' · ')}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {[
                        item.receivedAt && `입고 ${dot(item.receivedAt)}`,
                        item.quantity > 0 && `${item.quantity} ${item.quantityUnit}`,
                        item.source === 'manual' && '직접 등록',
                        item.cardCount > 0 && `이력카드 ${item.cardCount}장`,
                      ].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    {BARCODE_STATUS_LABEL[item.status]}
                  </span>
                </button>
              ))
            )}
          </div>

          <Button type="button" variant="outline" onClick={() => setRegisterOpen(true)} className="w-full">
            <Plus className="h-4 w-4" />입고 없이 바코드 직접 등록
          </Button>
        </DialogContent>
      </Dialog>

      <BarcodeRegisterDialog
        open={registerOpen}
        onOpenChange={setRegisterOpen}
        defaultCompany={company.trim()}
        defaultProduct={product.trim()}
        onCreated={(record) => {
          onSelect(record.barcode)
          setOpen(false)
        }}
      />
    </>
  )
}
