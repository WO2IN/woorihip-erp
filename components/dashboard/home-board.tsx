'use client'

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode, type WheelEvent as ReactWheelEvent } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  Boxes,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Factory,
  FileText,
  Info,
  ShieldCheck,
  Truck,
  Users,
} from 'lucide-react'
import { MovementTrend } from '@/components/dashboard/movement-trend'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { DashboardStats } from '@/lib/dashboard-stats'
import { PAGE_INSET } from '@/components/shared/page-header'
import { cn } from '@/lib/utils'

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

type RecentMovement = DashboardStats['process']['views']['inbound']['recent'][number]

function shortDate(value: string) {
  const digits = String(value ?? '').replace(/\D/g, '')
  return digits.length >= 8 ? `${digits.slice(4, 6)}.${digits.slice(6, 8)}` : value
}

export function HomeBoard({ data }: { data: DashboardStats }) {
  useEffect(() => {
    const main = document.querySelector('.app-shell-main')
    if (!(main instanceof HTMLElement)) return
    main.dataset.pageTone = 'blue'
    main.dataset.pageWave = '1'
    const started = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const t = (now - started) / 1000
      const dark = document.documentElement.classList.contains('dark')
      const light = dark ? 0.4 : 0.9
      const chroma = dark ? 0.07 : 0.055
      const alpha = dark ? 0.55 : 0.5
      const breathe = Math.sin(t / 40) * 12
      main.style.setProperty('--wash-x', `${36 + Math.sin(t * 0.07) * 24}%`)
      main.style.setProperty('--wash-y', `${16 + Math.cos(t * 0.05) * 14}%`)
      main.style.setProperty('--wash-x2', `${72 + Math.cos(t * 0.045) * 20}%`)
      main.style.setProperty('--wash-y2', `${74 + Math.sin(t * 0.055) * 16}%`)
      main.style.setProperty('--wash-x3', `${48 + Math.sin(t * 0.035 + 1.4) * 22}%`)
      main.style.setProperty('--wash-y3', `${46 + Math.cos(t * 0.03) * 16}%`)
      main.style.setProperty('--wash-violet', `oklch(${light} ${chroma} ${248 + breathe} / ${alpha})`)
      main.style.setProperty('--wash-amber', `oklch(${light} ${chroma * 0.85} ${72 + breathe * 0.5} / ${alpha * 0.75})`)
      main.style.setProperty('--wash-mint', `oklch(${light} ${chroma * 0.7} ${198 + breathe * 0.7} / ${alpha * 0.65})`)
      frame = window.requestAnimationFrame(tick)
    }
    frame = window.requestAnimationFrame(tick)
    return () => {
      window.cancelAnimationFrame(frame)
      if (main.dataset.pageTone === 'blue') delete main.dataset.pageTone
      delete main.dataset.pageWave
      for (const name of ['--wash-x', '--wash-y', '--wash-x2', '--wash-y2', '--wash-x3', '--wash-y3', '--wash-violet', '--wash-amber', '--wash-mint']) {
        main.style.removeProperty(name)
      }
    }
  }, [])

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

  const done = data.today.progress.reduce((sum, item) => sum + item.done, 0)
  const due = data.today.progress.reduce((sum, item) => sum + item.due, 0)
  const progress = due > 0 ? Math.round((done / due) * 100) : 0
  const positive = data.process.stockPositive
  const zero = data.process.stockZero
  const negative = data.process.shortage
  const customerOpen = data.quality.customerNc.not_started + data.quality.customerNc.in_progress
  const processOpen = data.quality.processNc.not_started + data.quality.processNc.in_progress
  const lastIn = data.process.views.inbound.recent[0]
  const lastOut = data.process.views.outbound.recent[0]
  const audits = data.customer.audits
  const span = data.process.span

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
      <BoardHeader date={data.today.date} />

      <section className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi href="/shipment" icon={<Truck className="h-7 w-7" />} iconClass="bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-300" label="오늘 입 / 출고" value={`${num(data.process.todayIn)} / ${num(data.process.todayOut)}`} unit="건" hint="입고 / 출고" />
        <Kpi href="/shipment?tab=stock" icon={<Boxes className="h-7 w-7" />} iconClass="bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-300" label="재고 부족" value={num(negative)} unit="종" hint="현재고가 0보다 작은 품목" />
        <Kpi href="/explorer" icon={<FileText className="h-7 w-7" />} iconClass="bg-violet-100 text-violet-600 dark:bg-violet-500/20 dark:text-violet-300" label="오늘 성적서" value={num(data.quality.todayCertificates)} unit="건" hint={`이번 달 ${num(data.quality.monthCertificates)}건`} />
        <Kpi href="/checksheets" icon={<Clock className="h-7 w-7" />} iconClass="bg-orange-100 text-orange-500 dark:bg-orange-500/20 dark:text-orange-300" label="오늘 점검 진행률" value={String(progress)} unit="%" hint={due > 0 ? `${done} / ${due}개소 완료` : '오늘 점검 대상 없음'} />
      </section>

      <section className="grid gap-5 md:grid-cols-2 2xl:grid-cols-4">
        <ModuleCard
          tone="blue"
          icon={Truck}
          title="재고 관리"
          text="재고 현황 · 입출고"
          href="/shipment"
          value={num(data.process.stockItems)}
          unit="종"
          caption="재고 품목"
          chip={negative > 0 ? { label: `재고 부족 ${num(negative)}종`, tone: 'rose' } : { label: '재고 정상', tone: 'green' }}
          recent={[
            { label: '최근 입고', tone: 'blue', row: lastIn },
            { label: '최근 출고', tone: 'green', row: lastOut },
          ]}
          links={[['입고등록', '/shipment?tab=in'], ['출고등록', '/upload'], ['재고현황', '/shipment?tab=stock']]}
        />
        <ModuleCard
          tone="violet"
          icon={Users}
          title="고객 관리"
          text="고객심사 · QSA · QPA"
          href="/customer/audit-status"
          value={num(data.customer.companies)}
          unit="개사"
          caption="거래처 수"
          side={['품목', `${num(data.customer.products)}종`]}
          stats={audits.qsa + audits.qpa > 0
            ? [['QSA', `${num(audits.qsa)}건`], ['QPA', `${num(audits.qpa)}건`], ['지적 조치', `${num(audits.closed)}/${num(audits.findings)}`]]
            : undefined}
          note={audits.qsa + audits.qpa > 0 ? undefined : '등록된 고객심사가 없습니다.'}
          links={[['고객심사현황', '/customer/audit-status'], ['QSA · QPA', '/customer/qsa-qpa']]}
        />
        <ModuleCard
          tone="green"
          icon={ShieldCheck}
          title="품질 관리"
          text="부적합 · 4M · IATF"
          href="/quality/nonconformity"
          value={num(data.quality.openNc)}
          unit="건"
          caption="미결 부적합"
          chip={data.quality.openNc > 0 ? { label: '확인 필요', tone: 'rose' } : { label: '현재 미결 없음', tone: 'green' }}
          stats={[['고객', `${num(customerOpen)}건`], ['공정', `${num(processOpen)}건`]]}
          links={[['부적합 관리', '/quality/nonconformity'], ['4M', '/quality/change-points'], ['IATF', '/quality/iatf']]}
        />
        <ModuleCard
          tone="orange"
          icon={Factory}
          title="공정 관리"
          text="현장 점검 · 공정"
          href="/checksheets"
          value={String(span.rate)}
          unit="%"
          caption="1·2·3층 전체"
          chip={span.due === 0 ? { label: '점검 대상 없음', tone: 'slate' } : span.done >= span.due ? { label: '점검 완료', tone: 'green' } : { label: '전체 기준', tone: 'orange' }}
          stats={span.floors.map((row) => [`${row.floor}층`, row.rate == null ? '-' : `${row.rate}%`])}
          links={[['일상점검', '/checksheets/daily'], ['5S', '/checksheets/5s'], ['온습도', '/checksheets/temp-humidity'], ['공정점검', '/process-check']]}
        />
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,0.95fr)_minmax(0,1fr)]">
        <MovementTrend week={data.process.views.trend.week} month={data.process.views.trend.month} />

        <Panel icon={<AlertTriangle className="h-4 w-4" />} title="품질 불량 현황" href="/quality/nonconformity" linkLabel="상세보기">
          <DefectStatus customer={data.quality.customerNc} process={data.quality.processNc} open={data.quality.openNc} />
        </Panel>

        <Panel icon={<Boxes className="h-4 w-4" />} title="재고 현황" href="/shipment?tab=stock" linkLabel="상세보기">
          <StockDonut total={data.process.stockItems} positive={positive} zero={zero} negative={negative} />
          {negative > 0 && (
            <div className="mt-auto pt-4">
              <div className="flex items-start gap-2.5 rounded-xl border border-blue-100 bg-blue-50/70 px-3.5 py-3 dark:border-blue-500/25 dark:bg-blue-950/40">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
                <div className="text-xs">
                  <p className="font-semibold text-slate-800 dark:text-slate-100">재고 부족 품목이 {num(negative)}종입니다.</p>
                  <p className="mt-0.5 text-muted-foreground">해당 품목을 우선적으로 확인해 주세요.</p>
                </div>
              </div>
            </div>
          )}
        </Panel>
      </section>
    </div>
        </section>
        <section className="h-full w-full shrink-0 overflow-y-auto overscroll-y-contain [scrollbar-width:none] [&::-webkit-scrollbar]:!hidden" aria-label="추가 화면">
          <DetailBoard date={data.today.date} leaves={data.absence.leaves} />
        </section>
      </div>
      {page > 0 && (
        <button
          type="button"
          aria-label="이전 페이지"
          onClick={() => setPage((current) => Math.max(0, current - 1))}
          className="absolute left-3 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border bg-card/95 text-slate-700 shadow-md hover:bg-card dark:text-slate-100"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      )}
      {page < pageCount - 1 && (
        <button
          type="button"
          aria-label="다음 페이지"
          onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
          className="absolute right-3 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border bg-card/95 text-slate-700 shadow-md hover:bg-card dark:text-slate-100"
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

function BoardHeader({ date }: { date: string }) {
  const weekday = WEEKDAY[new Date(`${date}T00:00:00`).getDay()]
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="text-xs font-semibold tracking-wide text-blue-700 dark:text-blue-300">WOORI-HIP · 통합 운영 현황</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-[28px]">통합 운영 대시보드</h1>
        <p className="mt-1 text-sm text-muted-foreground">효율적인 업무 관리를 위해 주요 현황을 한눈에 확인할 수 있습니다.</p>
      </div>
      <div className="flex items-center gap-3">
        <span className="inline-flex h-10 items-center gap-2 rounded-xl border bg-card px-4 text-sm font-medium shadow-sm">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          {date.replace(/-/g, '.')} ({weekday}) 기준
        </span>
      </div>
    </header>
  )
}

function DetailBoard({ date, leaves }: { date: string; leaves: DashboardStats['absence']['leaves'] }) {
  return (
    <div className={cn(PAGE_INSET, 'flex h-full min-h-0 flex-col gap-6 pb-16')}>
      <BoardHeader date={date} />
      <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-2 gap-5">
        <BoardShell title="공지사항" icon={<Info className="h-4 w-4 text-sky-600 dark:text-sky-300" />} />
        <AbsenceBoard leaves={leaves} />
        <BoardShell title="설비 현황" icon={<Factory className="h-4 w-4 text-violet-600 dark:text-violet-300" />} />
        <BoardShell title="문서 현황" icon={<FileText className="h-4 w-4 text-teal-600 dark:text-teal-300" />} />
      </div>
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
}

const ABSENCE_BADGE: Record<AbsenceKind, string> = {
  연차: BADGE.green,
  반차: BADGE.violet,
  출장: BADGE.orange,
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

function leavePeriod(start: string, end: string) {
  const label = (value: string) => {
    const digits = String(value ?? '').replace(/\D/g, '')
    if (digits.length < 8) return value
    return `${Number(digits.slice(4, 6))}월 ${Number(digits.slice(6, 8))}일`
  }
  return start === end ? label(start) : `${label(start)} – ${label(end)}`
}

function BoardShell({ title, icon }: { title: string; icon: ReactNode }) {
  return (
    <section aria-label={title} className="flex min-h-[220px] flex-col overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="flex items-center border-b px-4 py-3">
        <h2 className="flex items-center gap-2 text-[15px] font-bold text-slate-900 dark:text-white">
          {icon}
          {title}
        </h2>
      </div>
    </section>
  )
}

function AbsenceBoard({ leaves }: { leaves: DashboardStats['absence']['leaves'] }) {
  const [trip, setTrip] = useState<AbsenceRow | null>(null)
  const rows: AbsenceRow[] = [
    ...temporaryAbsences(),
    ...leaves.map((row) => ({ ...row, kind: row.leaveType })),
  ]
  return (
    <article className="flex min-h-[220px] flex-col overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="flex items-center gap-2 text-[15px] font-bold text-slate-900 dark:text-white">
          <CalendarDays className="h-4 w-4 text-blue-600 dark:text-blue-300" />
          출장 및 휴가
        </h2>
        <Link href="/approvals" className="flex items-center gap-0.5 text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400">
          결재<ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3 [scrollbar-width:none] [&::-webkit-scrollbar]:!hidden">
        {rows.length === 0 ? (
          <p className="rounded-xl border border-dashed px-3 py-4 text-sm text-muted-foreground">등록된 출장·휴가가 없습니다.</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => row.kind === '출장' && setTrip(row)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-xl border bg-slate-50/70 px-3 py-2.5 text-left dark:bg-slate-900/40',
                    row.kind === '출장' ? 'cursor-pointer hover:border-orange-300 hover:bg-orange-50/70 dark:hover:border-orange-500/40 dark:hover:bg-orange-950/30' : 'cursor-default',
                  )}
                >
                  <span className={cn('w-12 shrink-0 rounded-md py-1 text-center text-[11px] font-semibold ring-1', ABSENCE_BADGE[row.kind])}>
                    {row.kind}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-800 dark:text-slate-100">{row.name}</span>
                    {row.kind === '출장' && row.place && <span className="block truncate text-xs text-orange-700 dark:text-orange-300">{row.place}</span>}
                  </span>
                  <span className="shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[13px] font-semibold tabular-nums text-slate-900 shadow-sm dark:border-slate-600 dark:bg-slate-950 dark:text-white">{leavePeriod(row.start, row.end)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <Dialog open={trip != null} onOpenChange={(open) => { if (!open) setTrip(null) }}>
        <DialogContent overlayClassName="!z-[70]" className="!z-[80] sm:max-w-md">
          {trip && (
            <>
              <DialogHeader>
                <DialogTitle className="text-lg font-bold">{trip.name} 출장</DialogTitle>
                <DialogDescription>출장 상세 내용입니다.</DialogDescription>
              </DialogHeader>
              <dl className="space-y-3">
                <div className="rounded-xl border px-3 py-2.5">
                  <dt className="text-xs font-semibold text-muted-foreground">출장지</dt>
                  <dd className="mt-1 text-sm font-medium text-slate-900 dark:text-white">{trip.place || '미정'}</dd>
                </div>
                <div className="rounded-xl border px-3 py-2.5">
                  <dt className="text-xs font-semibold text-muted-foreground">기간</dt>
                  <dd className="mt-1 text-sm font-medium tabular-nums text-slate-900 dark:text-white">{leavePeriod(trip.start, trip.end)}</dd>
                </div>
                <div className="rounded-xl border px-3 py-2.5">
                  <dt className="text-xs font-semibold text-muted-foreground">사유</dt>
                  <dd className="mt-1 text-sm font-medium text-slate-900 dark:text-white">{trip.reason || '등록된 사유가 없습니다.'}</dd>
                </div>
              </dl>
            </>
          )}
        </DialogContent>
      </Dialog>
    </article>
  )
}

function Kpi({ href, icon, iconClass, label, value, unit, hint }: { href: string; icon: ReactNode; iconClass: string; label: string; value: string; unit: string; hint: string }) {
  return (
    <Link href={href} className="flex items-center gap-4 rounded-2xl border bg-card px-5 py-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <span className={cn('flex h-14 w-14 shrink-0 items-center justify-center rounded-full', iconClass)}>{icon}</span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-slate-700 dark:text-slate-200">{label}</span>
        <span className="mt-1 block text-[30px] font-bold leading-none tabular-nums text-slate-900 dark:text-white">
          {value}<span className="ml-1 text-base font-semibold">{unit}</span>
        </span>
        <span className="mt-2 block truncate text-xs text-muted-foreground">{hint}</span>
      </span>
    </Link>
  )
}

const MODULE = {
  blue: { band: 'bg-[linear-gradient(120deg,#5b8def,#2f6bea)]', icon: 'text-blue-600', value: 'text-slate-900 dark:text-white' },
  violet: { band: 'bg-[linear-gradient(120deg,#9b8cf5,#7a68ee)]', icon: 'text-violet-600', value: 'text-slate-900 dark:text-white' },
  green: { band: 'bg-[linear-gradient(120deg,#3fb68f,#22957a)]', icon: 'text-emerald-600', value: 'text-slate-900 dark:text-white' },
  orange: { band: 'bg-[linear-gradient(120deg,#fbab55,#f58a2c)]', icon: 'text-orange-500', value: 'text-slate-900 dark:text-white' },
} as const

function ModuleCard({
  tone, icon: Icon, title, text, href, value, unit, caption, chip, side, stats, note, recent, links,
}: {
  tone: keyof typeof MODULE
  icon: typeof Truck
  title: string
  text: string
  href: string
  value: string
  unit: string
  caption: string
  chip?: { label: string; tone: BadgeTone }
  side?: [string, string]
  stats?: [string, string][]
  note?: string
  recent?: { label: string; tone: BadgeTone; row?: RecentMovement }[]
  links: [string, string][]
}) {
  const style = MODULE[tone]
  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border bg-card shadow-sm">
      <Link href={href} className={cn('relative flex h-[88px] items-center gap-3 overflow-hidden px-4 text-white', style.band)}>
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white shadow-sm">
          <Icon className={cn('h-6 w-6', style.icon)} />
        </span>
        <span className="relative min-w-0 flex-1">
          <span className="block truncate text-[17px] font-bold">{title}</span>
          <span className="mt-0.5 block truncate text-xs text-white/85">{text}</span>
        </span>
        <Icon className="pointer-events-none absolute -bottom-3 right-7 h-20 w-20 text-white/10" />
        <ChevronRight className="relative h-5 w-5 shrink-0 text-white/90" />
      </Link>
      <div className="flex flex-1 flex-col px-4 pb-3 pt-4">
        <div className="flex h-[52px] items-start justify-between gap-2">
          <div className="min-w-0">
            <p className={cn('whitespace-nowrap text-[28px] font-bold leading-none tabular-nums', style.value)}>
              {value}<span className="ml-1 text-base font-semibold">{unit}</span>
            </p>
            <p className="mt-1.5 truncate text-xs text-muted-foreground">{caption}</p>
          </div>
          {chip && <span className={cn('shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ring-1', BADGE[chip.tone])}>{chip.label}</span>}
          {side && (
            <span className="shrink-0 whitespace-nowrap rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600 ring-1 ring-slate-200 dark:bg-slate-800/90 dark:text-slate-300 dark:ring-slate-600/45">
              {side[0]} <span className="font-bold text-slate-900 dark:text-white">{side[1]}</span>
            </span>
          )}
        </div>
        <div className="mb-2.5 mt-2 flex h-[52px] flex-col justify-end">
        {stats && (
          <p className="flex items-center gap-2.5 whitespace-nowrap text-sm text-slate-700 dark:text-slate-200">
            {stats.map(([label, stat], index) => (
              <span key={label} className="flex items-center gap-2.5">
                {index > 0 && <span className="h-3.5 w-px bg-border" />}
                <span>{label} <span className="font-semibold tabular-nums">{stat}</span></span>
              </span>
            ))}
          </p>
        )}
        {note && <p className="text-sm text-muted-foreground">{note}</p>}
        {recent && (
          <ul className="space-y-1.5 text-[13px]">
            {recent.map(({ label, tone: rowTone, row }) => (
              <li key={label} className="flex items-center gap-2">
                <span className={cn('shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ring-1', BADGE[rowTone])}>{label}</span>
                {row ? (
                  <>
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-medium text-slate-800 dark:text-slate-100">{row.company}</span>
                      <span className="text-muted-foreground"> · {row.product}</span>
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{shortDate(row.issueDate)}</span>
                  </>
                ) : (
                  <span className="text-muted-foreground">내역 없음</span>
                )}
              </li>
            ))}
          </ul>
        )}
        </div>
        <nav className="mt-auto flex items-center border-t border-border pt-3 text-xs text-slate-600 dark:text-slate-400">
          {links.map(([label, link], index) => (
            <span key={label} className="flex flex-1 items-center">
              {index > 0 && <span className="h-3 w-px bg-border" />}
              <Link href={link} className="flex-1 text-center hover:text-blue-600 hover:underline dark:hover:text-blue-400">{label}</Link>
            </span>
          ))}
        </nav>
      </div>
    </article>
  )
}

function Panel({ icon, title, href, linkLabel, children }: { icon: ReactNode; title: string; href?: string; linkLabel?: string; children: ReactNode }) {
  return (
    <article className="flex h-full flex-col rounded-2xl border bg-card p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-[15px] font-bold text-slate-900 dark:text-white">
          <span className="text-slate-700 dark:text-slate-200">{icon}</span>
          {title}
        </h2>
        {href && linkLabel && (
          <Link href={href} className="flex items-center gap-0.5 text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400">
            {linkLabel}<ChevronRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
      {children}
    </article>
  )
}

function StockDonut({ total, positive, zero, negative }: { total: number; positive: number; zero: number; negative: number }) {
  const base = Math.max(1, positive + zero + negative)
  const slices = [
    { label: '정상', value: positive, color: '#3b82f6' },
    { label: '부족', value: negative, color: '#fbbf24' },
    { label: '재고 0', value: zero, color: '#ef4444' },
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
