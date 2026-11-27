'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Barcode, Check, ChevronRight, ClipboardCheck, FileCheck, Loader2, PackagePlus } from 'lucide-react'
import { getAuthHeaders } from '@/lib/auth-client'
import { cn } from '@/lib/utils'

export type ShipmentDocStep = 'inbound' | 'incoming' | 'lot-card' | 'outgoing'
type Chain = Partial<Record<ShipmentDocStep, string>>
export type ShipmentDocState = 'none' | 'wip' | 'done'

/** 단계 상태 색: 작성 전 회색 · 작성 중 노랑 · 완료 초록 */
const STATE_CARD: Record<ShipmentDocState, string> = {
  none: 'border-slate-300 bg-slate-50 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900/40',
  wip: 'border-amber-300 bg-amber-50 hover:bg-amber-100/80 dark:border-amber-800 dark:bg-amber-950/30',
  done: 'border-emerald-300 bg-emerald-50 hover:bg-emerald-100/80 dark:border-emerald-800 dark:bg-emerald-950/30',
}
const STATE_BADGE: Record<ShipmentDocState, string> = {
  none: 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  wip: 'bg-amber-200 text-amber-900 dark:bg-amber-900/60 dark:text-amber-200',
  done: 'bg-emerald-200 text-emerald-900 dark:bg-emerald-900/60 dark:text-emerald-200',
}
const STATE_TEXT: Record<ShipmentDocState, string> = {
  none: 'text-slate-500',
  wip: 'text-amber-700 dark:text-amber-300',
  done: 'text-emerald-700 dark:text-emerald-300',
}
const STATE_LABEL: Record<ShipmentDocState, string> = { none: '작성 전', wip: '작성 중', done: '완료' }

const STEPS = [
  {
    id: 'inbound' as const,
    seq: 1,
    short: '입고등록',
    label: '입고 등록 · 바코드',
    href: '/shipment?tab=flow',
    icon: PackagePlus,
  },
  {
    id: 'incoming' as const,
    seq: 2,
    short: '수입검사',
    label: '수입검사 성적서',
    href: '/shipment/incoming-inspection',
    icon: ClipboardCheck,
  },
  {
    id: 'lot-card' as const,
    seq: 3,
    short: '이력카드',
    label: 'LOT 이력카드',
    href: '/shipment/lot-card',
    icon: Barcode,
  },
  {
    id: 'outgoing' as const,
    seq: 4,
    short: '출하',
    label: '출하성적서',
    href: '/shipment/outgoing-report',
    icon: FileCheck,
  },
] as const

const NEXT_LABEL: Record<ShipmentDocStep, string | null> = {
  inbound: '수입검사 성적서로 이어쓰기',
  incoming: 'LOT 이력카드로 이어쓰기',
  'lot-card': '출하성적서로 이어쓰기',
  outgoing: null,
}

type Rec = { id?: string; sourceIncomingId?: string; sourceLotCardId?: string; barcode?: string; done?: boolean }

async function loadRecords(path: string): Promise<Rec[]> {
  try {
    const response = await fetch(path, { cache: 'no-store', headers: getAuthHeaders() })
    const body = await response.json().catch(() => null)
    return Array.isArray(body?.data) ? (body.data as Rec[]) : []
  } catch {
    return []
  }
}

/** 문서 하나의 id에서 같은 묶음의 수입검사·이력카드·출하성적서 id를 찾는다. */
async function resolveChain(step: ShipmentDocStep, currentId: string): Promise<{ chain: Chain; states: Partial<Record<ShipmentDocStep, ShipmentDocState>> }> {
  const [sheets, cards, reports] = await Promise.all([
    loadRecords('/api/incoming-inspections'),
    loadRecords('/api/lot-cards'),
    loadRecords('/api/outgoing-reports'),
  ])
  let sheetId: string | undefined
  let cardId: string | undefined
  let reportId: string | undefined
  if (step === 'incoming') {
    sheetId = currentId
    const code = sheets.find((sheet) => sheet.id === currentId)?.barcode?.trim().toUpperCase()
    const mine = cards.filter((card) => card.sourceIncomingId === currentId || (code && card.barcode?.trim().toUpperCase() === code))
    const mineIds = new Set(mine.map((card) => card.id))
    cardId = mine.find((card) => card.sourceIncomingId === currentId)?.id ?? mine[0]?.id
    reportId = reports.find((report) => report.sourceLotCardId && mineIds.has(report.sourceLotCardId))?.id
      ?? (code ? reports.find((report) => report.barcode?.trim().toUpperCase() === code)?.id : undefined)
  } else if (step === 'lot-card') {
    // 한 입고를 여러 롤로 나눠 카드를 여러 장 만들어도 수입검사·출하성적서는 하나를 같이 쓴다.
    cardId = currentId
    const card = cards.find((item) => item.id === currentId)
    const code = card?.barcode?.trim().toUpperCase()
    const siblings = new Set(cards
      .filter((item) => item.id === currentId || (code && item.barcode?.trim().toUpperCase() === code) || (card?.sourceIncomingId && item.sourceIncomingId === card.sourceIncomingId))
      .map((item) => item.id))
    sheetId = card?.sourceIncomingId
      || cards.find((item) => siblings.has(item.id) && item.sourceIncomingId)?.sourceIncomingId
      || (code ? sheets.find((sheet) => sheet.barcode?.trim().toUpperCase() === code)?.id : undefined)
    reportId = reports.find((report) => report.sourceLotCardId === currentId)?.id
      ?? reports.find((report) => report.sourceLotCardId && siblings.has(report.sourceLotCardId))?.id
      ?? (code ? reports.find((report) => report.barcode?.trim().toUpperCase() === code)?.id : undefined)
  } else if (step === 'outgoing') {
    reportId = currentId
    cardId = reports.find((report) => report.id === currentId)?.sourceLotCardId
    sheetId = cards.find((card) => card.id === cardId)?.sourceIncomingId
  }
  // 기록이 있으면 '완료'를 눌렀는지로 작성 중·완료를 가린다. 이력카드는 같은 입고 카드가 모두 완료여야 완료다.
  const stateOf = (done: boolean | undefined): ShipmentDocState => (done ? 'done' : 'wip')
  const card = cards.find((item) => item.id === cardId)
  const cardCode = card?.barcode?.trim().toUpperCase()
  const cardGroup = card
    ? cards.filter((item) => item.id === card.id || (cardCode && item.barcode?.trim().toUpperCase() === cardCode) || (card.sourceIncomingId && item.sourceIncomingId === card.sourceIncomingId))
    : []
  const states: Partial<Record<ShipmentDocStep, ShipmentDocState>> = {}
  if (sheetId) states.incoming = stateOf(sheets.find((item) => item.id === sheetId)?.done)
  if (card) states['lot-card'] = stateOf(cardGroup.every((item) => item.done))
  if (reportId) states.outgoing = stateOf(reports.find((item) => item.id === reportId)?.done)
  return { chain: { incoming: sheetId, 'lot-card': cardId, outgoing: reportId }, states }
}

/**
 * 입고 → 수입검사 → 이력카드 → 출하 흐름 바.
 * 화면 위에 붙어 있어서 긴 서식을 내려 쓰다가도 바로 다음 단계로 넘어가거나 완료·인쇄할 수 있다.
 * 다음 단계 카드가 곧 '이어쓰기' 버튼이다.
 */
export function ShipmentDocFlowNav({
  step,
  canWrite = false,
  onNext,
  nextDisabled,
  nextLoading,
  currentId,
  ids,
  actions,
  states,
}: {
  step: ShipmentDocStep
  canWrite?: boolean
  onNext?: () => void
  nextDisabled?: boolean
  nextLoading?: boolean
  /** 문서 화면에서 지금 열린 문서 id. 같은 묶음의 앞뒤 단계를 찾는 데 쓴다. */
  currentId?: string
  /** 입고 목록처럼 묶음을 직접 알려 줄 때 쓴다. 있으면 currentId 조회보다 우선한다. */
  ids?: Chain
  /** 흐름 바 오른쪽에 놓는 문서 버튼들 (양식·완료·인쇄 등) */
  actions?: ReactNode
  /** 단계별 작성 상태. 주면 카드를 상태 색(회색·노랑·초록)으로 칠한다. */
  states?: Partial<Record<ShipmentDocStep, ShipmentDocState>>
}) {
  const router = useRouter()
  const [fetched, setFetched] = useState<Chain>({})
  const [fetchedStates, setFetchedStates] = useState<Partial<Record<ShipmentDocStep, ShipmentDocState>>>({})
  const activeIndex = STEPS.findIndex((item) => item.id === step)
  const chain: Chain = ids ?? fetched
  // 묶음을 직접 받지 않은 문서 화면에서는 불러온 완료 여부로 단계 색을 칠한다.
  const stepStates = states ?? (ids ? undefined : fetchedStates)
  const canContinue = canWrite && !!onNext && !!NEXT_LABEL[step]

  useEffect(() => {
    if (ids || !currentId) return
    let cancelled = false
    void resolveChain(step, currentId).then((result) => {
      if (cancelled) return
      setFetched(result.chain)
      setFetchedStates(result.states)
    })
    return () => { cancelled = true }
  }, [ids, currentId, step])

  function go(index: number) {
    const item = STEPS[index]
    const id = chain[item.id]
    router.push(id ? `${item.href}?open=${encodeURIComponent(id)}` : item.href)
  }

  return (
    <nav
      aria-label="입고 품질 서류 흐름"
      className="no-print sticky top-0 z-30 -mx-1 flex flex-col gap-2 rounded-2xl border border-slate-300/80 bg-card/95 p-2 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/85 dark:border-slate-800/60 xl:flex-row xl:items-center"
    >
      <ol className="flex min-w-0 flex-1 flex-col gap-1.5 md:flex-row md:items-stretch">
        {STEPS.map((item, index) => {
          const active = item.id === step
          const previous = index < activeIndex
          const hasRecord = !!chain[item.id]
          const isNext = index === activeIndex + 1
          const isLast = index === STEPS.length - 1
          const Icon = item.icon

          // 다음 단계 카드는 이어쓰기 버튼이 된다. 이어쓰기는 앞 단계 값을 채워 넣고 그 문서를 연다.
          if (isNext && canContinue) {
            const disabled = nextDisabled || nextLoading
            const state = stepStates?.[item.id]
            if (state) {
              return (
                <li key={item.id} className="flex min-w-0 flex-1 items-center gap-1 md:gap-0">
                  <button
                    type="button"
                    onClick={onNext}
                    disabled={disabled}
                    title={state === 'none' ? NEXT_LABEL[step] ?? undefined : `${item.short} 열기`}
                    className={cn(
                      'flex h-12 w-full min-w-0 items-center gap-2.5 rounded-xl border px-3 text-left text-slate-800 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/40 dark:text-white',
                      STATE_CARD[state],
                      disabled && 'cursor-not-allowed opacity-50',
                    )}
                  >
                    <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold', STATE_BADGE[state])}>
                      {state === 'done' ? <Check className="h-4 w-4" /> : item.seq}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold">{item.short}</span>
                      <span className={cn('block truncate text-[11px] font-semibold leading-4', STATE_TEXT[state])}>
                        {nextLoading ? '이동 중…' : state === 'none' ? '작성 전 · 눌러서 작성' : STATE_LABEL[state]}
                      </span>
                    </span>
                    {nextLoading ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : <ArrowRight className={cn('h-4 w-4 shrink-0', STATE_TEXT[state])} />}
                  </button>
                  {!isLast && <ChevronRight className="mx-0.5 hidden h-4 w-4 shrink-0 text-slate-300 md:block dark:text-slate-700" aria-hidden />}
                </li>
              )
            }
            return (
              <li key={item.id} className="flex min-w-0 flex-1 items-center gap-1 md:gap-0">
                <button
                  type="button"
                  onClick={onNext}
                  disabled={disabled}
                  title={NEXT_LABEL[step] ?? undefined}
                  className={cn(
                    'flex h-12 w-full min-w-0 items-center gap-2.5 rounded-xl border-2 border-dashed border-emerald-500 bg-emerald-50/60 px-3 text-left text-slate-800 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50 dark:border-emerald-600 dark:bg-emerald-950/30 dark:text-white',
                    disabled ? 'cursor-not-allowed opacity-50' : 'hover:bg-emerald-100/70 dark:hover:bg-emerald-950/50',
                  )}
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-emerald-500 bg-white text-sm font-bold text-emerald-700">{item.seq}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">{item.short}</span>
                    <span className="block truncate text-[11px] leading-4 text-emerald-700 dark:text-emerald-300">
                      {nextLoading ? '이동 중…' : hasRecord ? '이어서 열기' : '다음 단계로 이어쓰기'}
                    </span>
                  </span>
                  {nextLoading ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-emerald-700" /> : <ArrowRight className="h-4 w-4 shrink-0 text-emerald-700" />}
                </button>
                {!isLast && <ChevronRight className="mx-0.5 hidden h-4 w-4 shrink-0 text-slate-300 md:block dark:text-slate-700" aria-hidden />}
              </li>
            )
          }

          // 이전 단계는 항상 갈 수 있고, 뒤 단계는 기록이 있을 때만 간다.
          const clickable = !active && (previous || hasRecord)
          const state = active ? undefined : stepStates?.[item.id]
          const card = state ? (
            <span className={cn('flex h-12 w-full items-center gap-2.5 rounded-xl border px-3 text-left text-slate-800 transition-colors dark:text-white', STATE_CARD[state], !clickable && 'hover:bg-[unset]')}>
              <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold', STATE_BADGE[state])}>
                {state === 'done' ? <Check className="h-4 w-4" /> : item.seq}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold">{item.short}</span>
                <span className={cn('hidden truncate text-[11px] font-semibold leading-4 sm:block', STATE_TEXT[state])}>{STATE_LABEL[state]}</span>
              </span>
            </span>
          ) : (
            <span
              className={cn(
                'flex h-12 w-full items-center gap-2.5 rounded-xl border px-3 text-left transition-colors',
                active && 'border-slate-800 bg-slate-800 text-white shadow-md dark:border-slate-500 dark:bg-slate-700',
                !active && hasRecord && 'border-emerald-200/70 bg-card hover:border-emerald-300 hover:bg-emerald-50/50 dark:border-emerald-900/40 dark:hover:bg-emerald-950/20',
                !active && !hasRecord && previous && 'border-border bg-card hover:bg-accent/50',
                !active && !hasRecord && !previous && 'border-dashed border-border bg-transparent opacity-70',
              )}
            >
              <span
                className={cn(
                  'flex size-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold',
                  active && 'bg-white text-slate-900',
                  !active && hasRecord && 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300',
                  !active && !hasRecord && 'bg-muted text-muted-foreground',
                )}
              >
                {!active && hasRecord && previous ? <Check className="h-4 w-4" /> : item.seq}
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn('block truncate text-sm', active ? 'font-bold text-white' : 'font-semibold text-muted-foreground')}>
                  {item.short}
                </span>
                <span className={cn('hidden truncate text-[11px] leading-4 sm:block', active ? 'font-semibold text-white/80' : 'text-muted-foreground/80')}>
                  {active ? '● 현재 작성 중' : item.label}
                </span>
              </span>
              {active ? <Icon className="hidden h-4 w-4 shrink-0 text-white/80 sm:block" /> : null}
            </span>
          )

          return (
            <li key={item.id} className="flex min-w-0 flex-1 items-center gap-1 md:gap-0">
              <div className="flex min-w-0 flex-1 items-stretch">
                {clickable ? (
                  <button
                    type="button"
                    onClick={() => go(index)}
                    title={`${item.short} 단계로 이동`}
                    className="flex w-full min-w-0 cursor-pointer rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  >
                    {card}
                  </button>
                ) : (
                  card
                )}
              </div>
              {!isLast && <ChevronRight className="mx-0.5 hidden h-4 w-4 shrink-0 text-slate-300 md:block dark:text-slate-700" aria-hidden />}
            </li>
          )
        })}
      </ol>

      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border pt-2 xl:border-l xl:border-t-0 xl:pl-3 xl:pt-0">
          {actions}
        </div>
      ) : null}
    </nav>
  )
}
