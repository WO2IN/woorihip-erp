'use client'

import { cn } from '@/lib/utils'
import type { WorkflowStatus } from '@/lib/non-conformity'
import { WORKFLOW_STATUS_LABEL, WORKFLOW_STATUS_ORDER } from '@/lib/non-conformity'

const STATUS_CLASS: Record<WorkflowStatus, string> = {
  done: 'bg-blue-600',
  in_progress: 'bg-amber-400',
  not_started: 'bg-red-500',
}

export function StatusMark({ status, className }: { status: WorkflowStatus; className?: string }) {
  return (
    <span
      className={cn('inline-block shrink-0 rounded-full', STATUS_CLASS[status], className)}
      aria-hidden
    />
  )
}

/** 항목 추가 등록 시 초기 상태 선택 */
export function WorkflowStatusPicker({
  label,
  value,
  onChange,
  inline = false,
}: {
  label: string
  value: WorkflowStatus
  onChange: (next: WorkflowStatus) => void
  /** 완료·진행중·미진행을 한 줄로 펼친다 */
  inline?: boolean
}) {
  return (
    <div className="space-y-1.5">
      <p className={cn('font-medium text-foreground', inline ? 'text-[13px]' : 'text-xs')}>{label}</p>
      <div className={cn('flex gap-1.5', inline ? 'flex-nowrap' : 'flex-wrap')}>
        {WORKFLOW_STATUS_ORDER.map((item) => {
          const selected = value === item
          return (
            <button
              key={item}
              type="button"
              onClick={() => onChange(item)}
              className={cn(
                'inline-flex items-center justify-center gap-1.5 rounded-md border py-1.5 transition-colors',
                inline ? 'min-w-0 flex-1 whitespace-nowrap px-2 text-[13px]' : 'px-2.5 text-xs',
                selected
                  ? 'border-primary bg-primary/10 font-medium'
                  : 'border-border bg-background hover:bg-muted/60'
              )}
            >
              <StatusMark status={item} className="h-2.5 w-2.5" />
              {WORKFLOW_STATUS_LABEL[item]}
            </button>
          )
        })}
      </div>
    </div>
  )
}
