'use client'

import { useCallback, useEffect, useRef, useState, useTransition, type FormEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type WheelEvent as ReactWheelEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle,
  Boxes,
  CalendarDays,
  CalendarRange,
  Check,
  CircleCheck,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Factory,
  FileText,
  Hammer,
  Hourglass,
  Inbox,
  Info,
  LayoutDashboard,
  ListTodo,
  MapPin,
  Megaphone,
  MessageSquareText,
  MoreHorizontal,
  PackageCheck,
  Plus,
  RefreshCw,
  Sparkles,
  Stamp,
  Thermometer,
  Truck,
  Workflow,
  Wrench,
  X,
} from 'lucide-react'
import { ExternalLinks } from '@/components/dashboard/external-links'
import { MovementTrend } from '@/components/dashboard/movement-trend'
import { CARD_HEADER } from '@/components/dashboard/card-band'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/components/auth/auth-context'
import { approvalDocNoOf, pendingFor, type ApprovalRequest } from '@/lib/approval'
import type { DashboardStats } from '@/lib/dashboard-stats'
import type { FloorTask } from '@/lib/my-tasks'
import { MANUAL_TASK_MEMO_MAX, MANUAL_TASK_TITLE_MAX, type ManualTask } from '@/lib/manual-tasks'
import { PAGE_INSET, PageHeader } from '@/components/shared/page-header'
import { cn } from '@/lib/utils'
import { shiftIsoDate } from '@/lib/date-nav'
import { confirmModal } from '@/components/shared/confirm-modal'

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토']
const num = (value: number) => value.toLocaleString('ko-KR')

const BADGE = {
  blue: 'bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-950/50 dark:text-blue-200 dark:ring-blue-500/35',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-950/50 dark:text-violet-200 dark:ring-violet-500/35',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/45 dark:text-emerald-200 dark:ring-emerald-500/35',
  orange: 'bg-orange-50 text-orange-700 ring-orange-200 dark:bg-orange-950/45 dark:text-orange-200 dark:ring-orange-500/35',
  rose: 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/50 dark:text-rose-200 dark:ring-rose-500/40',
  sky: 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-950/45 dark:text-sky-200 dark:ring-sky-500/35',
  slate: 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800/80 dark:text-slate-200 dark:ring-slate-600/50',
} as const
type BadgeTone = keyof typeof BADGE

const CARD = 'flex min-h-[220px] flex-col overflow-hidden rounded-2xl border bg-card shadow-sm transition-shadow hover:shadow-md'

const CARD_TONE = {
  sky: { chip: 'bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300', wash: 'from-sky-200/90 via-sky-100/60 dark:from-sky-500/35', icon: 'text-sky-600' },
  blue: { chip: 'bg-indigo-100 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300', wash: 'from-indigo-200/90 via-indigo-100/60 dark:from-indigo-500/35', icon: 'text-indigo-600' },
  violet: { chip: 'bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300', wash: 'from-violet-200/90 via-violet-100/60 dark:from-violet-500/35', icon: 'text-violet-600' },
  rose: { chip: 'bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300', wash: 'from-rose-200/90 via-rose-100/60 dark:from-rose-500/35', icon: 'text-rose-600' },
  orange: { chip: 'bg-orange-100 text-orange-600 dark:bg-orange-500/15 dark:text-orange-300', wash: 'from-orange-200/90 via-orange-100/60 dark:from-orange-500/35', icon: 'text-orange-600' },
  green: { chip: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300', wash: 'from-emerald-200/90 via-emerald-100/60 dark:from-emerald-500/35', icon: 'text-emerald-600' },
} as const
type CardTone = keyof typeof CARD_TONE

function CardHeader({ icon, title, count, children }: { tone?: CardTone; icon: ReactNode; title: string; count?: number; children?: ReactNode; solid?: boolean }) {
  return (
    <div className={cn('flex items-center justify-between gap-3 px-4 py-3', CARD_HEADER)}>
      <h2 className="flex items-center gap-2.5 text-[15px] font-bold text-white">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-slate-600 shadow-sm ring-1 ring-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:ring-slate-600">{icon}</span>
        {title}
        {count != null && count > 0 && (
          <span className="rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-bold tabular-nums text-white">{count}</span>
        )}
      </h2>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  )
}

function EmptyState({ tone, icon, title, hint }: { tone: CardTone; icon: ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
      <span className={cn('flex h-11 w-11 items-center justify-center rounded-full', CARD_TONE[tone].chip)}>{icon}</span>
      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

function shortDate(value: string) {
  const digits = String(value ?? '').replace(/\D/g, '')
  return digits.length >= 8 ? `${digits.slice(4, 6)}.${digits.slice(6, 8)}` : value
}

export function HomeBoard({ data, myTasks, today }: { data: DashboardStats; myTasks?: FloorTask[] | null; today: string }) {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  // 관리자는 전 층을 보고, 층이 지정된 담당자는 자기 층을 맨 앞에 강조한다.
  const homeFloor = !isAdmin && user?.floor ? user.floor : null
  const scope = isAdmin
    ? '관리자 · 전체 현황'
    : user?.role === 'editor'
      ? (homeFloor ? `${homeFloor}층 편집자 · 내 층 중심` : '편집자')
      : '조회 전용'
  const viewportRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef({ x: 0, y: 0, id: -1, active: false, moved: false })
  const wheelAt = useRef(0)
  const [page, setPage] = useState(0)
  const [dragX, setDragX] = useState(0)
  const [dragging, setDragging] = useState(false)
  const pageCount = 2

  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const blockSelect = (event: Event) => {
      const target = event.target
      if (target instanceof Element && target.closest('input, textarea, select, option')) return
      event.preventDefault()
    }
    el.addEventListener('selectstart', blockSelect)
    return () => el.removeEventListener('selectstart', blockSelect)
  }, [])

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    dragRef.current = { x: event.clientX, y: event.clientY, id: event.pointerId, active: false, moved: false }
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (drag.id !== event.pointerId) return
    const dx = event.clientX - drag.x
    const dy = event.clientY - drag.y
    if (!drag.active) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return
      if (Math.abs(dy) > Math.abs(dx)) {
        drag.id = -1
        return
      }
      drag.active = true
      drag.moved = true
      setDragging(true)
      window.getSelection()?.removeAllRanges()
      viewportRef.current?.setPointerCapture(event.pointerId)
    }
    const blocked = (page === 0 && dx > 0) || (page === pageCount - 1 && dx < 0)
    setDragX(blocked ? 0 : dx)
  }

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (drag.id !== event.pointerId) return
    const dx = event.clientX - drag.x
    if (drag.active) {
      const width = viewportRef.current?.clientWidth || 1
      const threshold = Math.min(140, width * 0.18)
      if (dx <= -threshold) setPage((current) => Math.min(pageCount - 1, current + 1))
      else if (dx >= threshold) setPage((current) => Math.max(0, current - 1))
    }
    drag.id = -1
    drag.active = false
    setDragging(false)
    setDragX(0)
    window.setTimeout(() => {
      dragRef.current.moved = false
    }, 0)
  }

  const onClickCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!dragRef.current.moved) return
    event.preventDefault()
    event.stopPropagation()
    dragRef.current.moved = false
  }

  const onWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (Math.abs(event.deltaX) < 30 || Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return
    const now = performance.now()
    if (now - wheelAt.current < 650) return
    if (event.deltaX > 0 && page < pageCount - 1) {
      wheelAt.current = now
      setPage(page + 1)
    } else if (event.deltaX < 0 && page > 0) {
      wheelAt.current = now
      setPage(page - 1)
    }
  }

  const positive = data.process.stockPositive
  const zero = data.process.stockZero
  const long = data.process.stockLong

  return (
    <div
      ref={viewportRef}
      className="absolute inset-0 select-none overflow-hidden [&_*]:select-none"
      onDragStart={(event) => event.preventDefault()}
      style={{ touchAction: 'pan-y' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onClickCapture={onClickCapture}
      onWheel={onWheel}
    >
      <div
        className="flex h-full w-full"
        style={{
          transform: `translate3d(calc(${-page * 100}% + ${dragX}px), 0, 0)`,
          transition: dragging ? 'none' : 'transform 460ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        <section className="h-full w-full shrink-0 overflow-y-auto overscroll-y-contain [scrollbar-width:none] [&::-webkit-scrollbar]:!hidden" aria-label="운영 현황">
    <div className={cn(PAGE_INSET, 'space-y-6 pb-16')}>
      <BoardHeader date={data.today.date} maxDate={today} />

      <TodayFlow data={data} scope={scope} />

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <BarcodeStatusPanel barcode={data.process.views.barcodeStatus} />
        <FloorCheckPanel data={data} />
      </section>

      <section className={cn('grid gap-5', isAdmin ? 'xl:grid-cols-[minmax(0,1.35fr)_minmax(0,0.95fr)_minmax(0,1fr)]' : 'xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]')}>
        <MovementTrend week={data.process.views.trend.week} month={data.process.views.trend.month} />

        {isAdmin && (
          <Panel icon={<AlertTriangle className="h-4 w-4" />} title="품질 불량 현황" tone="rose" href="/quality/nonconformity" linkLabel="상세보기">
            <DefectStatus customer={data.quality.customerNc} process={data.quality.processNc} open={data.quality.openNc} />
          </Panel>
        )}

        <Panel icon={<Boxes className="h-4 w-4" />} title="재고 현황" tone="orange" href="/shipment?tab=stock" linkLabel="상세보기">
          <StockDonut total={data.process.stockItems} positive={positive} zero={zero} long={long} />
          {long > 0 && (
            <div className="mt-auto pt-4">
              <div className="flex items-start gap-2.5 rounded-xl border border-blue-100 bg-blue-50/70 px-3.5 py-3 dark:border-blue-500/25 dark:bg-blue-950/40">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
                <div className="text-xs">
                  <p className="font-semibold text-slate-800 dark:text-slate-100">30일 넘게 움직임이 없는 재고가 {num(long)}종입니다.</p>
                  <p className="mt-0.5 text-muted-foreground">작업·출고 계획을 확인해 주세요.</p>
                </div>
              </div>
            </div>
          )}
        </Panel>
      </section>
    </div>
        </section>
        <section className="h-full w-full shrink-0 overflow-y-auto overscroll-y-contain [scrollbar-width:none] [&::-webkit-scrollbar]:!hidden" aria-label="추가 화면">
          <DetailBoard data={data} myTasks={myTasks} maxDate={today} />
        </section>
      </div>
      {page > 0 && (
        <button
          type="button"
          aria-label="이전 페이지"
          onClick={() => setPage((current) => Math.max(0, current - 1))}
          className="absolute left-3 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 md:flex items-center justify-center rounded-full border bg-card/95 text-slate-700 shadow-md hover:bg-card dark:text-slate-100"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      )}
      {page < pageCount - 1 && (
        <button
          type="button"
          aria-label="다음 페이지"
          onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
          className="absolute right-3 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 md:flex items-center justify-center rounded-full border bg-card/95 text-slate-700 shadow-md hover:bg-card dark:text-slate-100"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      )}
      <div className="no-print absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full border bg-card/95 px-3 py-2 shadow-sm">
        {['운영 현황', '추가 화면'].map((label, index) => (
          <button
            key={label}
            type="button"
            aria-label={label}
            aria-current={index === page ? 'page' : undefined}
            onClick={() => setPage(index)}
            className={cn('h-2 rounded-full transition-all', index === page ? 'w-6 bg-blue-600' : 'w-2 bg-slate-300 hover:bg-slate-400 dark:bg-slate-600')}
          />
        ))}
      </div>
    </div>
  )
}

function BoardHeader({ date, maxDate }: { date: string; maxDate: string }) {
  const weekday = WEEKDAY[new Date(`${date}T00:00:00`).getDay()]
  const isToday = date === maxDate
  const stop = (event: ReactPointerEvent<HTMLAnchorElement>) => event.stopPropagation()
  const navClass = 'flex h-10 w-10 items-center justify-center text-muted-foreground transition-colors hover:text-blue-600'
  return (
    <PageHeader
      tone="blue"
      icon={LayoutDashboard}
      eyebrow="HOME · 대시보드"
      title="대시보드"
      actions={
      <div className="flex items-center gap-2">
        <div className="inline-flex h-10 items-center overflow-hidden rounded-xl border bg-card shadow-sm">
          <Link href={`/?date=${shiftIsoDate(date, -1)}`} aria-label="이전 날짜" onPointerDown={stop} className={navClass}>
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <span className="inline-flex h-10 items-center gap-2 px-2 text-sm font-medium tabular-nums">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            {date.replace(/-/g, '.')} ({weekday}) 기준
          </span>
          {isToday ? (
            <span aria-hidden className="flex h-10 w-10 items-center justify-center text-muted-foreground/30">
              <ChevronRight className="h-4 w-4" />
            </span>
          ) : (
            <Link href={`/?date=${shiftIsoDate(date, 1)}`} aria-label="다음 날짜" onPointerDown={stop} className={navClass}>
              <ChevronRight className="h-4 w-4" />
            </Link>
          )}
        </div>
        {!isToday && (
          <Link
            href="/"
            onPointerDown={stop}
            className="inline-flex h-10 items-center rounded-xl border bg-card px-3 text-sm font-semibold text-blue-700 shadow-sm transition-colors hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-slate-800"
          >
            오늘
          </Link>
        )}
      </div>
      }
    />
  )
}

function DetailBoard({ data, myTasks, maxDate }: { data: DashboardStats; myTasks?: FloorTask[] | null; maxDate: string }) {
  return (
    <div className={cn(PAGE_INSET, 'flex min-h-full flex-col gap-5 pb-16')}>
      <BoardHeader date={data.today.date} maxDate={maxDate} />
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 md:grid-cols-2 md:grid-rows-2 md:gap-5">
        <BoardShell title="공지사항" tone="sky" icon={<Megaphone className="h-4 w-4" />} refreshable />
        <AbsenceBoard leaves={data.absence.leaves} today={data.today.date} />
        <ApprovalBoard />
        <TaskBoard data={data} myTasks={myTasks} readOnly={data.today.date !== maxDate} />
      </div>
      <ExternalLinks />
    </div>
  )
}

type TaskRow = { id: string; label: string; text: string; count: string; href: string; tone: BadgeTone }

function MyTaskBoard({ tasks: initial, readOnly }: { tasks: FloorTask[]; readOnly: boolean }) {
  const [tasks, setTasks] = useState(initial)
  useEffect(() => {
    setTasks(initial)
  }, [initial])
  const doneCount = tasks.filter((task) => task.done).length

  const setDone = (key: string, done: boolean) =>
    setTasks((prev) => prev.map((row) => (row.key === key ? { ...row, done } : row)))

  const toggle = async (task: FloorTask) => {
    if (readOnly) return
    const next = !task.done
    setDone(task.key, next)
    try {
      const res = await fetch('/api/my-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: task.key, done: next }),
      })
      if (!res.ok) setDone(task.key, !next)
    } catch {
      setDone(task.key, !next)
    }
  }

  return (
    <article aria-label="업무대기" className={CARD}>
      <CardHeader tone="orange" icon={<ListTodo className="h-4 w-4" />} title="업무대기">
        {readOnly ? (
          <span className="text-xs font-semibold text-muted-foreground">지난 날짜 · 읽기 전용</span>
        ) : tasks.length > 0 ? (
          <span className="flex items-center gap-2 text-xs font-semibold tabular-nums text-muted-foreground">
            <span className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
              <span
                className={cn('block h-full rounded-full transition-all duration-500', doneCount === tasks.length ? 'bg-emerald-500' : 'bg-orange-400')}
                style={{ width: `${Math.round((doneCount / tasks.length) * 100)}%` }}
              />
            </span>
            완료 {doneCount}/{tasks.length}
          </span>
        ) : null}
      </CardHeader>
      {tasks.length === 0 ? (
        <EmptyState tone="green" icon={<CircleCheck className="h-5 w-5" />} title="오늘 배정된 업무가 없습니다." />
      ) : (
        <PagedList
          items={tasks}
          getKey={(task) => task.key}
          render={(task) => (
            <div className="flex items-center gap-2.5 rounded-md border border-slate-200 bg-slate-50/80 px-3 py-2 text-[13px] dark:border-slate-700 dark:bg-slate-900/40">
              <button
                type="button"
                role="checkbox"
                aria-checked={task.done}
                aria-label={`${task.label} ${task.done ? '대기로 되돌리기' : '완료 처리'}`}
                disabled={readOnly}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => toggle(task)}
                className={cn(
                  'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
                  readOnly && 'cursor-default',
                  task.done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 bg-white hover:border-blue-400 dark:border-slate-500 dark:bg-slate-800',
                )}
              >
                {task.done && <Check className="h-3 w-3" strokeWidth={3} />}
              </button>
              <Link
                href={task.href}
                onPointerDown={(event) => event.stopPropagation()}
                className={cn(
                  'min-w-0 flex-1 truncate font-medium',
                  task.done ? 'text-slate-400 line-through dark:text-slate-500' : 'text-slate-800 dark:text-slate-100',
                )}
              >
                {task.label}
              </Link>
              <span className="shrink-0 tabular-nums text-slate-500 dark:text-slate-400">{task.detail}</span>
              <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold ring-1', task.done ? BADGE.green : BADGE.orange)}>
                {task.done ? '완료' : '대기'}
              </span>
            </div>
          )}
        />
      )}
    </article>
  )
}

type TaskItem = { kind: 'manual'; task: ManualTask } | { kind: 'auto'; row: TaskRow }

function TaskBoard({ data, myTasks, readOnly }: { data: DashboardStats; myTasks?: FloorTask[] | null; readOnly: boolean }) {
  const { user } = useAuth()
  const [manual, setManual] = useState<ManualTask[]>([])
  const [registering, setRegistering] = useState(false)
  const [manualError, setManualError] = useState('')
  const isFloorView = Boolean(myTasks)
  const canRegister = Boolean(user) && user?.role !== 'viewer'

  const loadManual = useCallback(async () => {
    try {
      const response = await fetch('/api/manual-tasks', { cache: 'no-store' })
      if (!response.ok) return
      const body = await response.json()
      setManual(Array.isArray(body?.data) ? body.data : [])
    } catch {
      // 네트워크 오류면 기존 목록을 그대로 둔다.
    }
  }, [])

  useEffect(() => {
    if (!isFloorView) loadManual()
  }, [isFloorView, loadManual])

  async function completeManual(task: ManualTask) {
    setManual((prev) => prev.filter((item) => item.id !== task.id))
    setManualError('')
    try {
      const response = await fetch(`/api/manual-tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ done: true }),
      })
      if (!response.ok) {
        setManualError('업무를 완료 처리하지 못했습니다.')
        loadManual()
      }
    } catch {
      setManualError('업무를 완료 처리하지 못했습니다.')
      loadManual()
    }
  }

  async function removeManual(task: ManualTask) {
    if (!(await confirmModal({ title: '업무를 삭제할까요?', description: `"${task.title}"`, confirmLabel: '삭제', destructive: true }))) return
    setManualError('')
    try {
      const response = await fetch(`/api/manual-tasks/${task.id}`, { method: 'DELETE' })
      if (!response.ok) {
        const body = await response.json().catch(() => null)
        setManualError(body?.error ?? '업무를 삭제하지 못했습니다.')
        return
      }
      setManual((prev) => prev.filter((item) => item.id !== task.id))
    } catch {
      setManualError('업무를 삭제하지 못했습니다.')
    }
  }

  if (myTasks) return <MyTaskBoard tasks={myTasks} readOnly={readOnly} />
  const showQuality = user?.role === 'admin'
  const missing = data.today.missing
  const missingBy = (kind: string) => missing.filter((item) => item.kind === kind).length
  const customerOpen = data.quality.customerNc.not_started + data.quality.customerNc.in_progress
  const processOpen = data.quality.processNc.not_started + data.quality.processNc.in_progress
  const flowOpen = data.process.views.flow.open
  const longStock = data.process.stockLong

  const candidates: (TaskRow & { n: number })[] = [
    { id: 'miss-daily', label: '점검', text: '설비 일상점검 미점검', n: missingBy('설비'), count: '', href: '/checksheets/daily', tone: 'orange' },
    { id: 'miss-5s', label: '점검', text: '3정 5S 미점검', n: missingBy('5S'), count: '', href: '/checksheets/5s', tone: 'orange' },
    { id: 'miss-temp', label: '점검', text: '온·습도 미점검', n: missingBy('온습도'), count: '', href: '/checksheets/temp-humidity', tone: 'orange' },
    { id: 'miss-process', label: '점검', text: '공정 점검 미점검', n: missingBy('공정'), count: '', href: '/process-check', tone: 'orange' },
    { id: 'nc-customer', label: '부적합', text: '고객 부적합 미결', n: customerOpen, count: '', href: '/quality/nonconformity', tone: 'rose' },
    { id: 'nc-process', label: '부적합', text: '공정 부적합 미결', n: processOpen, count: '', href: '/quality/nonconformity', tone: 'rose' },
    { id: 'flow', label: '입출고', text: '진행 중인 입고·이력·출하', n: flowOpen, count: '', href: '/shipment/doc-flow', tone: 'blue' },
    { id: 'stock', label: '재고', text: '장기 재고 품목 (30일+)', n: longStock, count: '', href: '/shipment?tab=stock', tone: 'violet' },
  ]
  const rows = candidates
    .filter((row) => row.n > 0 && (showQuality || !row.id.startsWith('nc-')))
    .map((row) => ({ ...row, count: `${num(row.n)}${row.id === 'stock' ? '종' : '건'}` }))

  const items: TaskItem[] = [
    ...manual.map((task): TaskItem => ({ kind: 'manual', task })),
    ...rows.map((row): TaskItem => ({ kind: 'auto', row })),
  ]

  return (
    <>
      <article aria-label="업무대기" className={CARD}>
        <CardHeader tone="orange" icon={<ListTodo className="h-4 w-4" />} title="업무대기" count={items.length}>
          {canRegister && (
            <button
              type="button"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => setRegistering(true)}
              className="inline-flex items-center gap-1 rounded-lg border bg-card px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <Plus className="h-3.5 w-3.5" />
              등록
            </button>
          )}
        </CardHeader>
        {items.length === 0 ? (
          <EmptyState tone="green" icon={<CircleCheck className="h-5 w-5" />} title="처리 대기 중인 업무가 없습니다." hint="오늘 할 일을 모두 마쳤어요." />
        ) : (
          <PagedList
            items={items}
            getKey={(item) => (item.kind === 'manual' ? `manual-${item.task.id}` : `auto-${item.row.id}`)}
            render={(item) => {
              if (item.kind === 'manual') {
                const task = item.task
                const canDelete = user?.role === 'admin' || task.createdById === user?.id
                return (
                  <div className="flex items-center gap-2.5 rounded-md border border-slate-200 bg-white px-3 py-2 text-[13px] dark:border-slate-700 dark:bg-slate-900/40">
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={false}
                      aria-label={`${task.title} 완료 처리`}
                      disabled={!canRegister}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={() => completeManual(task)}
                      className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-slate-300 bg-white transition-colors hover:border-blue-400 disabled:cursor-default dark:border-slate-500 dark:bg-slate-800"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-slate-800 dark:text-slate-100">{task.title}</p>
                      {task.memo && <p className="truncate text-[11px] text-muted-foreground">{task.memo}</p>}
                    </div>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{task.createdBy}</span>
                    <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold ring-1', BADGE.blue)}>직접</span>
                    {canDelete && (
                      <button
                        type="button"
                        aria-label={`${task.title} 삭제`}
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={() => removeManual(task)}
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-rose-600 dark:hover:bg-slate-800"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                )
              }
              const row = item.row
              return (
                <Link
                  href={row.href}
                  onPointerDown={(event) => event.stopPropagation()}
                  className="group flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50/80 px-3 py-2 text-[13px] transition-colors hover:border-blue-300 hover:bg-blue-50/60 dark:border-slate-700 dark:bg-slate-900/40 dark:hover:border-blue-500/40 dark:hover:bg-blue-950/30"
                >
                  <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold ring-1', BADGE[row.tone])}>{row.label}</span>
                  <span className="min-w-0 flex-1 truncate text-slate-800 dark:text-slate-100">{row.text}</span>
                  <span className="shrink-0 font-bold tabular-nums text-slate-900 dark:text-white">{row.count}</span>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-blue-500 dark:text-slate-600" />
                </Link>
              )
            }}
          />
        )}
        {manualError && <p className="px-3 pb-3 text-xs font-medium text-rose-600 dark:text-rose-300">{manualError}</p>}
      </article>
      <ManualTaskForm
        open={registering}
        onOpenChange={setRegistering}
        onSaved={() => {
          setRegistering(false)
          loadManual()
        }}
      />
    </>
  )
}

function ManualTaskForm({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (open: boolean) => void; onSaved: () => void }) {
  const [title, setTitle] = useState('')
  const [memo, setMemo] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // 열 때마다 입력값을 비운다.
  useEffect(() => {
    if (!open) return
    setTitle('')
    setMemo('')
    setError('')
  }, [open])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    setError('')
    try {
      const response = await fetch('/api/manual-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, memo }),
      })
      const body = await response.json().catch(() => null)
      if (!response.ok) {
        setError(body?.error ?? '업무를 등록하지 못했습니다.')
        return
      }
      onSaved()
    } catch {
      setError('업무를 등록하지 못했습니다.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent overlayClassName="!z-[70]" className="!z-[80] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">업무 등록</DialogTitle>
          <DialogDescription>완료 체크 전까지 업무대기에 남아 있습니다.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-muted-foreground">업무 내용</span>
            <Input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={MANUAL_TASK_TITLE_MAX} placeholder="예) 고객사 샘플 발송 확인" autoFocus />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-muted-foreground">메모 (선택)</span>
            <Input value={memo} onChange={(event) => setMemo(event.target.value)} maxLength={MANUAL_TASK_MEMO_MAX} placeholder="예) 오후 3시까지" />
          </label>
          {error && <p className="text-sm font-medium text-rose-600 dark:text-rose-300">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
            <Button type="submit" disabled={saving || !title.trim()}>{saving ? '등록 중…' : '등록'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

const TASK_PAGE_SIZE = 5

// 업무대기 목록을 5개씩 나눠 보여주고 이전/다음 페이지로 넘긴다.
function PagedList<T>({ items, getKey, render }: { items: T[]; getKey: (item: T) => string; render: (item: T) => ReactNode }) {
  const [page, setPage] = useState(0)
  const pageCount = Math.max(1, Math.ceil(items.length / TASK_PAGE_SIZE))
  const current = Math.min(page, pageCount - 1)
  const visible = items.slice(current * TASK_PAGE_SIZE, (current + 1) * TASK_PAGE_SIZE)
  const stop = (event: ReactPointerEvent<HTMLButtonElement>) => event.stopPropagation()
  const navClass = 'flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:opacity-30 disabled:hover:bg-transparent dark:hover:bg-slate-800 dark:hover:text-white'
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ul className="flex-1 space-y-1.5 p-3">
        {visible.map((item) => (
          <li key={getKey(item)}>{render(item)}</li>
        ))}
      </ul>
      {pageCount > 1 && (
        <div className="flex items-center justify-center gap-2 border-t px-3 py-2">
          <button type="button" aria-label="이전 페이지" disabled={current === 0} onPointerDown={stop} onClick={() => setPage(current - 1)} className={navClass}>
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <span className="text-xs font-semibold tabular-nums text-muted-foreground">{current + 1} / {pageCount}</span>
          <button type="button" aria-label="다음 페이지" disabled={current >= pageCount - 1} onPointerDown={stop} onClick={() => setPage(current + 1)} className={navClass}>
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}

type AbsenceKind = '연차' | '반차' | '출장'

type AbsenceRow = {
  id: string
  name: string
  start: string
  end: string
  kind: AbsenceKind
  place?: string
  reason?: string
  manual?: boolean
}

function temporaryAbsences(): AbsenceRow[] {
  const day = (offset: number) => {
    const date = new Date()
    date.setDate(date.getDate() + offset)
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const dateOfMonth = String(date.getDate()).padStart(2, '0')
    return `${date.getFullYear()}-${month}-${dateOfMonth}`
  }
  return [
    { id: 'temp-leave-1', name: '홍길동', start: day(0), end: day(2), kind: '연차' },
    { id: 'temp-trip-1', name: '김민준', start: day(1), end: day(3), kind: '출장', place: '부산', reason: '고객사 품질 회의' },
    { id: 'temp-leave-2', name: '이서연', start: day(4), end: day(4), kind: '반차' },
    { id: 'temp-trip-2', name: '박서준', start: day(6), end: day(8), kind: '출장', place: '창원', reason: '설비 점검 지원' },
  ]
}

/** 목록용 짧은 기간. 2026-11-24 ~ 2026-11-27 → 11.24~11.27 */
function shortPeriod(start: string, end: string) {
  const label = (value: string) => {
    const digits = String(value ?? '').replace(/\D/g, '')
    if (digits.length < 8) return value
    return `${digits.slice(4, 6)}.${digits.slice(6, 8)}`
  }
  return start === end ? label(start) : `${label(start)}~${label(end)}`
}

function daysInclusive(start: string, end: string) {
  const toDate = (value: string) => {
    const digits = String(value ?? '').replace(/\D/g, '')
    return new Date(Number(digits.slice(0, 4)), Number(digits.slice(4, 6)) - 1, Number(digits.slice(6, 8)))
  }
  const diff = Math.round((toDate(end).getTime() - toDate(start).getTime()) / 86_400_000)
  return Math.max(1, diff + 1)
}

function leavePeriod(start: string, end: string) {
  const label = (value: string) => {
    const digits = String(value ?? '').replace(/\D/g, '')
    if (digits.length < 8) return value
    return `${Number(digits.slice(4, 6))}월 ${Number(digits.slice(6, 8))}일`
  }
  return start === end ? label(start) : `${label(start)} – ${label(end)}`
}

function ApprovalBoard() {
  const { user } = useAuth()
  const [items, setItems] = useState<ApprovalRequest[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/approvals', { cache: 'no-store' })
      if (!response.ok) throw new Error('approvals')
      const body = await response.json()
      setItems(Array.isArray(body?.data) ? body.data : [])
      setFailed(false)
    } catch {
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const userId = user?.id ?? ''
  const waiting = (items ?? [])
    .filter((item) => pendingFor(item, userId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const stop = (event: ReactPointerEvent) => event.stopPropagation()

  return (
    <article aria-label="결재대기" className={CARD}>
      <CardHeader tone="rose" icon={<Stamp className="h-4 w-4" />} title="결재대기" count={waiting.length}>
        <Link
          href="/approvals"
          aria-label="결재 전체보기"
          onPointerDown={stop}
          className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-blue-600 shadow-sm hover:bg-blue-50"
        >
          <MoreHorizontal className="h-4 w-4" />
        </Link>
        <button
          type="button"
          aria-label="새로고침"
          onPointerDown={stop}
          onClick={() => void load()}
          disabled={loading}
          className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-blue-600 shadow-sm hover:bg-blue-50 disabled:opacity-60"
        >
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
        </button>
      </CardHeader>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3 [scrollbar-width:none] [&::-webkit-scrollbar]:!hidden">
        {failed ? (
          <p className="py-6 text-center text-sm text-muted-foreground">결재 정보를 불러오지 못했습니다.</p>
        ) : items === null ? (
          <p className="py-6 text-center text-sm text-muted-foreground">불러오는 중…</p>
        ) : waiting.length === 0 ? (
          <EmptyState tone="green" icon={<CircleCheck className="h-5 w-5" />} title="결재 대기 중인 문서가 없습니다." hint="새 결재가 도착하면 이곳에 표시됩니다." />
        ) : (
          <ul className="space-y-2">
            {waiting.map((item) => (
              <li key={item.id}>
                <Link
                  href="/approvals"
                  onPointerDown={stop}
                  className="flex items-center gap-3 rounded-xl border bg-slate-50/70 px-3 py-2.5 hover:border-blue-300 hover:bg-blue-50/60 dark:bg-slate-900/40 dark:hover:border-blue-500/40 dark:hover:bg-blue-950/30"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-800 dark:text-slate-100">{item.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {approvalDocNoOf(item) || '번호 없음'} · {item.requesterName} · {shortDate(item.createdAt)}
                    </span>
                  </span>
                  <span className={cn('shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold ring-1', BADGE.rose)}>내 차례</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  )
}

function BoardShell({ title, tone, icon, refreshable = false }: { title: string; tone: CardTone; icon: ReactNode; refreshable?: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return (
    <section aria-label={title} className={CARD}>
      <CardHeader tone={tone} icon={icon} title={title}>
        {refreshable && (
          <button
            type="button"
            aria-label="새로고침"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => startTransition(() => router.refresh())}
            disabled={pending}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-blue-600 shadow-sm hover:bg-blue-50 disabled:opacity-60"
          >
            <RefreshCw className={cn('h-4 w-4', pending && 'animate-spin')} />
          </button>
        )}
      </CardHeader>
      <EmptyState tone={tone} icon={icon} title={`${title} 준비 중`} hint="곧 이곳에서 확인할 수 있습니다." />
    </section>
  )
}

function AbsenceBoard({ leaves, today }: { leaves: DashboardStats['absence']['leaves']; today: string }) {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [detail, setDetail] = useState<AbsenceRow | null>(null)
  const [registering, setRegistering] = useState(false)
  const [removeError, setRemoveError] = useState('')
  const [removing, setRemoving] = useState(false)
  const rows: AbsenceRow[] = [
    ...temporaryAbsences(),
    ...leaves.map((row) => ({ ...row, kind: row.leaveType })),
  ]
  const todayKey = today.replace(/\D/g, '')
  const dayKey = (value: string) => String(value ?? '').replace(/\D/g, '').slice(0, 8)
  const ongoing = (row: AbsenceRow) => dayKey(row.start) <= todayKey && todayKey <= dayKey(row.end)
  const refresh = () => startTransition(() => router.refresh())

  async function removeManual(row: AbsenceRow) {
    if (!(await confirmModal({ title: '기록을 삭제할까요?', description: `${row.name} ${row.kind}`, confirmLabel: '삭제', destructive: true }))) return
    setRemoving(true)
    setRemoveError('')
    try {
      const response = await fetch(`/api/absences/${row.id}`, { method: 'DELETE' })
      if (!response.ok) {
        const body = await response.json().catch(() => null)
        setRemoveError(body?.error ?? '기록을 삭제하지 못했습니다.')
        return
      }
      setDetail(null)
      refresh()
    } finally {
      setRemoving(false)
    }
  }

  return (
    <article aria-label="출장/휴가" className={CARD}>
      <CardHeader tone="blue" icon={<CalendarDays className="h-4 w-4" />} title="출장/휴가" count={rows.length}>
        {isAdmin && (
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => setRegistering(true)}
            className="inline-flex items-center gap-1 rounded-lg border bg-card px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <Plus className="h-3.5 w-3.5" />
            등록
          </button>
        )}
        <Link href="/approvals" className="flex items-center gap-0.5 text-xs font-semibold text-white/90 hover:text-white hover:underline">
          결재<ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </CardHeader>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3 [scrollbar-width:none] [&::-webkit-scrollbar]:!hidden">
        {rows.length === 0 ? (
          <EmptyState tone="blue" icon={<CalendarDays className="h-5 w-5" />} title="등록된 출장·휴가가 없습니다." />
        ) : (
          <ul className="space-y-1.5">
            {rows.map((row) => {
              const isTrip = row.kind === '출장'
              const clickable = isTrip || row.manual === true
              return (
                <li key={row.id}>
                  <button
                    type="button"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={() => clickable && setDetail(row)}
                    className={cn(
                      'flex w-full min-w-0 items-center gap-2 rounded-md border border-sky-200 bg-sky-50/80 px-3 py-2 text-left text-[13px] text-slate-800 dark:border-sky-500/25 dark:bg-sky-950/30 dark:text-slate-100',
                      clickable ? 'cursor-pointer hover:bg-sky-100/80 dark:hover:bg-sky-900/40' : 'cursor-default',
                    )}
                  >
                    <span className={cn('shrink-0 font-semibold', isTrip ? 'text-orange-700 dark:text-orange-300' : 'text-emerald-700 dark:text-emerald-300')}>
                      {isTrip ? '[출장]' : '[휴가]'}
                    </span>
                    <span className="shrink-0 font-medium">{row.name}</span>
                    <span className="shrink-0 tabular-nums text-slate-500 dark:text-slate-400">{shortPeriod(row.start, row.end)}</span>
                    <span className="min-w-0 flex-1 truncate text-slate-600 dark:text-slate-300">{isTrip ? row.place : row.kind}</span>
                    {ongoing(row) && (
                      <span className="flex shrink-0 items-center gap-1 text-[11px] font-semibold text-blue-600 dark:text-blue-300">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" />
                        진행 중
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <Dialog open={detail != null} onOpenChange={(open) => { if (!open) { setDetail(null); setRemoveError('') } }}>
        <DialogContent overlayClassName="!z-[70]" className="!z-[80] sm:max-w-md">
          {detail && (() => {
            const isTripDetail = detail.kind === '출장'
            const days = daysInclusive(detail.start, detail.end)
            const live = ongoing(detail)
            const accent = isTripDetail
              ? { band: 'from-orange-50 via-white to-white dark:from-orange-500/15 dark:via-slate-900 dark:to-slate-900', chip: 'bg-orange-100 text-orange-700 ring-orange-200 dark:bg-orange-500/20 dark:text-orange-200 dark:ring-orange-500/40', icon: 'bg-orange-100 text-orange-600 dark:bg-orange-500/20 dark:text-orange-300' }
              : { band: 'from-emerald-50 via-white to-white dark:from-emerald-500/15 dark:via-slate-900 dark:to-slate-900', chip: 'bg-emerald-100 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-200 dark:ring-emerald-500/40', icon: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-300' }
            return (
              <>
                <DialogHeader className="sr-only">
                  <DialogTitle>{detail.name} {detail.kind}</DialogTitle>
                  <DialogDescription>{detail.manual ? '관리자가 직접 등록한 기록입니다.' : '출장 상세 내용입니다.'}</DialogDescription>
                </DialogHeader>
                <div className={cn('mt-6 rounded-2xl bg-gradient-to-b p-4 ring-1 ring-slate-200/70 dark:ring-slate-700', accent.band)}>
                  <div className="flex items-center gap-2">
                    <span className={cn('rounded-md px-2 py-0.5 text-[11px] font-bold ring-1', accent.chip)}>{detail.kind}</span>
                    {detail.manual && <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-600">직접 등록</span>}
                    {live && (
                      <span className="ml-auto flex items-center gap-1 text-[11px] font-semibold text-blue-600 dark:text-blue-300">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" />
                        진행 중
                      </span>
                    )}
                  </div>
                  <p className="mt-3 text-xl font-bold tracking-tight text-slate-900 dark:text-white">{detail.name}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {isTripDetail ? '출장' : '휴가'} · 총 <span className="font-semibold text-slate-700 dark:text-slate-200">{days}일</span>
                  </p>
                </div>
                <dl className="mt-4 space-y-2.5">
                  <div className="flex items-start gap-3 rounded-xl border px-3.5 py-3">
                    <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', accent.icon)}><CalendarRange className="h-4 w-4" /></span>
                    <div className="min-w-0">
                      <dt className="text-xs font-semibold text-muted-foreground">기간</dt>
                      <dd className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900 dark:text-white">{leavePeriod(detail.start, detail.end)}</dd>
                    </div>
                  </div>
                  {isTripDetail && (
                    <div className="flex items-start gap-3 rounded-xl border px-3.5 py-3">
                      <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', accent.icon)}><MapPin className="h-4 w-4" /></span>
                      <div className="min-w-0">
                        <dt className="text-xs font-semibold text-muted-foreground">출장지</dt>
                        <dd className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-white">{detail.place || '미정'}</dd>
                      </div>
                    </div>
                  )}
                  <div className="flex items-start gap-3 rounded-xl border px-3.5 py-3">
                    <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', accent.icon)}><MessageSquareText className="h-4 w-4" /></span>
                    <div className="min-w-0">
                      <dt className="text-xs font-semibold text-muted-foreground">사유</dt>
                      <dd className={cn('mt-0.5 text-sm font-medium', detail.reason ? 'text-slate-900 dark:text-white' : 'text-muted-foreground')}>{detail.reason || '등록된 사유가 없습니다.'}</dd>
                    </div>
                  </div>
                </dl>
              {removeError && <p className="mt-3 text-sm font-medium text-rose-600 dark:text-rose-300">{removeError}</p>}
              {isAdmin && detail.manual && (
                <div className="mt-4 flex justify-end border-t pt-4">
                  <Button type="button" variant="destructive" disabled={removing} onClick={() => removeManual(detail)}>
                    {removing ? '삭제 중…' : '기록 삭제'}
                  </Button>
                </div>
              )}
              </>
            )
          })()}
        </DialogContent>
      </Dialog>

      <AbsenceForm
        open={registering}
        today={today}
        onOpenChange={setRegistering}
        onSaved={() => { setRegistering(false); refresh() }}
      />
    </article>
  )
}

const ABSENCE_KINDS = ['출장', '연차', '반차'] as const

function AbsenceForm({ open, today, onOpenChange, onSaved }: { open: boolean; today: string; onOpenChange: (open: boolean) => void; onSaved: () => void }) {
  const [kind, setKind] = useState<(typeof ABSENCE_KINDS)[number]>('출장')
  const [name, setName] = useState('')
  const [start, setStart] = useState(today)
  const [end, setEnd] = useState(today)
  const [place, setPlace] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // 열 때마다 입력값을 초기화하고 기준 날짜를 오늘로 맞춘다.
  useEffect(() => {
    if (!open) return
    setKind('출장')
    setName('')
    setStart(today)
    setEnd(today)
    setPlace('')
    setReason('')
    setError('')
  }, [open, today])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    setError('')
    try {
      const response = await fetch('/api/absences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, name, start, end, place, reason }),
      })
      const body = await response.json().catch(() => null)
      if (!response.ok) {
        setError(body?.error ?? '기록을 등록하지 못했습니다.')
        return
      }
      onSaved()
    } catch {
      setError('기록을 등록하지 못했습니다.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent overlayClassName="!z-[70]" className="!z-[80] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">출장/휴가 등록</DialogTitle>
          <DialogDescription>결재 없이 바로 등록됩니다.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <span className="text-xs font-semibold text-muted-foreground">구분</span>
            <div className="grid grid-cols-3 gap-2">
              {ABSENCE_KINDS.map((item) => (
                <button
                  key={item}
                  type="button"
                  aria-pressed={kind === item}
                  onClick={() => setKind(item)}
                  className={cn(
                    'rounded-lg border px-3 py-2 text-sm font-semibold transition-colors',
                    kind === item ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-200' : 'text-muted-foreground hover:bg-slate-50 dark:hover:bg-slate-800',
                  )}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-muted-foreground">이름</span>
            <Input value={name} onChange={(event) => setName(event.target.value)} maxLength={20} placeholder="예) 홍길동" autoFocus />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-muted-foreground">시작일</span>
              <Input type="date" value={start} onChange={(event) => { setStart(event.target.value); if (event.target.value > end) setEnd(event.target.value) }} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-muted-foreground">종료일</span>
              <Input type="date" value={end} min={start} onChange={(event) => setEnd(event.target.value)} />
            </label>
          </div>
          {kind === '출장' && (
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-muted-foreground">출장지</span>
              <Input value={place} onChange={(event) => setPlace(event.target.value)} maxLength={40} placeholder="예) 부산" />
            </label>
          )}
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-muted-foreground">사유 (선택)</span>
            <Input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={200} placeholder="예) 고객사 방문" />
          </label>
          {error && <p className="text-sm font-medium text-rose-600 dark:text-rose-300">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
            <Button type="submit" disabled={saving || !name.trim()}>{saving ? '등록 중…' : '등록'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function TodayFlow({ data, scope }: { data: DashboardStats; scope: string }) {
  const thisMonth = (rows: { count: number }[]) => rows.at(-1)?.count ?? 0
  const steps = [
    { label: '입고', value: data.process.todayIn, hint: `이번 달 ${num(thisMonth(data.process.views.inbound.monthly))}건`, href: '/shipment?tab=in', icon: Inbox, tone: 'bg-sky-100 text-sky-600 dark:bg-sky-500/20 dark:text-sky-300' },
    { label: '작업', value: data.process.todayWork, hint: `이번 달 작업일보 ${num(thisMonth(data.process.views.work.monthly))}건`, href: '/shipment?tab=work', icon: Hammer, tone: 'bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-300' },
    { label: '성적서 발행', value: data.quality.todayCertificates, hint: `이번 달 ${num(data.quality.monthCertificates)}건`, href: '/explorer', icon: FileText, tone: 'bg-violet-100 text-violet-600 dark:bg-violet-500/20 dark:text-violet-300' },
    { label: '출고', value: data.process.todayOut, hint: `이번 달 ${num(thisMonth(data.process.views.outbound.monthly))}건`, href: '/shipment?tab=out', icon: Truck, tone: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-300' },
  ]
  return (
    <section aria-label="오늘의 업무 흐름" className={cn(CARD, 'min-h-0')}>
      <CardHeader tone="blue" icon={<Workflow className="h-4 w-4" />} title="오늘의 업무 흐름" solid>
        <span className={cn('rounded-full px-2.5 py-1 text-xs font-semibold ring-1', BADGE.slate)}>{scope}</span>
      </CardHeader>
      <div className="flex flex-1 flex-col p-4 sm:p-5">
      <ol className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
        {steps.map(({ label, value, hint, href, icon: Icon, tone }, index) => (
          <li key={label} className="relative">
            <Link
              href={href}
              className="flex items-center gap-3 rounded-xl border bg-slate-50/60 px-3 py-3 transition sm:gap-4 sm:px-4 sm:py-4 hover:border-blue-300 hover:bg-blue-50/50 dark:bg-slate-900/40 dark:hover:border-blue-500/40 dark:hover:bg-blue-950/30"
            >
              <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full sm:h-12 sm:w-12', tone)}>
                <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-semibold text-muted-foreground">
                  <span className="tabular-nums">{index + 1}</span>. {label}
                </span>
                <span className="mt-1 block text-[22px] font-bold leading-none tabular-nums text-slate-900 dark:text-white sm:text-[26px]">
                  {num(value)}<span className="ml-1 text-sm font-semibold">건</span>
                </span>
                <span className="mt-1.5 block truncate text-xs text-muted-foreground">{hint}</span>
              </span>
            </Link>
            {index < steps.length - 1 && (
              <span className="pointer-events-none absolute -right-[18px] top-1/2 z-10 hidden h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border bg-card text-slate-400 shadow-sm xl:flex">
                <ChevronRight className="h-4 w-4" />
              </span>
            )}
          </li>
        ))}
      </ol>
      </div>
    </section>
  )
}

type BarcodeStage = DashboardStats['process']['views']['barcodeStatus']['stages'][number]['key']

const BARCODE_STAGE_STYLE: Record<BarcodeStage, { icon: typeof Inbox; bar: string; chip: string; text: string; hint: string }> = {
  received: { icon: Inbox, bar: 'bg-sky-500', chip: 'bg-sky-100 text-sky-600 dark:bg-sky-500/20 dark:text-sky-300', text: 'text-sky-700 dark:text-sky-300', hint: '입고등록' },
  working: { icon: Hammer, bar: 'bg-amber-500', chip: 'bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-300', text: 'text-amber-700 dark:text-amber-300', hint: '공정 진행' },
  paused: { icon: Hourglass, bar: 'bg-orange-400', chip: 'bg-orange-100 text-orange-600 dark:bg-orange-500/20 dark:text-orange-300', text: 'text-orange-700 dark:text-orange-300', hint: '다음 롤 대기' },
  done: { icon: CircleCheck, bar: 'bg-blue-500', chip: 'bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-300', text: 'text-blue-700 dark:text-blue-300', hint: '공정 종료' },
  shipReady: { icon: PackageCheck, bar: 'bg-violet-500', chip: 'bg-violet-100 text-violet-600 dark:bg-violet-500/20 dark:text-violet-300', text: 'text-violet-700 dark:text-violet-300', hint: '출하성적서 발행' },
  shipped: { icon: Truck, bar: 'bg-emerald-500', chip: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-300', text: 'text-emerald-700 dark:text-emerald-300', hint: '출하 완료' },
}

function BarcodeStatusPanel({ barcode }: { barcode: DashboardStats['process']['views']['barcodeStatus'] }) {
  const total = barcode.total
  const shipped = barcode.stages.find((stage) => stage.key === 'shipped')?.count ?? 0

  return (
    <article className={cn(CARD, 'h-full min-h-0')}>
      <CardHeader tone="violet" icon={<Workflow className="h-4 w-4" />} title="바코드 진행 현황" solid>
        <p className="text-xs text-white/75">
          발급 <span className="font-semibold tabular-nums text-white">{num(total)}</span>건 · 출하 완료 <span className="font-semibold tabular-nums text-white">{num(shipped)}</span>건
        </p>
      </CardHeader>
      <div className="flex flex-1 flex-col p-4">

      {total === 0 ? (
        <p className="flex flex-1 items-center justify-center rounded-xl border border-dashed py-10 text-sm text-muted-foreground">발급된 바코드가 아직 없습니다.</p>
      ) : (
        <>
          <div className="mb-4 flex h-2.5 shrink-0 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" aria-hidden>
            {barcode.stages.map((stage) => (
              <div
                key={stage.key}
                title={`${stage.label} ${stage.count}건`}
                className={cn('h-full transition-[width] duration-500', BARCODE_STAGE_STYLE[stage.key].bar)}
                style={{ width: `${(stage.count / total) * 100}%` }}
              />
            ))}
          </div>

          <div className="grid flex-1 auto-rows-fr grid-cols-2 gap-3 lg:grid-cols-6">
            {barcode.stages.map((stage, index) => {
              const style = BARCODE_STAGE_STYLE[stage.key]
              const Icon = style.icon
              const pct = Math.round((stage.count / total) * 100)
              const isLast = index === barcode.stages.length - 1
              return (
                <div key={stage.key} className="relative flex min-w-0 flex-col justify-between rounded-xl border bg-slate-50/60 p-3 dark:bg-slate-900/40">
                  <span className={cn('absolute inset-x-0 top-0 h-1 rounded-t-[11px]', style.bar)} />
                  {!isLast && (
                    <span className="absolute -right-[14px] top-1/2 z-10 hidden h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border bg-card text-slate-400 shadow-sm lg:flex">
                      <ChevronRight className="h-3.5 w-3.5" />
                    </span>
                  )}
                  <div className="flex items-center gap-2 pt-1.5">
                    <span className={cn('hidden h-8 w-8 shrink-0 items-center justify-center rounded-full sm:flex', style.chip)}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold text-slate-700 dark:text-slate-200">{stage.label}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">{style.hint}</span>
                    </span>
                  </div>
                  <div className="mt-3 flex items-baseline justify-between">
                    <span className={cn('text-3xl font-bold tabular-nums', style.text)}>{num(stage.count)}</span>
                    <span className="text-xs font-semibold tabular-nums text-muted-foreground">{pct}%</span>
                  </div>
                  <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-200/70 dark:bg-slate-700/60" aria-hidden>
                    <div className={cn('h-full rounded-full transition-[width] duration-500', style.bar)} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
      </div>
    </article>
  )
}

const CHECK_KINDS: Record<string, { label: string; icon: typeof Wrench }> = {
  '설비 일상점검': { label: '설비', icon: Wrench },
  '3정 5S': { label: '5S', icon: Sparkles },
  '온 · 습도': { label: '온습도', icon: Thermometer },
  '공정 점검': { label: '공정', icon: Factory },
}

const rateOf = (done: number, due: number) => (due > 0 ? Math.round((done / due) * 100) : null)

function rateTone(rate: number | null) {
  if (rate == null) return { stroke: 'stroke-slate-300 dark:stroke-slate-600', bar: 'bg-slate-300 dark:bg-slate-600', text: 'text-slate-400' }
  if (rate === 100) return { stroke: 'stroke-emerald-500', bar: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400' }
  if (rate >= 50) return { stroke: 'stroke-amber-500', bar: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400' }
  return { stroke: 'stroke-rose-500', bar: 'bg-rose-500', text: 'text-rose-600 dark:text-rose-400' }
}

function ProgressRing({ rate, size, stroke, children }: { rate: number | null; size: number; stroke: number; children: ReactNode }) {
  const radius = (size - stroke) / 2
  const length = 2 * Math.PI * radius
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} className="stroke-slate-200 dark:stroke-slate-700" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={length}
          strokeDashoffset={length * (1 - (rate ?? 0) / 100)}
          className={cn('transition-[stroke-dashoffset] duration-700', rateTone(rate).stroke)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  )
}

function KindBar({ kind, done, due, compact }: { kind: string; done: number; due: number; compact?: boolean }) {
  const meta = CHECK_KINDS[kind] ?? { label: kind, icon: ClipboardList }
  const Icon = meta.icon
  const rate = rateOf(done, due)
  return (
    <div className={cn(compact && 'rounded-lg bg-white/90 px-2 py-1.5 ring-1 ring-slate-200/80 dark:bg-slate-950/50 dark:ring-slate-700/60')}>
      <div className="flex items-center justify-between gap-1 text-[11px]">
        <span className="flex min-w-0 items-center gap-1 font-semibold text-slate-600 dark:text-slate-300">
          <Icon className="h-3 w-3 shrink-0" />
          <span className="truncate">{meta.label}</span>
        </span>
        <span className={cn('shrink-0 font-bold tabular-nums', rateTone(rate).text)}>{due === 0 ? '-' : `${done}/${due}`}</span>
      </div>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
        <div className={cn('h-full rounded-full transition-[width] duration-700', rateTone(rate).bar)} style={{ width: `${rate ?? 0}%` }} />
      </div>
    </div>
  )
}

function FloorCheckPanel({ data }: { data: DashboardStats }) {
  const done = data.today.progress.reduce((sum, item) => sum + item.done, 0)
  const due = data.today.progress.reduce((sum, item) => sum + item.due, 0)
  const total = rateOf(done, due)

  return (
    <Panel icon={<ClipboardList className="h-4 w-4" />} title="층별 점검 현황" tone="green" href="/checksheets" linkLabel="전체보기">
      <div className="mb-4 flex items-center gap-5 rounded-xl border bg-gradient-to-br from-slate-50 to-blue-50/60 p-4 dark:from-slate-900/60 dark:to-blue-950/30">
        <ProgressRing rate={total} size={92} stroke={9}>
          <span className={cn('text-xl font-bold leading-none tabular-nums', total == null ? 'text-slate-400' : 'text-slate-900 dark:text-white')}>
            {total == null ? '-' : `${total}%`}
          </span>
          <span className="mt-1 text-[10px] font-semibold tabular-nums text-muted-foreground">{num(done)}/{num(due)}</span>
        </ProgressRing>
        <div className="min-w-0 flex-1 space-y-2">
          {data.today.progress.map((item) => (
            <KindBar key={item.kind} kind={item.kind} done={item.done} due={item.due} />
          ))}
        </div>
      </div>
    </Panel>
  )
}

function Panel({ icon, title, tone = 'orange', href, linkLabel, children }: { icon: ReactNode; title: string; tone?: CardTone; href?: string; linkLabel?: string; children: ReactNode }) {
  return (
    <article className={cn(CARD, 'h-full min-h-0')}>
      <CardHeader tone={tone} icon={icon} title={title} solid>
        {href && linkLabel && (
          <Link href={href} className="flex items-center gap-0.5 text-xs font-semibold text-white/90 hover:text-white hover:underline">
            {linkLabel}<ChevronRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </CardHeader>
      <div className="flex flex-1 flex-col p-4">{children}</div>
    </article>
  )
}

function StockDonut({ total, positive, zero, long }: { total: number; positive: number; zero: number; long: number }) {
  const base = Math.max(1, positive + zero + long)
  const slices = [
    { label: '재고 있음', value: positive, color: '#3b82f6' },
    { label: '장기 재고', value: long, color: '#f59e0b' },
    { label: '재고 없음', value: zero, color: '#94a3b8' },
  ]
  let cursor = 0
  const gradient = slices
    .map((slice) => {
      const start = cursor
      cursor += (slice.value / base) * 100
      return `${slice.color} ${start}% ${cursor}%`
    })
    .join(', ')
  return (
    <div className="flex items-center gap-5">
      <div className="relative h-40 w-40 shrink-0 rounded-full" style={{ background: `conic-gradient(${gradient})` }}>
        <div className="absolute inset-[22px] flex flex-col items-center justify-center rounded-full bg-card text-center ring-1 ring-black/[0.04] dark:ring-white/10">
          <p className="text-[11px] text-muted-foreground">총 품목</p>
          <p className="text-xl font-bold tabular-nums">{num(total)}<span className="text-sm">종</span></p>
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-3 text-[13px]">
        {slices.map((slice) => (
          <li key={slice.label} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: slice.color }} />
            <span className="flex-1">{slice.label}</span>
            <span className="font-semibold tabular-nums">{num(slice.value)}종</span>
            <span className="w-11 text-right text-xs tabular-nums text-muted-foreground">{(Math.round((slice.value / base) * 1000) / 10).toFixed(1)}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

const DEFECT_STATUS = [
  { key: 'done', label: '완료', color: '#10b981' },
  { key: 'in_progress', label: '진행중', color: '#f59e0b' },
  { key: 'not_started', label: '미진행', color: '#f43f5e' },
] as const

function DefectStatus({ customer, process, open }: { customer: DashboardStats['quality']['customerNc']; process: DashboardStats['quality']['processNc']; open: number }) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="space-y-4">
        <DefectBlock title="고객 부적합" href="/quality/nonconformity?tab=customer" counts={customer} />
        <DefectBlock title="공정 부적합" href="/quality/nonconformity?tab=process" counts={process} />
      </div>
      <div className="mt-auto pt-4">
        <div className={cn(
          'flex items-start gap-2.5 rounded-xl border px-3.5 py-3',
          open > 0
            ? 'border-rose-100 bg-rose-50/80 dark:border-rose-500/30 dark:bg-rose-950/45'
            : 'border-emerald-100 bg-emerald-50/80 dark:border-emerald-500/30 dark:bg-emerald-950/40',
        )}>
          <AlertTriangle className={cn('mt-0.5 h-4 w-4 shrink-0', open > 0 ? 'text-rose-500 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400')} />
          <div className="text-xs">
            <p className="font-semibold text-slate-800 dark:text-slate-100">
              {open > 0 ? `미결 부적합이 ${num(open)}건입니다.` : '미결 부적합이 없습니다.'}
            </p>
            <p className="mt-0.5 text-muted-foreground">고객 부적합과 공정 부적합을 합친 미진행·진행중 건수입니다.</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function DefectBlock({ title, href, counts }: { title: string; href: string; counts: DashboardStats['quality']['customerNc'] }) {
  const total = counts.done + counts.in_progress + counts.not_started
  const base = Math.max(1, total)
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2 text-[13px]">
        <Link href={href} className="font-semibold text-slate-800 hover:text-blue-600 hover:underline dark:text-slate-100 dark:hover:text-blue-400">{title}</Link>
        <span className="text-xs text-muted-foreground">총 {num(total)}건</span>
      </div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
        {DEFECT_STATUS.map((status) => counts[status.key] > 0 && (
          <div key={status.key} style={{ width: `${(counts[status.key] / base) * 100}%`, background: status.color }} />
        ))}
      </div>
      <ul className="mt-2 grid grid-cols-3 text-center">
        {DEFECT_STATUS.map((status) => (
          <li key={status.key}>
            <p className="text-lg font-bold leading-none tabular-nums text-slate-900 dark:text-white">{num(counts[status.key])}</p>
            <p className="mt-1 flex items-center justify-center gap-1 text-[11px] text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: status.color }} />
              {status.label}
            </p>
          </li>
        ))}
      </ul>
    </div>
  )
}
