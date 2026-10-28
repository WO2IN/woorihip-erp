'use client'

import { cn } from '@/lib/utils'
import type { WorkflowStatus } from '@/lib/non-conformity'
import { WORKFLOW_STATUS_LABEL, WORKFLOW_STATUS_ORDER, nextWorkflowStatus } from '@/lib/non-conformity'

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

export function WorkflowLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <span className="font-medium text-foreground">업무 진행사항</span>
      {WORKFLOW_STATUS_ORDER.map((status) => (
        <span key={status} className="inline-flex items-center gap-1.5">
          <StatusMark status={status} className="h-2.5 w-2.5" />
          {WORKFLOW_STATUS_LABEL[status]}
        </span>
      ))}
    </div>
  )
}

interface WorkflowStatusDotProps {
  status: WorkflowStatus
  editable?: boolean
  onChange?: (next: WorkflowStatus) => void
  label?: string
}

function StatusDotStack({
  status,
  title,
  interactive,
  onActivate,
}: {
  status: WorkflowStatus
  title: string
  interactive?: boolean
  onActivate?: () => void
}) {
  const label = (
    <span className="text-[11px] leading-tight text-muted-foreground whitespace-nowrap">
      {WORKFLOW_STATUS_LABEL[status]}
    </span>
  )

  if (interactive && onActivate) {
    return (
      <button
        type="button"
        title={title}
        aria-label={title}
        onClick={onActivate}
        className={cn(
          'mx-auto flex flex-col items-center gap-1 rounded-md px-1 py-0.5 transition-colors hover:bg-muted/80',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        )}
      >
        <StatusMark status={status} className="h-3 w-3" />
        {label}
      </button>
    )
  }

  return (
    <span title={title} className="mx-auto flex flex-col items-center gap-1 py-0.5">
      <StatusMark status={status} className="h-3 w-3" />
      {label}
      <span className="sr-only">{title}</span>
    </span>
  )
}

/** 표에서 점 클릭 → 완료 → 진행중 → 미진행 순환, 아래에 상태 글자 표시 */
export function WorkflowStatusDot({ status, editable, onChange, label }: WorkflowStatusDotProps) {
  const title = `${label ? `${label}: ` : ''}${WORKFLOW_STATUS_LABEL[status]}${editable ? ' (클릭하여 변경)' : ''}`

  return (
    <StatusDotStack
      status={status}
      title={title}
      interactive={Boolean(editable && onChange)}
      onActivate={editable && onChange ? () => onChange(nextWorkflowStatus(status)) : undefined}
    />
  )
}

/** 항목 추가 등록 시 초기 상태 선택 */
export function WorkflowStatusPicker({
  label,
  value,
  onChange,
}: {
  label: string
  value: WorkflowStatus
  onChange: (next: WorkflowStatus) => void
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-foreground">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {WORKFLOW_STATUS_ORDER.map((item) => {
          const selected = value === item
          return (
            <button
              key={item}
              type="button"
              onClick={() => onChange(item)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors',
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
