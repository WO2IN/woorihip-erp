'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, Barcode, ChevronRight, ClipboardCheck, Download, ExternalLink, FileCheck, FileText, Minus, Plus, RotateCcw,
  type LucideIcon,
} from 'lucide-react'
import { BarcodePrintButton } from '@/components/shared/barcode-print-button'
import { Button } from '@/components/ui/button'
import { EMBED_READY_MESSAGE } from '@/hooks/use-embed-preview'
import { fileKind } from '@/lib/file-types'
import { BARCODE_STATUSES, BARCODE_STATUS_LABEL, type BarcodeStatus, type TraceDoc, type TraceResult } from '@/lib/trace'
import { cn } from '@/lib/utils'

/** 상태 뱃지 색. 위쪽 파란 카드 위에 올라가므로 진한 바탕에서도 읽히는 색을 쓴다. */
export const STATUS_TONE: Record<BarcodeStatus, string> = {
  received: 'bg-white text-slate-700',
  working: 'bg-amber-300 text-amber-950',
  done: 'bg-sky-300 text-sky-950',
  shipReady: 'bg-violet-300 text-violet-950',
  shipped: 'bg-emerald-300 text-emerald-950',
}

/** 작업 이력 한 줄이 어느 서류에서 나왔는지에 따라 색을 달리한다. */
const SOURCE_TONE: Record<string, { dot: string; tag: string }> = {
  입고등록: { dot: 'bg-slate-500', tag: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200' },
  수입검사성적서: { dot: 'bg-violet-500', tag: 'bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-200' },
  이력카드: { dot: 'bg-blue-500', tag: 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-200' },
  작업일보: { dot: 'bg-amber-500', tag: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-200' },
  출하성적서: { dot: 'bg-emerald-500', tag: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-200' },
}
const DEFAULT_SOURCE_TONE = SOURCE_TONE.입고등록

const ZOOMS = [1, 1.5, 2, 3, 4]

const dot = (value: string) => value.replace(/-/g, '.')

function judgeTone(judge: string) {
  if (judge === 'OK' || judge === '합격') return 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:ring-emerald-500/40'
  if (judge === 'NG' || judge === '불합격') return 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-200 dark:ring-rose-500/40'
  return 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-500/40'
}

function JudgeBadge({ judge }: { judge: string }) {
  if (!judge) return null
  return <span className={cn('shrink-0 rounded-md px-2 py-0.5 text-xs font-bold ring-1', judgeTone(judge))}>{judge}</span>
}

/** 이 창 안에서 미리보기로 여는 서류 하나. */
interface PreviewDoc {
  key: string
  title: string
  icon: LucideIcon
  tone: string
  /** sheet: 사이트의 서류 화면, pdf·image: 올린 파일, download: 미리보기가 안 되는 파일 */
  kind: 'sheet' | 'pdf' | 'image' | 'download'
  src: string
  /** 서류를 고칠 수 있는 원래 화면 주소 (sheet 만) */
  page?: string
  /** 서류 화면이 제대로 보이는 가로 폭(px). 창이 이보다 좁으면 축소해서 보여 준다. */
  baseWidth: number
  meta: string
  judge: string
  status?: { label: string; done: boolean }
}

function sheetDoc(key: string, title: string, icon: LucideIcon, tone: string, path: string, baseWidth: number, doc: TraceDoc): PreviewDoc {
  const page = `${path}?open=${encodeURIComponent(doc.id)}`
  return {
    key, title, icon, tone, kind: 'sheet', src: `${page}&embed=1`, page, baseWidth,
    meta: [doc.date && dot(doc.date), doc.by, doc.note].filter(Boolean).join(' · ') || '날짜 없음',
    judge: doc.judge,
    status: { label: doc.done ? '완료' : '작성중', done: doc.done },
  }
}

const TONE = {
  violet: 'bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-200',
  blue: 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-200',
  emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-200',
  slate: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
}

function buildDocs(data: TraceResult): PreviewDoc[] {
  const docs: PreviewDoc[] = []
  data.incomings.forEach((incoming, index) => {
    const title = data.incomings.length > 1 ? `수입검사성적서 ${index + 1}` : '수입검사성적서'
    docs.push(sheetDoc(`incoming-${incoming.id}`, title, ClipboardCheck, TONE.violet, '/shipment/incoming-inspection', 850, incoming))
  })
  data.cards.forEach((card) => {
    const title = data.cards.length > 1 && card.lot ? `이력카드 ${card.lot}` : '이력카드'
    docs.push(sheetDoc(`card-${card.id}`, title, Barcode, TONE.blue, '/shipment/lot-card', 1180, card))
  })
  data.reports.forEach((report, index) => {
    const title = data.reports.length > 1 ? `출하성적서 ${report.lot || index + 1}` : '출하성적서'
    docs.push(sheetDoc(`report-${report.id}`, title, FileCheck, TONE.emerald, '/shipment/outgoing-report', 850, report))
  })
  for (const file of data.documents) {
    const preview = fileKind(file.name)?.preview
    docs.push({
      key: `file-${file.id}`,
      title: file.name,
      icon: FileText,
      tone: TONE.slate,
      kind: preview ?? 'download',
      src: `/api/files/${file.fileId}`,
      baseWidth: 850,
      meta: [file.type, file.issueDate && dot(file.issueDate)].filter(Boolean).join(' · '),
      judge: '',
    })
  }
  return docs
}

function Loading() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-100 text-sm font-medium text-slate-500 dark:bg-slate-900 dark:text-slate-300">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      서류를 불러오는 중…
    </div>
  )
}

/**
 * 서류 화면을 iframe 으로 띄운다. 서류는 baseWidth 폭으로 그려야 모양이 맞으므로
 * iframe 을 그 폭으로 두고 창 폭에 맞게 통째로 축소한다. 세로 스크롤은 iframe 안에서 한다.
 */
function SheetFrame({ doc, zoom, active }: { doc: PreviewDoc; zoom: number; active: boolean }) {
  const box = useRef<HTMLDivElement>(null)
  const frame = useRef<HTMLIFrameElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const element = box.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      // 다른 서류를 보는 동안(display:none)에는 0 이 온다. 마지막 크기를 그대로 둔다.
      if (width > 0 && height > 0) setSize({ width, height })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.data?.type !== EMBED_READY_MESSAGE) return
      if (event.source === frame.current?.contentWindow) setShown(true)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  const scale = size.width > 0 ? Math.min(1, size.width / doc.baseWidth) * zoom : 1
  const frameWidth = Math.max(doc.baseWidth, size.width / scale)

  return (
    <div ref={box} className={cn('absolute inset-0 overflow-x-auto overflow-y-hidden', !active && 'hidden')}>
      {size.width > 0 && (
        <div className="overflow-hidden" style={{ width: frameWidth * scale, height: size.height }}>
          <iframe
            ref={frame}
            src={doc.src}
            title={`${doc.title} 미리보기`}
            // 서류가 뜨면 안쪽 화면이 알려 준다. 알림이 없어도(서류를 못 찾은 경우 등) 로딩 표시는 끈다.
            onLoad={() => window.setTimeout(() => setShown(true), 6000)}
            className="block border-0 bg-slate-200"
            style={{ width: frameWidth, height: size.height / scale, transform: `scale(${scale})`, transformOrigin: '0 0' }}
          />
        </div>
      )}
      {!shown && <Loading />}
    </div>
  )
}

function FileFrame({ doc, zoom, active }: { doc: PreviewDoc; zoom: number; active: boolean }) {
  if (doc.kind === 'pdf') {
    return <iframe src={doc.src} title={`${doc.title} 미리보기`} className={cn('absolute inset-0 h-full w-full border-0 bg-white', !active && 'hidden')} />
  }
  if (doc.kind === 'image') {
    return (
      <div className={cn('absolute inset-0 overflow-auto', !active && 'hidden')}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={doc.src} alt={doc.title} className="mx-auto block max-w-none" style={{ width: `${zoom * 100}%` }} />
      </div>
    )
  }
  return (
    <div className={cn('absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center', !active && 'hidden')}>
      <FileText className="h-10 w-10 text-slate-400" />
      <p className="text-sm text-slate-600 dark:text-slate-300">이 형식의 파일은 미리보기가 되지 않습니다. 내려받아서 확인해 주세요.</p>
      <a href={`${doc.src}?download=true`} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">
        <Download className="h-4 w-4" />내려받기
      </a>
    </div>
  )
}

function DocButton({ doc, onOpen }: { doc: PreviewDoc; onOpen: () => void }) {
  const Icon = doc.icon
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex w-full items-center gap-3 rounded-xl border bg-card px-3 py-3 text-left shadow-sm transition hover:border-blue-400 hover:bg-blue-50/60 hover:shadow dark:hover:border-blue-500/50 dark:hover:bg-blue-950/30"
    >
      <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', doc.tone)}>
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-bold text-slate-900 dark:text-white">{doc.title}</span>
        <span className="block truncate text-xs text-muted-foreground">{doc.meta || '\u00A0'}</span>
      </span>
      <JudgeBadge judge={doc.judge} />
      {doc.status && (
        <span className={cn('shrink-0 text-xs font-bold', doc.status.done ? 'text-emerald-600 dark:text-emerald-300' : 'text-amber-600 dark:text-amber-300')}>
          {doc.status.label}
        </span>
      )}
      <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-blue-600" />
    </button>
  )
}

function MissingDoc({ icon: Icon, title }: { icon: LucideIcon; title: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-dashed px-3 py-3 text-muted-foreground">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800">
        <Icon className="h-5 w-5" />
      </span>
      <span className="flex-1 text-[15px] font-semibold">{title}</span>
      <span className="text-xs font-medium">아직 없음</span>
    </div>
  )
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-white/12 px-3 py-2.5 ring-1 ring-white/15">
      <dt className="text-[11px] font-semibold text-blue-100">{label}</dt>
      <dd className="mt-0.5 break-words text-base font-bold leading-snug text-white tabular-nums">{value || '-'}</dd>
    </div>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 bg-card px-3 py-2.5">
      <dt className="text-[11px] font-semibold text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words text-sm font-semibold text-slate-900 dark:text-white">{value || '-'}</dd>
    </div>
  )
}

const STATUS_TIME = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
})

/** 입고 → 작업중 → 작업완료 → 출하대기 → 출하완료 진행 표시. 각 단계로 바뀐 시각과 찍은 사람을 함께 보여 준다. */
function StatusStepper({ status, log }: { status: BarcodeStatus; log: TraceResult['statusLog'] }) {
  const current = BARCODE_STATUSES.indexOf(status)
  // 같은 상태로 여러 번 바뀐 경우 가장 최근 기록을 쓴다.
  const latest = (target: BarcodeStatus) => [...log].reverse().find((entry) => entry.status === target)
  return (
    <ol className="grid grid-cols-5 gap-1.5" aria-label="진행 상태">
      {BARCODE_STATUSES.map((key, index) => {
        const reached = index <= current
        const entry = latest(key)
        const time = entry && !Number.isNaN(Date.parse(entry.at)) ? STATUS_TIME.format(new Date(entry.at)) : ''
        return (
          <li key={key} className="min-w-0">
            <span className={cn('block h-1.5 rounded-full', reached ? 'bg-white' : 'bg-white/25')} />
            <span className={cn('mt-1.5 block truncate text-[13px] font-bold', index === current ? 'text-white' : reached ? 'text-blue-100' : 'text-blue-200/60')}>
              {BARCODE_STATUS_LABEL[key]}
            </span>
            <span className="block truncate text-[11px] tabular-nums text-blue-100/80">{reached && time ? `${time}${entry?.by ? ` · ${entry.by}` : ''}` : '\u00A0'}</span>
          </li>
        )
      })}
    </ol>
  )
}

/**
 * 스캔한 제품의 정보·작업 이력·관련 서류.
 * 서류를 누르면 다른 화면으로 가지 않고 이 창 안에서 미리보기를 띄운다.
 * onNavigate: 서류 화면으로 직접 이동할 때 창을 닫는다. onRescan: 다른 제품 스캔.
 */
export function TraceResultView({ data, onNavigate, onRescan }: { data: TraceResult; onNavigate: () => void; onRescan?: () => void }) {
  const docs = useMemo(() => buildDocs(data), [data])
  const [activeKey, setActiveKey] = useState<string | null>(null)
  // 한 번 연 서류는 계속 띄워 두어, 서류 사이를 오갈 때 다시 불러오지 않는다.
  const [openedKeys, setOpenedKeys] = useState<string[]>([])
  const [zoomIndex, setZoomIndex] = useState(0)
  const active = docs.find((doc) => doc.key === activeKey) ?? null
  const zoom = ZOOMS[zoomIndex]

  function openDoc(key: string) {
    setActiveKey(key)
    setZoomIndex(0)
    setOpenedKeys((current) => (current.includes(key) ? current : [...current, key]))
  }

  const hasReport = data.reports.length > 0
  const workPeriod = data.workPeriod ? data.workPeriod.split(' ~ ').map(dot).join(' ~ ') : ''
  // 이력카드가 있으면 카드 수량(도금 후 포함)을, 아직 없으면 입고 수량을 보여 준다.
  const quantity = data.quantity
    ? [data.quantity, data.platedQuantity && `도금 후 ${data.platedQuantity}`].filter(Boolean).join(' / ')
    : data.inboundQuantity
  const lotText = data.lots.length > 2 ? `${data.lots[0]} 외 ${data.lots.length - 1}건` : data.lots.join(', ')

  return (
    <div className="min-w-0">
      {/* ── 서류 미리보기 ─────────────────────────────────────────── */}
      <div className={cn('space-y-3', !active && 'hidden')}>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setActiveKey(null)}>
            <ArrowLeft className="h-4 w-4" />제품 이력
          </Button>
          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-700 dark:text-slate-200">
            {data.product || '(품명 없음)'}
            <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">{data.barcode}</span>
          </p>
          {active && (active.kind === 'sheet' || active.kind === 'image') && (
            <div className="flex items-center gap-1">
              <Button type="button" variant="outline" size="icon-sm" aria-label="축소" disabled={zoomIndex === 0} onClick={() => setZoomIndex((value) => Math.max(0, value - 1))}>
                <Minus className="h-4 w-4" />
              </Button>
              <span className="w-12 text-center text-xs font-semibold tabular-nums text-muted-foreground">{zoom === 1 ? '맞춤' : `${zoom * 100}%`}</span>
              <Button type="button" variant="outline" size="icon-sm" aria-label="확대" disabled={zoomIndex === ZOOMS.length - 1} onClick={() => setZoomIndex((value) => Math.min(ZOOMS.length - 1, value + 1))}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          )}
          {active?.page && (
            <Link href={active.page} onClick={onNavigate} className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-semibold text-blue-600 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-950/40">
              <ExternalLink className="h-3.5 w-3.5" />서류 화면에서 열기
            </Link>
          )}
          {active && active.kind !== 'sheet' && (
            <a href={active.src} target="_blank" rel="noopener noreferrer" className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-semibold text-blue-600 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-950/40">
              <ExternalLink className="h-3.5 w-3.5" />새 탭에서 열기
            </a>
          )}
        </div>

        <div role="tablist" aria-label="관련 서류" className="flex gap-1.5 overflow-x-auto pb-0.5">
          {docs.map((doc) => {
            const Icon = doc.icon
            const selected = doc.key === activeKey
            return (
              <button
                key={doc.key}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => openDoc(doc.key)}
                className={cn(
                  'inline-flex h-9 max-w-[220px] shrink-0 items-center gap-1.5 rounded-lg border px-3 text-sm font-semibold transition',
                  selected
                    ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
                    : 'bg-card text-slate-600 hover:border-blue-300 hover:bg-blue-50 dark:text-slate-300 dark:hover:bg-blue-950/30',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{doc.title}</span>
              </button>
            )
          })}
        </div>

        <div className="relative h-[calc(92dvh-11.5rem)] min-h-[320px] overflow-hidden rounded-xl border bg-slate-200 dark:bg-slate-900">
          {docs.filter((doc) => openedKeys.includes(doc.key)).map((doc) => (
            doc.kind === 'sheet'
              ? <SheetFrame key={doc.key} doc={doc} zoom={zoom} active={doc.key === activeKey} />
              : <FileFrame key={doc.key} doc={doc} zoom={zoom} active={doc.key === activeKey} />
          ))}
        </div>
      </div>

      {/* ── 제품 이력 ─────────────────────────────────────────────── */}
      <div className={cn('space-y-4', active && 'hidden')}>
        <div className="rounded-2xl bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 p-4 text-white shadow-md sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className={cn('inline-flex rounded-full px-2.5 py-0.5 text-xs font-extrabold', STATUS_TONE[data.status])}>{BARCODE_STATUS_LABEL[data.status]}</span>
                {data.source === 'manual' && <span className="inline-flex rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-bold text-blue-50 ring-1 ring-white/25">직접 등록</span>}
              </div>
              <p className="mt-2 break-words text-2xl font-extrabold leading-tight sm:text-[28px]">{data.product || '(품명 없음)'}</p>
              <p className="mt-1 text-sm font-medium text-blue-100">{[data.partner, data.spec].filter(Boolean).join(' · ') || '-'}</p>
            </div>
            <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
              <span className="rounded-lg bg-white/15 px-3 py-1.5 font-mono text-sm font-bold tracking-[0.14em] ring-1 ring-white/20">{data.barcode}</span>
              <BarcodePrintButton
                label={{ barcode: data.barcode, partner: data.partner, product: data.product, lotNo: data.lots.join(', '), spec: data.spec, date: data.receivedOn }}
                className="border-white/40 bg-white text-blue-700 hover:bg-blue-50 hover:text-blue-800 dark:border-white/40 dark:bg-white dark:text-blue-700 dark:hover:bg-blue-50"
              />
            </div>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
            <HeroStat label="입고일" value={data.receivedOn ? dot(data.receivedOn) : ''} />
            <HeroStat label="작업 기간" value={workPeriod} />
            <HeroStat label="LOT" value={lotText} />
            <HeroStat label="수량" value={quantity} />
          </dl>
          <div className="mt-4 border-t border-white/15 pt-3">
            <StatusStepper status={data.status} log={data.statusLog} />
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-5">
          <Fact label="층" value={data.floor ? `${data.floor}층` : ''} />
          <Fact label="입고 수량" value={data.inboundQuantity} />
          <Fact label="소재" value={data.material} />
          <Fact label="롤 수" value={data.rollCount} />
          <Fact label="소재 업체" value={data.materialVendor} />
        </dl>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <section className="min-w-0 rounded-2xl border bg-card p-4">
            <h3 className="text-base font-extrabold text-slate-900 dark:text-white">작업 이력</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">작업일보는 LOT 번호가 없어서 업체·품명이 같고 입고 이후인 기록을 보여 줍니다.</p>
            {data.steps.length === 0 ? (
              <p className="mt-3 rounded-xl border border-dashed px-3 py-3 text-sm text-muted-foreground">기록된 일자가 없습니다.</p>
            ) : (
              <ol className="mt-4">
                {data.steps.map((step, index) => {
                  const tone = SOURCE_TONE[step.source] ?? DEFAULT_SOURCE_TONE
                  const last = index === data.steps.length - 1
                  return (
                    <li key={`${step.label}-${index}`} className="flex gap-3">
                      <div className="flex w-3 shrink-0 flex-col items-center">
                        <span className={cn('mt-1.5 h-3 w-3 shrink-0 rounded-full ring-4 ring-white dark:ring-slate-900', tone.dot)} />
                        {!last && <span className="w-0.5 flex-1 bg-slate-200 dark:bg-slate-700" />}
                      </div>
                      <div className={cn('flex min-w-0 flex-1 items-start gap-2', !last && 'pb-4')}>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="text-[15px] font-bold text-slate-900 dark:text-white">{step.label}</span>
                            <span className={cn('rounded-md px-1.5 py-0.5 text-[11px] font-bold', tone.tag)}>{step.source}</span>
                            <span className="text-xs font-semibold tabular-nums text-muted-foreground">{dot(step.date)}</span>
                            {step.lot && <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">LOT {step.lot}</span>}
                          </div>
                          {step.detail && <p className="mt-0.5 break-words text-sm text-slate-600 dark:text-slate-300">{step.detail}</p>}
                        </div>
                        {step.judge && <JudgeBadge judge={step.judge} />}
                      </div>
                    </li>
                  )
                })}
              </ol>
            )}
          </section>

          <section className="min-w-0 rounded-2xl border bg-card p-4">
            <h3 className="text-base font-extrabold text-slate-900 dark:text-white">관련 서류</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">서류를 누르면 이 창에서 바로 미리보기가 열립니다.</p>
            <div className="mt-3 space-y-2">
              {data.incomings.length === 0 && <MissingDoc icon={ClipboardCheck} title="수입검사성적서" />}
              {data.cards.length === 0 && <MissingDoc icon={Barcode} title="이력카드" />}
              {docs.filter((doc) => doc.kind === 'sheet').map((doc) => <DocButton key={doc.key} doc={doc} onOpen={() => openDoc(doc.key)} />)}
              {!hasReport && <MissingDoc icon={FileCheck} title="출하성적서" />}
              {docs.filter((doc) => doc.kind !== 'sheet').map((doc) => <DocButton key={doc.key} doc={doc} onOpen={() => openDoc(doc.key)} />)}
            </div>
          </section>
        </div>

        {onRescan && (
          <Button type="button" variant="outline" onClick={onRescan} className="w-full">
            <RotateCcw className="h-4 w-4" />다른 제품 스캔
          </Button>
        )}
      </div>
    </div>
  )
}
