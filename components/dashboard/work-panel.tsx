'use client'

import { useCallback, useEffect, useState } from 'react'
import { Check, Play, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/components/auth/auth-context'
import { confirmModal } from '@/components/shared/confirm-modal'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger } from '@/components/ui/select'
import { getJsonAuthHeaders } from '@/lib/auth-client'
import { lineName, linesOf } from '@/lib/production-lines'
import { type BarcodeStatus } from '@/lib/trace'
import { cn } from '@/lib/utils'

type WorkCard = {
  id: string
  barcode?: string
  lotNo?: string
  /** 고객(협력업체) 쪽 LOT 번호 */
  customerLot?: string
  rollWeight?: string
  sortOrder?: number
  createdAt?: string
  workStatus?: 'working' | 'done' | ''
  workStartedAt?: string
  workStartedBy?: string
  workDoneAt?: string
  workDoneBy?: string
  floor?: string
  /** 작업한 생산 라인 번호 (0·없음 = 안 고름) */
  workLine?: number
}

const TIME = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
const timeOf = (value?: string) => (value && !Number.isNaN(Date.parse(value)) ? TIME.format(new Date(value)) : '')

/** '1,515 Kg', '100kg' 처럼 적힌 무게에서 숫자만 읽는다. */
function kgOf(value?: string) {
  const match = (value ?? '').replace(/,/g, '').match(/\d+(?:\.\d+)?/)
  return match ? Number(match[0]) : 0
}

const kg = (value: number) => `${value.toLocaleString('ko-KR', { maximumFractionDigits: 1 })} kg`

/**
 * 현장 작업: 이 바코드(입고)의 이력카드(롤) 목록. 롤마다 작업 시작 → 작업 완료를 누르고,
 * 완료한 롤 무게만큼 게이지가 찬다. 모든 롤이 완료되면 서버가 바코드를 출하대기로 넘긴다.
 */
export function WorkPanel({ barcode, status, inboundQuantity, onChanged }: {
  barcode: string
  status: BarcodeStatus
  /** 입고 수량 (예: '300 Kg'). 게이지 100% 기준 */
  inboundQuantity: string
  /** 상태가 바뀐 뒤 제품 이력을 다시 불러온다 */
  onChanged: () => void
}) {
  const { user } = useAuth()
  const canWrite = user?.role === 'editor' || user?.role === 'admin'
  const [cards, setCards] = useState<WorkCard[] | null>(null)
  const [busyId, setBusyId] = useState('')

  const load = useCallback(async () => {
    const response = await fetch('/api/lot-cards', { cache: 'no-store' })
    const body = await response.json().catch(() => null)
    const rows = Array.isArray(body?.data) ? (body.data as WorkCard[]) : []
    const key = barcode.toUpperCase()
    setCards(rows
      .filter((card) => (card.barcode ?? '').trim().toUpperCase() === key)
      .sort((a, b) => (a.sortOrder ?? 1e9) - (b.sortOrder ?? 1e9) || (a.createdAt ?? '').localeCompare(b.createdAt ?? '')))
  }, [barcode])

  useEffect(() => { void load() }, [load])

  async function chooseLine(card: WorkCard, line: number) {
    setCards((current) => current?.map((item) => (item.id === card.id ? { ...item, workLine: line } : item)) ?? null)
    const response = await fetch('/api/lot-cards/work', { method: 'POST', headers: getJsonAuthHeaders(user), body: JSON.stringify({ id: card.id, action: 'line', line }) })
    if (!response.ok) {
      const body = await response.json().catch(() => null)
      toast.error(body?.error ?? '라인을 저장하지 못했습니다.')
      setCards((current) => current?.map((item) => (item.id === card.id ? { ...item, workLine: card.workLine } : item)) ?? null)
    }
  }

  async function act(card: WorkCard, action: 'start' | 'done' | 'reset') {
    if (action === 'start' && !kgOf(card.rollWeight)) {
      const ok = await confirmModal({
        title: '롤 무게가 기입되어 있지 않습니다',
        description: `${card.lotNo || '이 롤'}의 해당 롤 무게가 비어 있어 게이지에 반영되지 않습니다. 작업을 시작하시겠습니까?`,
        confirmLabel: '작업 시작',
      })
      if (!ok) return
    }
    setBusyId(card.id)
    try {
      const response = await fetch('/api/lot-cards/work', { method: 'POST', headers: getJsonAuthHeaders(user), body: JSON.stringify({ id: card.id, action }) })
      const body = await response.json().catch(() => null)
      if (!response.ok) throw new Error(body?.error ?? '작업 상태를 바꾸지 못했습니다.')
      setCards((current) => current?.map((item) => (item.id === card.id ? { ...item, ...body.data } : item)) ?? null)
      onChanged()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '작업 상태를 바꾸지 못했습니다.')
    } finally {
      setBusyId('')
    }
  }

  const list = cards ?? []
  const rollTotal = list.reduce((sum, card) => sum + kgOf(card.rollWeight), 0)
  // 입고등록 중량을 100% 로 잡는다. 입고 중량을 읽을 수 없을 때만 롤 무게 합을 쓴다.
  const total = kgOf(inboundQuantity) || rollTotal
  const doneKg = list.filter((card) => card.workStatus === 'done').reduce((sum, card) => sum + kgOf(card.rollWeight), 0)
  const workingKg = list.filter((card) => card.workStatus === 'working').reduce((sum, card) => sum + kgOf(card.rollWeight), 0)
  const doneCount = list.filter((card) => card.workStatus === 'done').length
  const percent = total > 0 ? Math.min(100, (doneKg / total) * 100) : list.length > 0 ? (doneCount / list.length) * 100 : 0
  const workingPercent = total > 0 ? Math.min(100 - percent, (workingKg / total) * 100) : 0
  const allDone = list.length > 0 && doneCount === list.length
  const missingWeight = list.some((card) => !kgOf(card.rollWeight))

  return (
    <section className="min-w-0 rounded-2xl border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-extrabold text-slate-900 dark:text-white">현장 작업</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">작업할 롤의 이력카드에서 작업 시작 → 작업 완료를 누릅니다.</p>
        </div>
        {allDone && (
          <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-bold text-violet-800 dark:bg-violet-500/25 dark:text-violet-200">
            모든 롤 작업 완료 · {status === 'shipped' ? '출하완료' : '출하대기'}
          </span>
        )}
      </div>

      {/* 게이지: 완료한 롤 무게(초록) + 작업 중인 롤 무게(노랑) / 입고 무게 */}
      <div className="mt-3">
        <div className="flex items-baseline justify-between gap-2 text-sm">
          <span className="font-bold tabular-nums text-slate-900 dark:text-white">
            {total > 0 ? `${kg(doneKg)} / ${kg(total)}` : `${doneCount} / ${list.length} 롤`}
          </span>
          <span className="text-xs font-semibold tabular-nums text-muted-foreground">
            완료 {doneCount} / {list.length} 롤 · {Math.round(percent)}%
          </span>
        </div>
        <div className="mt-1.5 flex h-5 overflow-hidden rounded-full bg-slate-100 ring-1 ring-inset ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
          <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${percent}%` }} />
          <div className="h-full bg-amber-300 bg-[repeating-linear-gradient(45deg,transparent_0_6px,rgba(255,255,255,0.45)_6px_12px)] transition-all duration-500" style={{ width: `${workingPercent}%` }} />
        </div>
        {missingWeight && list.length > 0 && (
          <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-300">롤 무게가 비어 있는 이력카드가 있어 게이지가 정확하지 않을 수 있습니다. (이력카드의 '해당 롤 무게')</p>
        )}
      </div>

      {/* 롤 목록 */}
      <div className="mt-3 space-y-2">
        {cards === null ? (
          <p className="rounded-xl border border-dashed px-3 py-3 text-sm text-muted-foreground">이력카드를 불러오는 중…</p>
        ) : list.length === 0 ? (
          <p className="rounded-xl border border-dashed px-3 py-3 text-sm text-muted-foreground">아직 이력카드가 없습니다. 수입검사 성적서에서 이력카드를 만들면 여기에 롤 목록이 나옵니다.</p>
        ) : (
          list.map((card, index) => {
            const state = card.workStatus
            const busy = busyId === card.id
            return (
              <div
                key={card.id}
                className={cn(
                  'flex flex-wrap items-center gap-3 rounded-xl border px-3 py-2.5',
                  state === 'working' && 'border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-950/30',
                  state === 'done' && 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-500/30 dark:bg-emerald-950/20',
                )}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-base font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{index + 1}</span>
                {/* 칸을 나눠 줄마다 같은 자리에 오게: LOT · 고객 LOT · 무게 · 상태 (각 칸 위에 작은 이름) */}
                <div className="grid min-w-0 flex-1 grid-cols-[8.5rem_9.5rem_4.5rem_minmax(7rem,1fr)] items-center gap-x-5 gap-y-1">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold text-muted-foreground">LOT No.</p>
                    <p className="truncate font-mono text-[15px] font-bold tracking-wide text-slate-900 dark:text-white">{card.lotNo || '-'}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold text-muted-foreground">고객 LOT No.</p>
                    <p className="truncate font-mono text-[15px] font-semibold text-slate-700 dark:text-slate-200">{card.customerLot?.trim() || '-'}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold text-muted-foreground">무게</p>
                    <p className={cn('text-[15px] font-bold tabular-nums', kgOf(card.rollWeight) ? 'text-slate-900 dark:text-white' : 'text-amber-600')}>{kgOf(card.rollWeight) ? kg(kgOf(card.rollWeight)) : '미입력'}</p>
                  </div>
                  {/* 상태: 완료(초록) · 작업중(주황) · 작업 전(회색) + 시각·사람 */}
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold text-muted-foreground">상태</p>
                    <p className={cn(
                      'text-sm font-extrabold',
                      state === 'done' ? 'text-emerald-700 dark:text-emerald-300' : state === 'working' ? 'text-amber-700 dark:text-amber-300' : 'text-slate-400',
                    )}>
                      {state === 'done' ? '● 완료' : state === 'working' ? '● 작업중' : '작업 전'}
                    </p>
                    {state && (
                      <p className="truncate text-xs tabular-nums text-muted-foreground">
                        {state === 'done'
                          ? `${timeOf(card.workDoneAt)}${card.workDoneBy ? ` · ${card.workDoneBy}` : ''}`
                          : `${timeOf(card.workStartedAt)} 시작${card.workStartedBy ? ` · ${card.workStartedBy}` : ''}`}
                      </p>
                    )}
                  </div>
                </div>
                {(() => {
                  const floor = Number(card.floor ?? 1)
                  const lines = linesOf(floor)
                  const current = card.workLine ?? 0
                  if (lines.length === 0) return null
                  if (!canWrite) return current ? <span className="shrink-0 text-sm font-semibold text-slate-600 dark:text-slate-300">{lineName(floor, current)}</span> : null
                  return (
                    <Select value={current ? String(current) : 'none'} onValueChange={(value) => void chooseLine(card, !value || value === 'none' ? 0 : Number(value))}>
                      <SelectTrigger aria-label="라인" className={cn('h-9 w-32 shrink-0 bg-white px-3 dark:bg-background', !current && 'border-dashed')}>
                        <span className={cn('truncate font-semibold', !current && 'font-normal text-muted-foreground')}>{current ? lineName(floor, current) : '라인 선택'}</span>
                      </SelectTrigger>
                      <SelectContent className="max-h-72">
                        <SelectGroup>
                          <SelectItem value="none" className="py-2 text-muted-foreground">선택 안 함</SelectItem>
                          {lines.map((item) => (
                            <SelectItem key={item.no} value={String(item.no)} className="py-2">
                              <span className="font-medium">{lineName(floor, item.no)}</span>
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  )
                })()}
                {canWrite && (
                  <div className="flex shrink-0 items-center gap-1.5">
                    {!state && (
                      <Button type="button" size="sm" disabled={busy} onClick={() => void act(card, 'start')} className="h-9 bg-amber-500 px-4 text-white hover:bg-amber-600">
                        <Play className="h-4 w-4" />작업 시작
                      </Button>
                    )}
                    {state === 'working' && (
                      <>
                        <Button type="button" size="sm" disabled={busy} onClick={() => void act(card, 'done')} className="h-9 bg-emerald-600 px-4 text-white hover:bg-emerald-700">
                          <Check className="h-4 w-4" />작업 완료
                        </Button>
                        <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void act(card, 'reset')} className="h-9 px-2 text-muted-foreground">취소</Button>
                      </>
                    )}
                    {state === 'done' && status !== 'shipped' && (
                      <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void act(card, 'reset')} className="h-9 px-2 text-muted-foreground">
                        <RotateCcw className="h-3.5 w-3.5" />되돌리기
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </section>
  )
}
