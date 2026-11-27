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
import { WorkPanel } from '@/components/dashboard/work-panel'
import { BARCODE_STATUS_LABEL, type BarcodeStatus, type TraceDoc, type TraceResult } from '@/lib/trace'
import { cn } from '@/lib/utils'

/** 상태 뱃지 색. 위쪽 파란 카드 위에 올라가므로 진한 바탕에서도 읽히는 색을 쓴다. */
export const STATUS_TONE: Record<BarcodeStatus, string> = {
  received: 'bg-white text-slate-700',
  working: 'bg-amber-300 text-amber-950',
  paused: 'bg-orange-200 text-orange-950',
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

/** 미리보기 배율. 1 = 100% (창 폭에 맞춤). 10%씩 늘리고 줄인다. */
const ZOOMS = [0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.8, 2, 2.5, 3]
const ZOOM_FIT = ZOOMS.indexOf(1)

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
/**
 * 미리보기 끌어서 움직이기 + 휠로 확대·축소.
 * 가로는 바깥 칸(box)을, 세로는 scrollY 로 받은 곳(서류 iframe 안쪽의 스크롤 칸 또는 같은 칸)을 움직인다.
 * 서류 iframe 위에 투명 판(layer)을 덮어 마우스를 받는다.
 */
function useDragPan(box: React.RefObject<HTMLDivElement | null>, scrollY: (dy: number) => void, onZoom: (step: 1 | -1) => void) {
  const drag = useRef<{ x: number; y: number } | null>(null)
  const layer = useRef<HTMLDivElement>(null)
  const zoomRef = useRef(onZoom)
  zoomRef.current = onZoom
  const [dragging, setDragging] = useState(false)

  // 휠: 페이지 스크롤 대신 배율을 한 단계씩 바꾼다. (터치패드처럼 잘게 오는 휠은 모아서 한 단계)
  useEffect(() => {
    const element = layer.current
    if (!element) return
    let sum = 0
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      sum += event.deltaY
      if (Math.abs(sum) < 40) return
      zoomRef.current(sum < 0 ? 1 : -1)
      sum = 0
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [])

  return {
    dragging,
    layer,
    handlers: {
      onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => {
        if (event.button !== 0) return
        event.preventDefault()
        event.currentTarget.setPointerCapture(event.pointerId)
        drag.current = { x: event.clientX, y: event.clientY }
        setDragging(true)
      },
      onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => {
        if (!drag.current) return
        const dx = event.clientX - drag.current.x
        const dy = event.clientY - drag.current.y
        drag.current = { x: event.clientX, y: event.clientY }
        if (box.current) box.current.scrollLeft -= dx
        scrollY(-dy)
      },
      onPointerUp: () => { drag.current = null; setDragging(false) },
      onPointerCancel: () => { drag.current = null; setDragging(false) },
    },
  }
}

/** 서류 화면(iframe) 안에서 실제로 세로 스크롤되는 칸. 앱 화면은 문서 자체가 아니라 본문 칸이 스크롤된다. */
function frameScroller(frame: HTMLIFrameElement | null): Element | null {
  const doc = frame?.contentDocument
  if (!doc) return null
  const candidates: (Element | null)[] = [doc.scrollingElement, doc.querySelector('.app-shell-main'), ...Array.from(doc.querySelectorAll('main, section, div'))]
  return candidates.find((element) => element && element.scrollHeight > element.clientHeight + 1 && (element === doc.scrollingElement || /(auto|scroll)/.test(getComputedStyle(element).overflowY))) ?? null
}

function SheetFrame({ doc, zoom, active, onZoom }: { doc: PreviewDoc; zoom: number; active: boolean; onZoom: (step: 1 | -1) => void }) {
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

  // 세로는 서류 화면(iframe) 안쪽이 스크롤되므로 그쪽을 움직인다. 배율만큼 나눠야 손 움직임과 맞는다.
  const pan = useDragPan(box, (dy) => {
    const scroller = frameScroller(frame.current)
    if (scroller) scroller.scrollTop += dy / scale
  }, onZoom)
  const scale = size.width > 0 ? Math.min(1, size.width / doc.baseWidth) * zoom : 1
  const frameWidth = Math.max(doc.baseWidth, size.width / scale)

  return (
    <div ref={box} className={cn('absolute inset-0 overflow-hidden', !active && 'hidden')}>
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
      {/* 끌어서 움직이는 판 (서류 위를 덮어 마우스를 받는다) */}
      <div ref={pan.layer} {...pan.handlers} className={cn('absolute inset-0 touch-none select-none', pan.dragging ? 'cursor-grabbing' : 'cursor-grab')} style={{ width: size.width > 0 ? frameWidth * scale : undefined }} />
      {!shown && <Loading />}
    </div>
  )
}

function ImageFrame({ doc, zoom, active, onZoom }: { doc: PreviewDoc; zoom: number; active: boolean; onZoom: (step: 1 | -1) => void }) {
  const box = useRef<HTMLDivElement>(null)
  const pan = useDragPan(box, (dy) => { if (box.current) box.current.scrollTop += dy }, onZoom)
  return (
    <div ref={box} className={cn('absolute inset-0 overflow-hidden', !active && 'hidden')}>
      <div ref={pan.layer} {...pan.handlers} className={cn('min-h-full touch-none select-none', pan.dragging ? 'cursor-grabbing' : 'cursor-grab')}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={doc.src} alt={doc.title} draggable={false} className="mx-auto block max-w-none" style={{ width: `${zoom * 100}%` }} />
      </div>
    </div>
  )
}

function FileFrame({ doc, zoom, active, onZoom }: { doc: PreviewDoc; zoom: number; active: boolean; onZoom: (step: 1 | -1) => void }) {
  if (doc.kind === 'pdf') {
    return <iframe src={doc.src} title={`${doc.title} 미리보기`} className={cn('absolute inset-0 h-full w-full border-0 bg-white', !active && 'hidden')} />
  }
  if (doc.kind === 'image') return <ImageFrame doc={doc} zoom={zoom} active={active} onZoom={onZoom} />
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

/**
 * 작업 이력 줄 묶기: 같은 날 같은 일(이름·서류·내용·판정이 모두 같음)을 LOT 마다 따로 쓰지 않고 한 줄로 모은다.
 * 예) 수입검사 7줄 → '수입검사 · LOT 20261127-01 ~ 07 (7건)'
 */
function groupSteps(steps: TraceResult['steps']) {
  const groups: (TraceResult['steps'][number] & { lots: string[]; count: number })[] = []
  for (const step of steps) {
    const same = groups.find((group) => group.label === step.label && group.source === step.source && group.date === step.date && (group.detail ?? '') === (step.detail ?? '') && (group.judge ?? '') === (step.judge ?? ''))
    if (same) {
      same.count += 1
      if (step.lot) same.lots.push(step.lot)
    } else {
      groups.push({ ...step, lots: step.lot ? [step.lot] : [], count: 1 })
    }
  }
  return groups.map((group) => ({ ...group, lot: lotRangeText(group.lots) || undefined }))
}

/** LOT 여러 개를 '20261127-01 ~ 07' 처럼 줄인다. 앞부분이 다르면 '첫 LOT ~ 끝 LOT'. */
function lotRangeText(lots: string[]) {
  const values = [...new Set(lots.map((lot) => lot.trim()).filter(Boolean))]
  if (values.length <= 1) return values[0] ?? ''
  const parts = values.map((lot) => lot.match(/^(.*)-(\d+)$/))
  if (parts.every((part) => part && part[1] === parts[0]![1])) {
    const numbers = parts.map((part) => part![2]).sort((a, b) => Number(a) - Number(b))
    return `${parts[0]![1]}-${numbers[0]} ~ ${numbers[numbers.length - 1]}`
  }
  const sorted = [...values].sort((a, b) => a.localeCompare(b, 'ko', { numeric: true }))
  return `${sorted[0]} ~ ${sorted[sorted.length - 1]}`
}

/** 진행 단계 (대기는 작업중 칸에 함께 보여 준다) */
const STEPPER: BarcodeStatus[] = ['received', 'working', 'done', 'shipReady', 'shipped']

/**
 * 입고 → 작업중 → 작업완료 → 출하대기 → 출하완료 진행 표시. 각 단계로 바뀐 시각과 찍은 사람을 함께 보여 준다.
 * 대기(롤 사이에 쉬는 상태)는 작업중과 번갈아 오가므로 칸을 따로 두지 않고, 작업중 칸을 주황 '대기'로 바꿔 보여 준다.
 */
function StatusStepper({ status, log }: { status: BarcodeStatus; log: TraceResult['statusLog'] }) {
  const paused = status === 'paused'
  const current = STEPPER.indexOf(paused ? 'working' : status)
  // 같은 상태로 여러 번 바뀐 경우 가장 최근 기록을 쓴다. 작업중 칸은 작업중·대기 중 더 최근 기록.
  const latest = (target: BarcodeStatus) => [...log].reverse().find((entry) => entry.status === target || (target === 'working' && entry.status === 'paused'))
  return (
    <ol className="grid grid-cols-5 gap-1.5" aria-label="진행 상태">
      {STEPPER.map((key, index) => {
        const reached = index <= current
        const entry = latest(key)
        const time = entry && !Number.isNaN(Date.parse(entry.at)) ? STATUS_TIME.format(new Date(entry.at)) : ''
        const pausedHere = paused && key === 'working'
        return (
          <li key={key} className="min-w-0">
            <span className={cn('block h-1.5 rounded-full', pausedHere ? 'bg-orange-300' : reached ? 'bg-white' : 'bg-white/25')} />
            <span className={cn('mt-1.5 block truncate text-[13px] font-bold', pausedHere ? 'text-orange-200' : index === current ? 'text-white' : reached ? 'text-blue-100' : 'text-blue-200/60')}>
              {pausedHere ? BARCODE_STATUS_LABEL.paused : BARCODE_STATUS_LABEL[key]}
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
export function TraceResultView({ data, onNavigate, onRescan, onRefresh }: { data: TraceResult; onNavigate: () => void; onRescan?: () => void; onRefresh?: () => void }) {
  const docs = useMemo(() => buildDocs(data), [data])
  const [activeKey, setActiveKey] = useState<string | null>(null)
  // 한 번 연 서류는 계속 띄워 두어, 서류 사이를 오갈 때 다시 불러오지 않는다.
  const [openedKeys, setOpenedKeys] = useState<string[]>([])
  const [zoomIndex, setZoomIndex] = useState(ZOOM_FIT)
  const active = docs.find((doc) => doc.key === activeKey) ?? null
  const zoom = ZOOMS[zoomIndex]
  const stepZoom = (step: 1 | -1) => setZoomIndex((value) => Math.min(ZOOMS.length - 1, Math.max(0, value + step)))

  function openDoc(key: string) {
    setActiveKey(key)
    setZoomIndex(ZOOM_FIT)
    setOpenedKeys((current) => (current.includes(key) ? current : [...current, key]))
  }

  const [docTab, setDocTab] = useState('incoming-')
  const docTabs = [
    { prefix: 'incoming-', label: '수입검사 성적서', icon: ClipboardCheck },
    { prefix: 'card-', label: '이력카드', icon: Barcode },
    { prefix: 'report-', label: '출하성적서', icon: FileCheck },
    ...(data.documents.length > 0 ? [{ prefix: 'file-', label: '파일', icon: FileText }] : []),
  ]
  const workPeriod = data.workPeriod ? data.workPeriod.split(' ~ ').map(dot).join(' ~ ') : ''
  // 이력카드가 있으면 카드 수량(도금 후 포함)을, 아직 없으면 입고 수량을 보여 준다.
  const quantity = data.quantity
    ? [data.quantity, data.platedQuantity && `도금 후 ${data.platedQuantity}`].filter(Boolean).join(' / ')
    : data.inboundQuantity
  const lotText = lotRangeText(data.lots)
  const steps = useMemo(() => groupSteps(data.steps), [data.steps])

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
              <span className="w-12 text-center text-xs font-semibold tabular-nums text-muted-foreground">{Math.round(zoom * 100)}%</span>
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

        {/* 왼쪽: 서류 목록(종류별로 묶음), 오른쪽: 미리보기 */}
        <div className="flex h-[calc(92dvh-8.5rem)] min-h-[320px] gap-3">
          <nav aria-label="관련 서류" className="w-56 shrink-0 space-y-3 overflow-y-auto pr-1">
            {docTabs.map((group) => {
              const items = docs.filter((doc) => doc.key.startsWith(group.prefix))
              if (items.length === 0) return null
              return (
                <div key={group.prefix}>
                  <p className="mb-1 px-1 text-[11px] font-bold text-muted-foreground">{group.label} <span className="tabular-nums">{items.length}</span></p>
                  <div className="space-y-1">
                    {items.map((doc) => {
                      const Icon = doc.icon
                      const selected = doc.key === activeKey
                      return (
                        <button
                          key={doc.key}
                          type="button"
                          aria-current={selected}
                          onClick={() => openDoc(doc.key)}
                          className={cn(
                            'flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-sm font-semibold transition',
                            selected
                              ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
                              : 'bg-card text-slate-600 hover:border-blue-300 hover:bg-blue-50 dark:text-slate-300 dark:hover:bg-blue-950/30',
                          )}
                        >
                          <Icon className="h-4 w-4 shrink-0" />
                          <span className="min-w-0 truncate">{doc.title}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </nav>
          <div className="relative min-w-0 flex-1 overflow-hidden rounded-xl border bg-slate-200 dark:bg-slate-900">
            {docs.filter((doc) => openedKeys.includes(doc.key)).map((doc) => (
              doc.kind === 'sheet'
                ? <SheetFrame key={doc.key} doc={doc} zoom={zoom} active={doc.key === activeKey} onZoom={stepZoom} />
                : <FileFrame key={doc.key} doc={doc} zoom={zoom} active={doc.key === activeKey} onZoom={stepZoom} />
            ))}
          </div>
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

        {/* 현장 작업: 이력카드(롤)마다 작업 시작·완료, 입고 무게 게이지, 다 끝나면 출하대기 */}
        <WorkPanel barcode={data.barcode} status={data.status} inboundQuantity={data.inboundQuantity} onChanged={() => onRefresh?.()} />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <section className="min-w-0 rounded-2xl border bg-card p-4">
            <h3 className="text-base font-extrabold text-slate-900 dark:text-white">작업 이력</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">작업일보는 LOT 번호가 없어서 업체·품명이 같고 입고 이후인 기록을 보여 줍니다.</p>
            {steps.length === 0 ? (
              <p className="mt-3 rounded-xl border border-dashed px-3 py-3 text-sm text-muted-foreground">기록된 일자가 없습니다.</p>
            ) : (
              <ol className="mt-4">
                {steps.map((step, index) => {
                  const tone = SOURCE_TONE[step.source] ?? DEFAULT_SOURCE_TONE
                  const last = index === steps.length - 1
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
                            {step.lot && <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">LOT {step.lot}{step.count > 1 ? ` (${step.count}건)` : ''}</span>}
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
            {/* 서류 종류별 탭: 수입검사 성적서 · 이력카드 · 출하성적서 (· 그 밖의 파일이 있으면 파일) */}
            <div className="mt-3 flex gap-1 overflow-x-auto rounded-xl bg-muted/50 p-1" role="tablist" aria-label="서류 종류">
              {docTabs.map((tab) => {
                const count = docs.filter((doc) => doc.key.startsWith(tab.prefix)).length
                const selected = docTab === tab.prefix
                return (
                  <button
                    key={tab.prefix}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => setDocTab(tab.prefix)}
                    className={cn(
                      'flex shrink-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors',
                      selected ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {tab.label}
                    <span className={cn('rounded-full px-1.5 text-[11px] tabular-nums', selected ? 'bg-slate-100 text-slate-600 dark:bg-slate-600 dark:text-slate-100' : 'bg-white/70 text-slate-400 dark:bg-white/5')}>{count}</span>
                  </button>
                )
              })}
            </div>
            <div className="mt-2 space-y-2">
              {(() => {
                const tab = docTabs.find((item) => item.prefix === docTab) ?? docTabs[0]
                const shown = docs.filter((doc) => doc.key.startsWith(tab.prefix))
                return shown.length === 0
                  ? <MissingDoc icon={tab.icon} title={tab.label} />
                  : shown.map((doc) => <DocButton key={doc.key} doc={doc} onOpen={() => openDoc(doc.key)} />)
              })()}
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
