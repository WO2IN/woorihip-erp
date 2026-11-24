import { cn } from '@/lib/utils'

export function LedgerPager({
  page,
  pageCount,
  total,
  pageSize,
  onPage,
}: {
  page: number
  pageCount: number
  total: number
  pageSize: number
  onPage: (page: number) => void
}) {
  const from = total === 0 ? 0 : page * pageSize + 1
  const to = Math.min(total, (page + 1) * pageSize)
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2.5">
      <p className="text-xs text-slate-500 tabular-nums">{from}–{to} / {total}건</p>
      <nav className="flex flex-wrap items-center gap-1" aria-label="페이지">
        <button
          type="button"
          disabled={page <= 0}
          onClick={() => onPage(page - 1)}
          className="h-7 rounded-md px-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:pointer-events-none disabled:opacity-40 dark:text-slate-300 dark:hover:bg-muted"
        >
          이전
        </button>
        {Array.from({ length: pageCount }, (_, index) => (
          <button
            key={index}
            type="button"
            aria-current={index === page ? 'page' : undefined}
            onClick={() => onPage(index)}
            className={cn(
              'h-7 min-w-7 rounded-md px-1.5 text-xs font-semibold tabular-nums',
              index === page
                ? 'bg-emerald-600 text-white'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-muted',
            )}
          >
            {index + 1}
          </button>
        ))}
        <button
          type="button"
          disabled={page >= pageCount - 1}
          onClick={() => onPage(page + 1)}
          className="h-7 rounded-md px-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:pointer-events-none disabled:opacity-40 dark:text-slate-300 dark:hover:bg-muted"
        >
          다음
        </button>
      </nav>
    </div>
  )
}
