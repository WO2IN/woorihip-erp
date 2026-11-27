'use client'

import { ClipboardCheckIcon, ThermometerIcon, WrenchIcon, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/** 본문 페이지 여백·너비 (고객심사현황 기준) */
export const PAGE_MAX_WIDTH = 'max-w-[1500px]'
export const PAGE_PADDING = 'p-4 sm:p-6'
export const PAGE_SHELL = cn('mx-auto flex w-full flex-col gap-5', PAGE_MAX_WIDTH, PAGE_PADDING)
export const PAGE_SHELL_RELATIVE = cn('relative mx-auto flex w-full flex-col gap-5', PAGE_MAX_WIDTH, PAGE_PADDING)
export const PAGE_INSET = cn('mx-auto w-full', PAGE_MAX_WIDTH, PAGE_PADDING)

export type PageTone = 'blue' | 'indigo' | 'green' | 'cyan' | 'amber' | 'rose' | 'violet' | 'teal' | 'orange' | 'red' | 'slate' | 'steel'

const NAMED_PAGE_ICONS = {
  wrench: WrenchIcon,
  clipboard: ClipboardCheckIcon,
  thermometer: ThermometerIcon,
} as const

export type PageIconName = keyof typeof NAMED_PAGE_ICONS

/** 머리글 오른쪽에 두는 보조 버튼 */
export const BAND_BUTTON =
  'border border-border bg-card text-foreground shadow-xs hover:bg-muted hover:text-foreground disabled:opacity-60'
/** 머리글 오른쪽에 두는 주 버튼 */
export const BAND_BUTTON_PRIMARY =
  'border border-transparent bg-slate-800 text-white shadow-xs hover:bg-slate-700 hover:text-white dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white dark:hover:text-slate-900 disabled:opacity-60'

export const GROUP_TONE: Record<string, PageTone> = {
  대시보드: 'blue',
  고객관리: 'indigo',
  품질관리: 'green',
  위험성평가: 'red',
  'KPI 관리': 'cyan',
  개발관리: 'green',
  공정관리: 'amber',
  '재고 관리': 'teal',
  설비관리: 'violet',
  '일일 점검': 'amber',
  전자결재: 'blue',
  문서관리: 'teal',
  '조직/사용자': 'orange',
  시스템관리: 'red',
}

interface PageHeaderProps {
  tone: PageTone
  icon: LucideIcon | PageIconName
  eyebrow: string
  title: React.ReactNode
  description?: React.ReactNode
  stat?: { label: string; value: React.ReactNode; unit?: string; sub?: React.ReactNode }
  actions?: React.ReactNode
  leading?: React.ReactNode
  className?: string
}

/** 페이지 머리글: 위치 표시(eyebrow)와 제목만 보여준다. description·stat은 호출부 호환용으로 받기만 하고 그리지 않는다. */
export function PageHeader({ icon, eyebrow, title, actions, leading, className }: PageHeaderProps) {
  const Icon = typeof icon === 'string' ? NAMED_PAGE_ICONS[icon] : icon

  return (
    <header
      className={cn(
        'flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-border pb-4',
        className,
      )}
    >
      {/* 굵은 강조선은 아이콘·글자 너비만큼만 구분선 위에 얹는다 */}
      <div className="relative flex min-w-0 items-center gap-3.5 self-stretch after:absolute after:inset-x-0 after:-bottom-[17px] after:h-[3px] after:rounded-full after:bg-slate-600 dark:after:bg-slate-300">
        {leading}
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-card text-slate-600 shadow-sm ring-1 ring-border dark:text-slate-300">
          <Icon className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground">{eyebrow}</p>
          <h1 className="mt-0.5 text-2xl font-extrabold tracking-tight text-foreground sm:text-[26px]">{title}</h1>
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}
