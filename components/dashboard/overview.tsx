import Link from 'next/link'
import {
  AlertTriangle, ArrowRight, Boxes, CalendarDays, CheckCircle2, ChevronRight, ClipboardCheck,
  ClipboardList, PackageCheck, ScrollText, ShieldCheck,
} from 'lucide-react'
import { describeAuditDetail } from '@/lib/audit-detail'
import { navSection, type NavItem } from '@/lib/nav'
import { cn } from '@/lib/utils'
import type { DashboardStats, StatusCounts } from '@/lib/dashboard-stats'
import { CustomerSections } from '@/components/dashboard/customer-sections'
import { TodayCheckProgress } from '@/components/dashboard/today-check-progress'
import { ShipmentViews } from '@/components/dashboard/shipment-views'

const TONE = {
  blue: { text: 'text-[oklch(0.52_0.19_258)] dark:text-[oklch(0.72_0.16_258)]', bg: 'bg-[oklch(0.52_0.19_258)]', soft: 'bg-[oklch(0.52_0.19_258/0.10)] dark:bg-[oklch(0.62_0.18_258/0.16)]', hex: 'oklch(0.52 0.19 258)' },
  green: { text: 'text-[oklch(0.45_0.15_162)] dark:text-[oklch(0.70_0.15_162)]', bg: 'bg-[oklch(0.58_0.15_162)]', soft: 'bg-[oklch(0.58_0.15_162/0.12)] dark:bg-[oklch(0.62_0.15_162/0.16)]', hex: 'oklch(0.58 0.15 162)' },
  amber: { text: 'text-[oklch(0.55_0.16_55)] dark:text-[oklch(0.78_0.15_60)]', bg: 'bg-[oklch(0.70_0.16_58)]', soft: 'bg-[oklch(0.70_0.16_58/0.14)] dark:bg-[oklch(0.74_0.16_58/0.16)]', hex: 'oklch(0.70 0.16 58)' },
  violet: { text: 'text-[oklch(0.48_0.18_288)] dark:text-[oklch(0.74_0.15_288)]', bg: 'bg-[oklch(0.55_0.18_288)]', soft: 'bg-[oklch(0.55_0.18_288/0.12)] dark:bg-[oklch(0.62_0.18_288/0.16)]', hex: 'oklch(0.55 0.18 288)' },
  rose: { text: 'text-[oklch(0.55_0.21_25)] dark:text-[oklch(0.72_0.17_25)]', bg: 'bg-[oklch(0.60_0.21_25)]', soft: 'bg-[oklch(0.60_0.21_25/0.10)] dark:bg-[oklch(0.62_0.21_25/0.18)]', hex: 'oklch(0.60 0.21 25)' },
} as const
type Tone = keyof typeof TONE

const BAND: Record<Tone, string> = {
  blue: 'bg-[linear-gradient(135deg,oklch(0.52_0.19_258),oklch(0.40_0.16_265))]',
  green: 'bg-[linear-gradient(135deg,oklch(0.60_0.14_165),oklch(0.46_0.12_172))]',
  amber: 'bg-[linear-gradient(135deg,oklch(0.74_0.16_62),oklch(0.62_0.17_45))]',
  violet: 'bg-[linear-gradient(135deg,oklch(0.56_0.18_288),oklch(0.43_0.17_295))]',
  rose: 'bg-[linear-gradient(135deg,oklch(0.64_0.21_25),oklch(0.52_0.20_18))]',
}

const num = (v: number) => v.toLocaleString('ko-KR')
const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토']

export function DashboardHeader({ date }: { date: string }) {
  const d = new Date(`${date}T00:00:00`)
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-xs font-semibold tracking-wide text-primary">WOORI-HIP · 통합 운영 현황</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-[28px]">
          통합 운영 대시보드
        </h1>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex h-9 items-center gap-1.5 rounded-lg border bg-card px-3 text-sm font-medium">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          {date.replace(/-/g, '.')} ({WEEKDAY[d.getDay()]}) 기준
        </span>
      </div>
    </div>
  )
}

export function TodayBar({ data }: { data: DashboardStats }) {
  const missing = data.today.missing
  const byKind = (k: string) => missing.filter((m) => m.kind === k).length
  const items: { href: string; tone: Tone; icon: typeof ClipboardCheck; label: string; value: string; hint: string; ok?: boolean; testing?: boolean }[] = [
    missing.length
      ? { href: '/checksheets', tone: 'amber', icon: ClipboardList, label: '오늘 미점검', value: `${missing.length}건`, hint: `설비 ${byKind('설비')} · 5S ${byKind('5S')} · 온습도 ${byKind('온습도')} · 공정 ${byKind('공정')}` }
      : { href: '/checksheets', tone: 'green', icon: CheckCircle2, label: '오늘 점검', value: data.today.weekend ? '휴무일' : '모두 완료', hint: '설비 · 5S · 온습도', ok: true },
    data.quality.openNc
      ? { href: '/quality/nonconformity', tone: 'rose', icon: AlertTriangle, label: '미결 부적합', value: `${data.quality.openNc}건`, hint: `고객 ${data.quality.customerNc.not_started + data.quality.customerNc.in_progress} · 공정 ${data.quality.processNc.not_started + data.quality.processNc.in_progress}` }
      : { href: '/quality/nonconformity', tone: 'green', icon: ShieldCheck, label: '미결 부적합', value: '없음', hint: '고객 · 공정 부적합', ok: true },
    data.process.shortage
      ? { href: '/shipment', tone: 'amber', icon: Boxes, label: '재고 부족', value: `${num(data.process.shortage)}종`, hint: '입고가 빠져 실제 부족이 아님', testing: true }
      : { href: '/shipment', tone: 'green', icon: Boxes, label: '재고 부족', value: '없음', hint: '전 품목 정상', ok: true },
    { href: '/shipment', tone: 'blue', icon: PackageCheck, label: '오늘 입고 / 출고', value: `${data.process.todayIn} / ${data.process.todayOut}건`, hint: `오늘 등록 문서 ${data.todayUploads}건`, testing: true },
  ]
  return (
    <section aria-label="오늘 확인할 일">
      <h2 className="mb-2.5 text-sm font-semibold text-muted-foreground">오늘 확인할 일</h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {items.map(({ href, tone, icon: Icon, label, value, hint, ok, testing }) => {
          const quiet = ok || testing
          return (
          <Link key={label} href={href} className={cn('group flex items-center gap-4 rounded-2xl p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg', quiet ? 'border bg-card' : cn(BAND[tone], 'text-white'))}>
            <span className={cn('flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl', quiet ? TONE[tone].soft : 'bg-white/20')}>
              <Icon className={cn('h-7 w-7', quiet ? TONE[tone].text : 'text-white')} />
            </span>
            <span className="min-w-0 flex-1">
              <span className={cn('flex items-center gap-1.5 text-sm font-semibold', quiet ? 'text-muted-foreground' : 'text-white/85')}>
                {label}
                {testing && <span className="rounded bg-sky-100 px-1.5 py-px text-[10px] font-bold text-sky-700 dark:bg-sky-400/15 dark:text-sky-300">테스트</span>}
              </span>
              <span className={cn('block text-[32px] font-extrabold leading-tight tabular-nums tracking-tight', quiet && TONE[tone].text)}>{value}</span>
              <span className={cn('block truncate text-xs', quiet ? 'text-muted-foreground' : 'text-white/80')}>{hint}</span>
            </span>
            <ChevronRight className={cn('h-5 w-5 shrink-0 transition group-hover:translate-x-0.5', quiet ? 'text-muted-foreground' : 'text-white/80')} />
          </Link>
          )
        })}
      </div>
    </section>
  )
}

interface Hero { label: string; value: string; unit?: string; sub?: string }

function Panel({ no, tone, title, en, href, hero, badge, children }: { no: number; tone: Tone; title: string; en: string; href: string; hero: Hero; badge?: 'testing'; children: React.ReactNode }) {
  return (
    <section className="flex h-full flex-col overflow-hidden rounded-2xl border bg-card shadow-sm">
      <header className={cn('relative flex items-center justify-between gap-4 overflow-hidden px-6 py-5 text-white', BAND[tone])}>
        <span className="pointer-events-none absolute -right-10 -top-16 h-44 w-44 rounded-full bg-white/10" />
        <div className="relative">
          <p className="flex items-center gap-2 text-xs font-semibold tracking-[0.18em] text-white/75">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white/20 text-xs font-bold tracking-normal text-white">{no}</span>{en}
            {badge === 'testing' && <span className="rounded bg-white/20 px-1.5 py-px text-[10px] font-bold tracking-normal text-white">테스트</span>}
          </p>
          <h2 className="mt-1.5 text-2xl font-extrabold tracking-tight">{title}</h2>
          <Link href={href} className="mt-2 inline-flex items-center gap-0.5 rounded-full bg-white/15 px-2.5 py-1 text-xs font-semibold text-white hover:bg-white/25">
            상세보기 <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="relative text-right">
          <p className="text-sm font-semibold text-white/80">{hero.label}</p>
          <p className="text-[44px] font-extrabold leading-none tracking-tight tabular-nums">
            {hero.value}{hero.unit && <span className="ml-1 text-lg font-bold text-white/80">{hero.unit}</span>}
          </p>
          {hero.sub && <p className="mt-1.5 text-xs font-medium text-white/80">{hero.sub}</p>}
        </div>
      </header>
      <div className="flex flex-1 flex-col p-5">{children}</div>
    </section>
  )
}

function Mini({ label, value, unit, tone, warn }: { label: string; value: string | number; unit?: string; tone?: Tone; warn?: boolean }) {
  return (
    <div className={cn('rounded-xl px-3.5 py-3', warn ? TONE.rose.soft : 'bg-muted/60')}>
      <p className={cn('flex items-center gap-1 text-xs font-semibold', warn ? TONE.rose.text : 'text-muted-foreground')}>
        {warn && <AlertTriangle className="h-3 w-3" />}{label}
      </p>
      <p className={cn('text-2xl font-bold tabular-nums tracking-tight', warn ? TONE.rose.text : tone && TONE[tone].text)}>
        {typeof value === 'number' ? num(value) : value}
        {unit && <span className="ml-0.5 text-xs font-medium text-muted-foreground">{unit}</span>}
      </p>
    </div>
  )
}

const STATUS_META: { key: keyof StatusCounts; label: string; color: string }[] = [
  { key: 'done', label: '완료', color: 'bg-[oklch(0.55_0.19_258)]' },
  { key: 'in_progress', label: '진행중', color: 'bg-[oklch(0.80_0.16_85)]' },
  { key: 'not_started', label: '미진행', color: 'bg-[oklch(0.60_0.21_25)]' },
]

const MENU_HINT: Record<string, string> = {
  '/customer/audit-status': 'QSA · QPA 지적사항 현황',
  '/customer/qsa-qpa': '고객사 심사 일정 · 지적 사항 · 증빙',
  '/quality/nonconformity': '고객 · 공정 부적합 대책과 처리결과',
  '/quality/change-points': '양산 중 4M 변경 신고와 승인',
  '/quality/qualifications': '자격 · 교육 이력',
  '/quality/iatf': '심사 · 시정조치',
  '/equipment/gauges': '교정 주기와 이력',
  '/equipment/consumables': '소모품 재고와 교체 이력',
  '/shipment': '입고 · 출고 · 재고',
  '/checksheets': '오늘 점검 현황',
  '/checksheets/daily': '설비별 일상점검',
  '/checksheets/temp-humidity': '온 · 습도 기록',
  '/checksheets/5s': '3정 5S 구역 점검',
  '/process-check': '공정 라인 점검',
}

function MenuLinks({ items, hints }: { items: NavItem[]; hints?: Record<string, string> }) {
  return (
    <ul className="divide-y overflow-hidden rounded-xl border">
      {items.map((item) => (
        <li key={item.href}>
          <Link href={item.href} className="flex items-center gap-2 px-3.5 py-2.5 text-sm hover:bg-muted/50">
            <span className="shrink-0 font-semibold">{item.label}</span>
            {item.soon && <span className="rounded bg-amber-100 px-1.5 py-px text-[10px] font-semibold text-amber-700 dark:bg-amber-400/15 dark:text-amber-300">예정</span>}
            {item.testing && <span className="rounded bg-sky-100 px-1.5 py-px text-[10px] font-semibold text-sky-700 dark:bg-sky-400/15 dark:text-sky-300">테스트</span>}
            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{hints?.[item.href] ?? MENU_HINT[item.href] ?? ''}</span>
            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </Link>
        </li>
      ))}
    </ul>
  )
}

function StatusRow({ counts }: { counts: StatusCounts }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {STATUS_META.map((s) => (
        <div key={s.key} className="rounded-lg bg-muted/60 py-2 text-center">
          <p className="text-lg font-bold tabular-nums">{counts[s.key]}</p>
          <p className="flex items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground">
            <span className={cn('h-1.5 w-1.5 rounded-full', s.color)} />{s.label}
          </p>
        </div>
      ))}
    </div>
  )
}

export function QualityPanel({ data }: { data: DashboardStats }) {
  const q = data.quality
  const openCustomer = q.customerNc.not_started + q.customerNc.in_progress
  const openProcess = q.processNc.not_started + q.processNc.in_progress
  const customerTotal = q.customerNc.done + q.customerNc.in_progress + q.customerNc.not_started
  const processTotal = q.processNc.done + q.processNc.in_progress + q.processNc.not_started
  const menus = navSection('quality')?.children ?? []
  return (
    <Panel no={3} tone="green" title="품질관리" en="QUALITY" href="/quality/nonconformity"
      hero={q.openNc
        ? { label: '미결 부적합', value: String(q.openNc), unit: '건', sub: `고객 ${openCustomer} · 공정 ${openProcess}` }
        : { label: '미결 부적합', value: '없음', sub: '고객 · 공정 부적합' }}>
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <div>
          <p className="mb-2 flex items-center justify-between text-sm font-bold">
            고객 부적합
            <span className="text-xs font-medium text-muted-foreground">총 {customerTotal}건</span>
          </p>
          <StatusRow counts={q.customerNc} />
        </div>
        <div>
          <p className="mb-2 flex items-center justify-between text-sm font-bold">
            공정 부적합
            <span className="text-xs font-medium text-muted-foreground">총 {processTotal}건</span>
          </p>
          <StatusRow counts={q.processNc} />
        </div>
        <MenuLinks
          items={menus}
          hints={{ '/quality/nonconformity': `미결 ${q.openNc ? `${q.openNc}건` : '없음'} · 고객 ${openCustomer} · 공정 ${openProcess}` }}
        />
      </div>
    </Panel>
  )
}

function CheckRecordsBar({ data }: { data: DashboardStats }) {
  const q = data.quality
  const parts = [
    { label: '설비 일상점검', value: q.daily, tone: 'blue' as Tone },
    { label: '3정 5S', value: q.fiveS, tone: 'green' as Tone },
    { label: '온 · 습도', value: q.temp, tone: 'amber' as Tone },
    { label: '공정 점검', value: data.process.checkRecords, tone: 'violet' as Tone },
  ]
  const total = Math.max(1, parts.reduce((sum, part) => sum + part.value, 0))
  return (
    <div>
      <p className="flex items-baseline gap-2 text-xs font-semibold text-muted-foreground">
        점검 입력 기록 누계
        <span className="text-2xl font-bold tabular-nums text-foreground">{num(total)}</span>건
      </p>
      <div className="mt-2 flex h-3.5 overflow-hidden rounded-full bg-muted">
        {parts.map((p) => <div key={p.label} className={TONE[p.tone].bg} style={{ width: `${(p.value / total) * 100}%` }} />)}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs">
        {parts.map((p) => (
          <span key={p.label} className="flex items-center gap-1.5">
            <span className={cn('h-2 w-2 rounded-sm', TONE[p.tone].bg)} />{p.label}
            <b className="tabular-nums">{num(p.value)}</b>
            <span className="text-muted-foreground">{((p.value / total) * 100).toFixed(1)}%</span>
          </span>
        ))}
      </div>
    </div>
  )
}

export function ProcessPanel({ data }: { data: DashboardStats }) {
  const p = data.process
  const todayDone = data.today.progress.reduce((sum, item) => sum + item.done, 0)
  const todayDue = data.today.progress.reduce((sum, item) => sum + item.due, 0)
  return (
    <Panel no={4} tone="amber" title="공정관리" en="PROCESS" href="/checksheets"
      hero={todayDue
        ? { label: '오늘 점검 진행률', value: String(Math.round((todayDone / todayDue) * 100)), unit: '%', sub: `${todayDone} / ${todayDue}개소 완료` }
        : { label: '오늘 점검', value: '휴무', sub: '점검 대상 없음' }}>
      <div className="flex h-full flex-col gap-4">
        <TodayCheckProgress data={data} />
        <CheckRecordsBar data={data} />
        <div className="flex flex-1 flex-col rounded-xl border p-3.5">
          <p className="mb-2 flex items-center justify-between text-sm font-bold">
            공정 점검 라인
            <span className="text-xs font-medium text-muted-foreground">기록 {p.checkRecords}건{p.lastCheck ? ` · 최근 ${p.lastCheck.slice(5).replace('-', '/')}` : ''}</span>
          </p>
          {p.lines.length === 0 ? (
            <p className="py-3 text-sm text-muted-foreground">등록된 점검 라인 없음</p>
          ) : (
            <ul className="space-y-1.5">
              {p.lines.slice(0, 4).map((l) => (
                <li key={l.id}>
                  <Link href="/process-check" className="flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-sm hover:bg-muted">
                    <span className={cn('rounded px-1.5 py-0.5 text-[11px] font-bold', TONE.amber.soft, TONE.amber.text)}>{l.floor}층</span>
                    <span className="min-w-0 flex-1 truncate font-medium">{l.name}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">{l.records}건</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Panel>
  )
}

export function CustomerPanel({ data }: { data: DashboardStats }) {
  const c = data.customer
  const menus = navSection('customer')?.children ?? []
  return (
    <Panel no={2} tone="blue" title="고객관리" en="CUSTOMER" href="/customer/audit-status"
      hero={{ label: '거래처', value: num(c.companies), unit: '개사', sub: `품목 ${num(c.products)}종` }}>
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="grid grid-cols-2 gap-2">
          <Mini label="거래처" value={c.companies} unit="개사" tone="blue" />
          <Mini label="품목" value={c.products} unit="종" />
        </div>
        <CustomerSections docTop={c.docTop} menus={menus} />
      </div>
    </Panel>
  )
}

export function ShipmentPanel({ data }: { data: DashboardStats }) {
  const p = data.process
  return (
    <Panel no={1} tone="rose" title="입/출고 관리" en="SHIPMENT" href="/shipment" badge="testing"
      hero={{ label: '오늘 입고 / 출고', value: `${p.todayIn} / ${p.todayOut}`, unit: '건', sub: `재고 ${num(p.stockItems)}종 · 부족 ${num(p.shortage)}종` }}>
      <ShipmentViews data={data} />
    </Panel>
  )
}
function Card({ icon: Icon, tone, title, sub, href, linkLabel, children }: { icon: typeof PackageCheck; tone: Tone; title: string; sub?: string; href: string; linkLabel: string; children: React.ReactNode }) {
  return (
    <section className="flex h-full flex-col rounded-2xl border bg-card p-5 shadow-sm">
      <header className="mb-4 flex items-center gap-3">
        <span className={cn('flex h-10 w-10 items-center justify-center rounded-xl', TONE[tone].soft)}>
          <Icon className={cn('h-5 w-5', TONE[tone].text)} />
        </span>
        <div>
          <h2 className="text-lg font-bold">{title}</h2>
          {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        </div>
        <Link href={href} className="ml-auto inline-flex items-center gap-0.5 text-xs font-medium text-muted-foreground hover:text-foreground">
          {linkLabel} <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </header>
      <div className="flex flex-1 flex-col">{children}</div>
    </section>
  )
}

const ACTION_LABEL: Record<string, { label: string; tone: Tone }> = {
  CREATE: { label: '등록', tone: 'green' },
  UPLOAD: { label: '문서 등록', tone: 'blue' },
  UPDATE: { label: '수정', tone: 'amber' },
  DELETE: { label: '삭제', tone: 'rose' },
}

function timeAgo(iso: string, now: Date) {
  const diff = Math.max(0, now.getTime() - new Date(iso).getTime()) / 60000
  if (diff < 1) return '방금'
  if (diff < 60) return `${Math.floor(diff)}분 전`
  if (diff < 60 * 24) return `${Math.floor(diff / 60)}시간 전`
  if (diff < 60 * 24 * 7) return `${Math.floor(diff / 1440)}일 전`
  return iso.slice(5, 10).replace('-', '/')
}

export function RecentActivityCard({ data }: { data: DashboardStats }) {
  const now = new Date()
  return (
    <Card icon={ScrollText} tone="rose" title="최근 작업 이력" sub={`누적 ${num(data.audit.count)}건 · 등록 · 수정 · 삭제 자동 기록`} href="/system-logs" linkLabel="시스템 로그">
      {data.audit.recent.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">기록된 작업 없음</p>
      ) : (
        <ul className="space-y-1">
          {data.audit.recent.map((log) => {
            const meta = ACTION_LABEL[log.action.trim().toUpperCase()] ?? { label: log.action, tone: 'violet' as Tone }
            const detail = describeAuditDetail(log)
            return (
              <li key={log.id} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted/50">
                <span className={cn('w-[68px] shrink-0 rounded-md py-1 text-center text-[11.5px] font-bold', TONE[meta.tone].soft, TONE[meta.tone].text)}>{meta.label}</span>
                <span className="min-w-0 flex-1 truncate text-sm">{detail.title}</span>
                <span className="w-16 shrink-0 truncate text-right text-xs font-medium">{log.userName}</span>
                <span className="w-14 shrink-0 text-right text-xs text-muted-foreground">{timeAgo(log.createdAt, now)}</span>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
