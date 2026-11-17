'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

function useApprovalCount() {
  const [count, setCount] = useState(0)
  const pending = useRef(false)

  const load = useCallback(async () => {
    if (pending.current) return
    pending.current = true
    try {
      const response = await fetch('/api/approvals?summary=1', { cache: 'no-store' })
      if (!response.ok) return
      const data = await response.json().catch(() => null)
      setCount(Number(data?.pendingCount) || 0)
    } catch {
      // 서버가 다시 뜨는 동안 연결이 끊기면 다음 주기에 다시 확인한다.
    } finally {
      pending.current = false
    }
  }, [])

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => void load(), 30_000)
    window.addEventListener('focus', load)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', load)
    }
  }, [load])

  return count
}

export function ApprovalHeaderActions() {
  const pathname = usePathname()
  const count = useApprovalCount()
  const onApprovals = pathname === '/approvals' || pathname.startsWith('/approvals/')
  const label = count > 9 ? '9+' : String(count)

  return (
    <Link
      href="/approvals"
      aria-current={onApprovals ? 'page' : undefined}
      aria-label={count > 0 ? `결재 현황, 확인하지 않은 항목 ${count}건` : '결재 현황'}
      className={cn(
        'inline-flex h-8 items-center gap-2 rounded-lg border py-1 pl-1 pr-3 text-sm transition-colors',
        onApprovals
          ? 'border-sky-300 bg-sky-50 text-sky-950 dark:border-sky-400/40 dark:bg-sky-400/15 dark:text-sky-50'
          : 'border-border bg-card text-foreground hover:bg-muted',
      )}
    >
      <span
        className={cn(
          'flex h-6 min-w-6 items-center justify-center rounded-md px-1.5 text-xs font-bold tabular-nums',
          count > 0
            ? 'bg-rose-600 text-white'
            : 'bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-300',
        )}
      >
        {label}
      </span>
      <span className="font-semibold leading-none">결재 현황</span>
    </Link>
  )
}
