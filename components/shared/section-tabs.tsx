import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface SectionTabItem<K extends string = string> {
  key: K
  label: string
  /** 마우스를 올리면 보이는 설명 */
  hint?: string
  icon?: LucideIcon
  count?: number
}

interface SectionTabsProps<K extends string> {
  items: readonly SectionTabItem<K>[]
  value: K
  onChange: (key: K) => void
  /** 스크린리더용 이름 */
  label: string
  /** 탭 줄 오른쪽에 두는 버튼 등 */
  actions?: React.ReactNode
  className?: string
}

/** 페이지 머리글 아래에 두는 탭 묶음. 재고 관리처럼 흰 카드 안에 회색 줄과 알약 버튼으로 보여준다. */
export function SectionTabs<K extends string>({ items, value, onChange, label, actions, className }: SectionTabsProps<K>) {
  return (
    <section className={cn('rounded-2xl border bg-card p-3 shadow-sm', className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <nav
          className="flex min-w-0 flex-1 gap-1 overflow-x-auto rounded-xl bg-muted/40 p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          aria-label={label}
        >
          {items.map((item) => {
            const selected = item.key === value
            const Icon = item.icon
            return (
              <button
                key={item.key}
                type="button"
                title={item.hint}
                aria-current={selected ? 'page' : undefined}
                onClick={() => onChange(item.key)}
                className={cn(
                  'inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors',
                  selected
                    ? 'bg-slate-800 text-white shadow-sm dark:bg-slate-100 dark:text-slate-900'
                    : 'text-muted-foreground hover:bg-card hover:text-foreground',
                )}
              >
                {Icon && <Icon className="size-4" />}
                {item.label}
                {item.count != null && (
                  <span className={cn('tabular-nums text-xs', selected ? 'opacity-80' : 'text-muted-foreground')}>{item.count}</span>
                )}
              </button>
            )
          })}
        </nav>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </section>
  )
}
