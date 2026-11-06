import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/** 본문 페이지 여백·너비 (고객심사현황 기준) */
export const PAGE_MAX_WIDTH = 'max-w-[1500px]'
export const PAGE_PADDING = 'p-4 sm:p-6'
export const PAGE_SHELL = cn('mx-auto flex w-full flex-col gap-5', PAGE_MAX_WIDTH, PAGE_PADDING)
export const PAGE_SHELL_RELATIVE = cn('relative mx-auto flex w-full flex-col gap-5', PAGE_MAX_WIDTH, PAGE_PADDING)
export const PAGE_INSET = cn('mx-auto w-full', PAGE_MAX_WIDTH, PAGE_PADDING)

export type PageTone = 'blue' | 'indigo' | 'green' | 'cyan' | 'amber' | 'rose' | 'violet' | 'teal' | 'slate' | 'steel'

const BAND: Record<PageTone, string> = {
  blue: 'bg-[linear-gradient(135deg,oklch(0.58_0.16_230),oklch(0.44_0.14_236))]',
  indigo: 'bg-[linear-gradient(135deg,oklch(0.52_0.18_275),oklch(0.40_0.16_282))]',
  green: 'bg-[linear-gradient(135deg,oklch(0.60_0.14_155),oklch(0.46_0.12_162))]',
  cyan: 'bg-[linear-gradient(135deg,oklch(0.62_0.12_210),oklch(0.46_0.11_216))]',
  amber: 'bg-[linear-gradient(135deg,oklch(0.74_0.16_68),oklch(0.60_0.16_48))]',
  rose: 'bg-[linear-gradient(135deg,oklch(0.64_0.20_18),oklch(0.50_0.18_12))]',
  violet: 'bg-[linear-gradient(135deg,oklch(0.56_0.18_300),oklch(0.44_0.17_308))]',
  teal: 'bg-[linear-gradient(135deg,oklch(0.58_0.11_185),oklch(0.42_0.09_192))]',
  slate: 'bg-[linear-gradient(135deg,oklch(0.48_0.03_250),oklch(0.34_0.03_255))]',
  steel: 'bg-[linear-gradient(135deg,oklch(0.46_0.06_250),oklch(0.32_0.05_262))]',
}

/** 머리글 띠 위에 올리는 보조 버튼 */
export const BAND_BUTTON =
  'border border-white/30 bg-white/15 text-white shadow-none hover:bg-white/25 hover:text-white dark:border-white/30 dark:bg-white/15 dark:hover:bg-white/25 disabled:opacity-60'
/** 머리글 띠 위에 올리는 주 버튼 */
export const BAND_BUTTON_PRIMARY =
  'border border-white bg-white text-[oklch(0.25_0.04_262)] shadow-sm hover:bg-white/90 hover:text-[oklch(0.25_0.04_262)] dark:bg-white dark:hover:bg-white/90 disabled:opacity-60'

export const GROUP_TONE: Record<string, PageTone> = {
  대시보드: 'blue',
  고객관리: 'indigo',
  품질관리: 'green',
  'KPI 관리': 'cyan',
  개발관리: 'green',
  공정관리: 'amber',
  '재고 관리': 'rose',
  설비관리: 'violet',
  '일일 점검': 'amber',
  문서관리: 'teal',
  '조직/사용자': 'slate',
  시스템관리: 'steel',
}

interface PageHeaderProps {
  tone: PageTone
  icon: LucideIcon
  eyebrow: string
  title: React.ReactNode
  description?: React.ReactNode
  stat?: { label: string; value: React.ReactNode; unit?: string; sub?: React.ReactNode }
  actions?: React.ReactNode
  leading?: React.ReactNode
  className?: string
}

export function PageHeader({ tone, icon: Icon, eyebrow, title, description, stat, actions, leading, className }: PageHeaderProps) {
  return (
    <section className={cn('relative overflow-hidden rounded-2xl px-6 py-5 text-white shadow-sm', BAND[tone], className)}>
      <span className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full bg-white/10" />
      <span className="pointer-events-none absolute right-28 -bottom-24 h-40 w-40 rounded-full bg-white/5" />
      <div className="relative flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          {leading}
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-xs font-semibold tracking-[0.18em] text-white/75">
              <Icon className="h-4 w-4" /> {eyebrow}
            </p>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight sm:text-[26px]">{title}</h1>
            {description && <p className="mt-1 text-sm text-white/80">{description}</p>}
          </div>
        </div>
        {(stat || actions) && (
          <div className="flex flex-wrap items-center gap-5">
            {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
            {stat && (
              <div className="text-right">
                <p className="text-sm font-semibold text-white/80">{stat.label}</p>
                <p className="text-[36px] font-extrabold leading-none tabular-nums">
                  {stat.value}
                  {stat.unit && <span className="ml-1 text-lg font-bold text-white/80">{stat.unit}</span>}
                </p>
                {stat.sub && <p className="mt-1 text-xs text-white/80">{stat.sub}</p>}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
