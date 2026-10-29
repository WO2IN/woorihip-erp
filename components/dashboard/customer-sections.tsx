'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronDown } from 'lucide-react'
import { asKind, openOf, SAMPLE_AUDIT_ROWS, statusOf, type AuditRow } from '@/lib/customer-audit'
import type { NavItem } from '@/lib/nav'
import { cn } from '@/lib/utils'

const HINT: Record<string, string> = {
  '/customer/audit-status': 'QSA · QPA 지적사항 현황',
  '/customer/qsa-qpa': '고객사 심사 일정 · 지적 사항 · 증빙',
}

const STATUS_TONE: Record<string, string> = {
  종결: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300',
  진행: 'bg-amber-50 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300',
  지연: 'bg-rose-50 text-rose-700 dark:bg-rose-400/15 dark:text-rose-300',
  예정: 'bg-[oklch(0.78_0.14_95/0.35)] text-[oklch(0.42_0.12_75)] dark:bg-[oklch(0.74_0.14_90/0.2)] dark:text-[oklch(0.86_0.12_90)]',
  미진행: 'bg-muted text-muted-foreground',
}

export function CustomerSections({
  docTop,
  menus,
}: {
  docTop: { company: string; count: number }[]
  menus: NavItem[]
}) {
  const [open, setOpen] = useState('docs')
  const toggle = (id: string) => setOpen((current) => (current === id ? '' : id))

  return (
    <div className="overflow-hidden rounded-xl border">
      <Section
        label="거래처별 문서"
        hint="등록 누계"
        expanded={open === 'docs'}
        onToggle={() => toggle('docs')}
      >
        <DocBars docTop={docTop} />
      </Section>
      {menus.map((item) => (
        <Section
          key={item.href}
          label={item.label}
          hint={HINT[item.href] ?? ''}
          soon={item.soon}
          testing={item.testing}
          expanded={open === item.href}
          onToggle={() => toggle(item.href)}
        >
          {item.href === '/customer/audit-status' ? <AuditPreview /> : <SoonPreview href={item.href} />}
        </Section>
      ))}
    </div>
  )
}

function Section({
  label,
  hint,
  soon,
  testing,
  expanded,
  onToggle,
  children,
}: {
  label: string
  hint: string
  soon?: boolean
  testing?: boolean
  expanded: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <section className="border-t first:border-t-0">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-sm hover:bg-muted/50"
      >
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none', !expanded && '-rotate-90')} />
        <span className="shrink-0 font-semibold">{label}</span>
        {soon && <span className="rounded bg-amber-100 px-1.5 py-px text-[10px] font-semibold text-amber-700 dark:bg-amber-400/15 dark:text-amber-300">예정</span>}
        {testing && <span className="rounded bg-sky-100 px-1.5 py-px text-[10px] font-semibold text-sky-700 dark:bg-sky-400/15 dark:text-sky-300">테스트</span>}
        <span className={cn('min-w-0 flex-1 truncate text-xs text-muted-foreground transition-opacity duration-500 motion-reduce:transition-none', expanded ? 'opacity-0' : 'opacity-100')}>{hint}</span>
      </button>
      <Collapse open={expanded}>
        <div className={cn('border-t bg-muted/20 px-3.5 py-3 transition-opacity duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none', expanded ? 'opacity-100 delay-75' : 'opacity-0')}>
          {children}
        </div>
      </Collapse>
    </section>
  )
}

function Collapse({ open, children }: { open: boolean; children: React.ReactNode }) {
  return (
    <div
      className="grid transition-[grid-template-rows] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
      style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
      inert={open ? undefined : true}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  )
}

function DocBars({ docTop }: { docTop: { company: string; count: number }[] }) {
  const max = Math.max(1, ...docTop.map((row) => row.count))
  if (docTop.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">등록된 거래처 없음</p>
  return (
    <ul className="flex flex-col gap-2.5">
      {docTop.map((row) => (
        <li key={row.company} className="flex items-center gap-3 text-sm">
          <span className="w-24 shrink-0 truncate font-medium" title={row.company}>{row.company}</span>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-[oklch(0.52_0.19_258)]" style={{ width: `${(row.count / max) * 100}%` }} />
          </div>
          <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{row.count}건</span>
        </li>
      ))}
    </ul>
  )
}

function AuditPreview() {
  const [rows, setRows] = useState<AuditRow[]>([])
  const [sample, setSample] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/customer/audits', { cache: 'no-store' })
      .then((response) => response.json())
      .then((result) => {
        if (Array.isArray(result.data)) {
          setRows(result.data.map((row: AuditRow) => ({ ...row, kind: asKind(row.kind), dept: row.dept ?? '', doneDate: row.doneDate ?? '' })))
        } else {
          setRows(SAMPLE_AUDIT_ROWS)
          setSample(true)
        }
      })
      .catch(() => setRows([]))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <p className="py-4 text-center text-sm text-muted-foreground">불러오는 중…</p>
  if (rows.length === 0) return <p className="py-4 text-center text-sm text-muted-foreground">등록된 심사가 없습니다.</p>

  const counts = rows.reduce<Record<string, number>>((sum, row) => {
    const status = statusOf(row)
    sum[status] = (sum[status] ?? 0) + 1
    return sum
  }, {})

  return (
    <div className="grid gap-2.5">
      {sample && <p className="text-xs text-muted-foreground">지금은 화면 예시입니다. 심사를 등록하면 실제 데이터로 바뀝니다.</p>}
      <div className="flex flex-wrap gap-1.5">
        {Object.entries(counts).map(([status, count]) => (
          <span key={status} className={cn('rounded-full px-2 py-0.5 text-[11px] font-bold', STATUS_TONE[status])}>
            {status} {count}
          </span>
        ))}
      </div>
      <ul className="divide-y overflow-hidden rounded-lg border bg-card">
        {rows.map((row) => {
          const status = statusOf(row)
          const open = openOf(row)
          return (
            <li key={row.id} className="flex items-center gap-2 px-2.5 py-1.5 text-sm">
              <span className="w-9 shrink-0 text-xs font-extrabold">{row.kind}</span>
              <span className="w-16 shrink-0 truncate font-medium" title={row.company}>{row.company}</span>
              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{row.scope || '—'}</span>
              <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{row.count ? `미결 ${open}` : ''}</span>
              <span className={cn('shrink-0 rounded-full px-1.5 py-px text-[10px] font-bold', STATUS_TONE[status])}>{status}</span>
            </li>
          )
        })}
      </ul>
      <Link href="/customer/audit-status" className="text-xs font-semibold text-[oklch(0.52_0.19_258)] hover:underline">
        고객심사현황 전체 보기
      </Link>
    </div>
  )
}

function SoonPreview({ href }: { href: string }) {
  return (
    <div className="grid gap-2 text-sm">
      <p className="text-muted-foreground">고객사 품질시스템 심사(QSA)와 품질 공정 감사(QPA)를 한 곳에서 관리할 예정입니다.</p>
      <Link href={href} className="text-xs font-semibold text-[oklch(0.52_0.19_258)] hover:underline">
        페이지 보기
      </Link>
    </div>
  )
}
