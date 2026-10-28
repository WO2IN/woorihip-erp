import Link from 'next/link'
import { ArrowLeft, CalendarClock, Construction } from 'lucide-react'
import { GROUP_TONE, PageHeader } from '@/components/shared/page-header'

interface ComingSoonProps {
  group: string
  title: string
  description: string
  plans: string[]
}

export function ComingSoon({ group, title, description, plans }: ComingSoonProps) {
  return (
    <div className="mx-auto max-w-3xl p-6">
      <PageHeader
        tone={GROUP_TONE[group] ?? 'blue'}
        icon={Construction}
        eyebrow={group}
        title={title}
        description={description}
      />

      <section className="mt-6 rounded-2xl border border-dashed bg-card p-8 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400">
          <Construction className="h-7 w-7" />
        </span>
        <span className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
          <CalendarClock className="h-3.5 w-3.5" /> 향후 추가 예정
        </span>
        <p className="mt-3 text-base font-semibold">{description}</p>
        <p className="mt-1 text-sm text-muted-foreground">현재 준비 중인 메뉴. 기능이 완성되면 이 화면에서 바로 사용할 수 있다.</p>

        <ul className="mx-auto mt-6 max-w-md space-y-2 text-left">
          {plans.map((plan) => (
            <li key={plan} className="flex items-start gap-2 rounded-lg bg-muted/60 px-4 py-2.5 text-sm">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[oklch(0.52_0.19_258)]" />
              {plan}
            </li>
          ))}
        </ul>

        <Link href="/" className="mt-6 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> 대시보드로
        </Link>
      </section>
    </div>
  )
}
