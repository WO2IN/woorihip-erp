'use client'

import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Barcode, Link2, ListChecks, ScanBarcode, Unlink } from 'lucide-react'
import { toast } from 'sonner'
import { BarcodePrintButton } from '@/components/shared/barcode-print-button'
import { BarcodeScanDialog } from '@/components/shared/barcode-scan-dialog'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { cleanBarcode, fetchInbounds, findInbound, inboundQuantityText, type InboundItem } from '@/lib/inbound'
import { cn } from '@/lib/utils'

const dot = (value: string) => value.replace(/-/g, '.')

/**
 * 수입검사 성적서에 입고 바코드를 연동하는 줄.
 * 번호를 직접 치거나(스캐너도 여기에 입력됨), 카메라로 스캔하거나, 입고 목록에서 골라서 연동한다.
 * 연동하면 입고등록의 업체·품명·수량 등이 성적서에 채워지고, 이후 이력카드·출하성적서까지 같은 바코드가 따라간다.
 */
export function InboundLink({
  barcode,
  canWrite,
  taken,
  onLink,
  onClear,
  printLabel,
  match,
  className,
}: {
  barcode: string
  canWrite: boolean
  /** 입고 목록에서 기본으로 보여 줄 업체·규격. 비어 있는 값은 조건에서 뺀다. */
  match: { company: string; spec: string }
  /** 이미 다른 성적서에 연동된 바코드 (대문자 바코드 → 성적서 id) */
  taken: ReadonlyMap<string, string>
  onLink: (item: InboundItem) => void
  onClear: () => void
  printLabel: { partner: string; product: string; spec: string; lotNo: string; date: string }
  className?: string
}) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [scanOpen, setScanOpen] = useState(false)
  const [listOpen, setListOpen] = useState(false)
  const [linked, setLinked] = useState<InboundItem | null>(null)

  // 연동된 바코드의 입고 정보(업체·수량·입고일)를 보여 주려고 불러온다.
  useEffect(() => {
    if (!barcode) {
      setLinked(null)
      return
    }
    let stop = false
    fetchInbounds()
      .then((items) => { if (!stop) setLinked(findInbound(items, barcode) ?? null) })
      .catch(() => { if (!stop) setLinked(null) })
    return () => { stop = true }
  }, [barcode])

  function choose(item: InboundItem) {
    const owner = taken.get(item.barcode.toUpperCase())
    if (owner) {
      toast.error(`${item.barcode} 는 이미 다른 수입검사 성적서에 연동되어 있습니다.`)
      return false
    }
    onLink(item)
    setCode('')
    return true
  }

  async function lookup(raw: string) {
    const value = cleanBarcode(raw)
    if (!value || busy) return
    setBusy(true)
    try {
      const item = findInbound(await fetchInbounds(), value)
      if (!item) {
        toast.error(`${value} — 입고등록에서 발급한 바코드가 아닙니다. 입고 목록에서 확인해 주세요.`)
        return
      }
      choose(item)
    } catch {
      toast.error('입고 바코드를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.')
    } finally {
      setBusy(false)
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    void lookup(code)
  }

  return (
    <section className={cn('no-print rounded-xl border bg-card p-3 shadow-sm', className)} aria-label="입고 바코드 연동">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="flex items-center gap-1.5 text-sm font-bold text-slate-900 dark:text-white">
          <Barcode className="h-4 w-4 text-slate-500" />
          입고 바코드
        </span>

        {barcode ? (
          <>
            <span className="rounded-md bg-slate-900 px-2.5 py-1 font-mono text-[14px] font-bold tracking-[0.1em] text-white dark:bg-white dark:text-slate-900">{barcode}</span>
            <span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">
              {linked
                ? [
                    [linked.company, linked.product].filter(Boolean).join(' · '),
                    linked.receivedAt && `입고 ${dot(linked.receivedAt)}`,
                    inboundQuantityText(linked),
                    linked.lotNo && `LOT ${linked.lotNo}`,
                  ].filter(Boolean).join(' · ')
                : '입고 정보를 찾지 못했습니다'}
            </span>
            <div className="ml-auto flex items-center gap-1.5">
              <BarcodePrintButton className="h-8 px-2.5 text-[13px]" label={{ barcode, partner: printLabel.partner, product: printLabel.product, spec: printLabel.spec, lotNo: printLabel.lotNo, date: printLabel.date }} />
              {canWrite && (
                <>
                  <Button type="button" variant="outline" size="sm" className="h-8 px-2.5 text-[13px]" onClick={() => setListOpen(true)}>
                    <Link2 className="h-3.5 w-3.5" />변경
                  </Button>
                  <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-[13px] text-slate-500" onClick={onClear}>
                    <Unlink className="h-3.5 w-3.5" />해제
                  </Button>
                </>
              )}
            </div>
          </>
        ) : canWrite ? (
          <>
            <form onSubmit={submit} className="flex min-w-0 flex-1 items-center gap-2">
              <Input
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="바코드 번호를 입력하거나 스캐너로 찍으세요 (예: WR2611240001)"
                autoComplete="off"
                autoCapitalize="characters"
                className="h-9 min-w-0 flex-1 font-mono"
              />
              <Button type="submit" size="sm" className="h-9 px-3" disabled={busy || !code.trim()}>
                {busy ? '확인 중…' : '연동'}
              </Button>
            </form>
            <Button type="button" variant="outline" size="sm" className="h-9 px-3" onClick={() => setScanOpen(true)}>
              <ScanBarcode className="h-4 w-4" />스캔
            </Button>
            <Button type="button" variant="outline" size="sm" className="h-9 px-3" onClick={() => setListOpen(true)}>
              <ListChecks className="h-4 w-4" />입고 목록에서 선택
            </Button>
          </>
        ) : (
          <span className="text-[13px] text-muted-foreground">연동된 바코드가 없습니다.</span>
        )}
      </div>
      {!barcode && canWrite && (
        <p className="mt-2 text-xs text-muted-foreground">입고 바코드를 연동하면 업체·규격·수량이 채워지고, 이력카드와 출하성적서에도 같은 바코드가 자동으로 이어집니다.</p>
      )}

      <BarcodeScanDialog
        open={scanOpen}
        onOpenChange={setScanOpen}
        onDetect={(value) => void lookup(value)}
        title="입고 바코드 스캔"
      />
      <InboundPickDialog open={listOpen} onOpenChange={setListOpen} value={barcode} taken={taken} match={match} onPick={(item) => { if (choose(item)) setListOpen(false) }} />
    </section>
  )
}

const same = (a: string, b: string) => a.trim().toUpperCase() === b.trim().toUpperCase()

/**
 * 입고 목록에서 바코드를 골라 연동하는 창. 이미 다른 성적서에 연동된 입고는 흐리게 표시하고 고를 수 없다.
 * 기본은 성적서의 업체·규격과 같은 입고만, '진행중 바코드만'을 켜면 출하완료 전인 바코드 전체를 보여 준다.
 */
function InboundPickDialog({
  open,
  onOpenChange,
  value,
  taken,
  match,
  onPick,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  value: string
  taken: ReadonlyMap<string, string>
  match: { company: string; spec: string }
  onPick: (item: InboundItem) => void
}) {
  const [items, setItems] = useState<InboundItem[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [query, setQuery] = useState('')
  const [inProgress, setInProgress] = useState(false)

  useEffect(() => {
    if (!open) return
    let stop = false
    setItems(null)
    setFailed(false)
    setQuery('')
    setInProgress(false)
    fetchInbounds()
      .then((rows) => { if (!stop) setItems(rows) })
      .catch(() => { if (!stop) setFailed(true) })
    return () => { stop = true }
  }, [open])

  const shown = useMemo(() => {
    const needle = query.trim().toUpperCase()
    return (items ?? [])
      .filter((item) => (inProgress
        ? item.status !== 'shipped'
        : (!match.company || same(item.company, match.company)) && (!match.spec || same(item.product, match.spec))))
      .filter((item) => !needle || [item.barcode, item.company, item.product, item.lotNo].some((text) => text.toUpperCase().includes(needle)))
  }, [items, query, inProgress, match.company, match.spec])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent overlayClassName="!z-[90]" className="!z-[100] max-h-[88dvh] overflow-y-auto sm:max-w-lg" onPointerDown={(event) => event.stopPropagation()}>
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">입고 목록에서 선택</DialogTitle>
          <DialogDescription>입고등록에서 발급된 바코드를 고르면 업체·규격·수량이 성적서에 채워집니다.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="바코드, 업체, 품명, LOT 검색" className="min-w-0 flex-1" autoComplete="off" />
          <button
            type="button"
            onClick={() => setInProgress((current) => !current)}
            aria-pressed={inProgress}
            className={cn('h-9 shrink-0 rounded-md border px-3 text-xs font-semibold', inProgress ? 'border-blue-400 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200' : 'hover:bg-muted')}
          >
            전체 보기
          </button>
        </div>
        <p className="-mt-1 text-xs text-muted-foreground">
          {inProgress
            ? '출하완료 전인 바코드를 모두 보여 줍니다.'
            : match.company || match.spec
              ? `${[match.company, match.spec].filter(Boolean).join(' · ')} 입고만 보여 줍니다.`
              : '성적서에 업체·규격이 없어 전체 입고를 보여 줍니다.'}
        </p>

        <div className="space-y-2">
          {failed ? (
            <p className="rounded-xl border border-dashed px-3 py-4 text-sm text-rose-600">입고 목록을 불러오지 못했습니다.</p>
          ) : items === null ? (
            <p className="px-1 py-4 text-sm text-muted-foreground">불러오는 중…</p>
          ) : shown.length === 0 ? (
            <p className="rounded-xl border border-dashed px-3 py-4 text-sm text-muted-foreground">
              {inProgress ? '진행중인 바코드가 없습니다.' : '업체·규격이 맞는 입고가 없습니다. 진행중 바코드만 눌러 다른 입고를 찾아보세요.'}
            </p>
          ) : (
            shown.map((item) => {
              const used = taken.has(item.barcode.toUpperCase()) && item.barcode !== value
              return (
                <button
                  key={item.barcode}
                  type="button"
                  disabled={used}
                  onClick={() => onPick(item)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition',
                    used ? 'cursor-not-allowed opacity-50' : 'hover:border-blue-400 hover:bg-blue-50/60 dark:hover:bg-blue-950/30',
                    item.barcode === value && 'border-blue-500 bg-blue-50 dark:bg-blue-950/40',
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-[15px] font-bold tracking-[0.08em]">{item.barcode}</span>
                      {item.source === 'manual' && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">직접 등록</span>}
                    </span>
                    <span className="mt-1 flex min-w-0 items-baseline gap-1.5">
                      <span className="truncate text-sm font-bold text-foreground">{item.company}</span>
                      {item.product && <span className="truncate text-xs text-muted-foreground">{item.product}</span>}
                    </span>
                    <span className="mt-1.5 flex flex-wrap gap-1">
                      {([
                        ['입고', item.receivedAt ? dot(item.receivedAt) : ''],
                        ['수량', inboundQuantityText(item)],
                        ['LOT', item.lotNo],
                        ['층', `${item.floor}층`],
                      ] as const).filter(([, text]) => text).map(([label, text]) => (
                        <span key={label} className="inline-flex max-w-full items-center gap-1 rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[11px] leading-4">
                          <span className="text-muted-foreground">{label}</span>
                          <span className="truncate font-semibold text-foreground">{text}</span>
                        </span>
                      ))}
                    </span>
                  </span>
                  {used && <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">수입검사 연동됨</span>}
                </button>
              )
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
