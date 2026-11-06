'use client'

import type { ProcessNcActionKey } from '@/lib/non-conformity'
import { PROCESS_NC_ACTIONS } from '@/lib/non-conformity'
import { cn } from '@/lib/utils'
import { Check } from 'lucide-react'

/** 등록·수정 다이얼로그 — 2×2 체크 목록 */
export function ProcessNcActionChecklist({
  actions,
  onToggle,
}: {
  actions: Record<ProcessNcActionKey, boolean>
  onToggle: (key: ProcessNcActionKey) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {PROCESS_NC_ACTIONS.map(({ key, label }) => {
        const checked = actions[key]
        return (
          <button
            key={key}
            type="button"
            role="checkbox"
            aria-checked={checked}
            onClick={() => onToggle(key)}
            className={cn(
              'flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors',
              checked ? 'border-primary/40 bg-primary/5' : 'border-border bg-background hover:bg-muted/50',
            )}
          >
            <span
              className={cn(
                'flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border-2',
                checked
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-muted-foreground/35 bg-background',
              )}
            >
              {checked ? <Check className="h-3.5 w-3.5 stroke-[3]" aria-hidden /> : null}
            </span>
            <span className={cn(checked && 'font-medium')}>{label}</span>
          </button>
        )
      })}
    </div>
  )
}

export { PROCESS_NC_ACTIONS as processNcActionColumns }
