'use client'

import { useState } from 'react'
import { Trash2Icon } from 'lucide-react'
import { cn } from '@/lib/utils'

export function ItemDeleteButton({
  onConfirm,
  disabled,
  compact = false,
}: {
  onConfirm: () => void
  disabled?: boolean
  /** 표 등 좁은 칸: 아이콘만 (두 번 탭으로 확인) */
  compact?: boolean
}) {
  const [armed, setArmed] = useState(false)

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        if (armed) {
          setArmed(false)
          onConfirm()
        } else {
          setArmed(true)
        }
      }}
      onBlur={() => setArmed(false)}
      aria-label={armed ? '삭제 확인' : '삭제'}
      title={armed ? '한 번 더 눌러 삭제' : '삭제'}
      className={cn(
        'inline-flex shrink-0 flex-nowrap items-center justify-center gap-1 whitespace-nowrap rounded-lg border text-xs font-medium transition-colors disabled:opacity-50',
        compact ? (armed ? 'h-8 px-2' : 'h-8 w-8 p-0') : 'h-9 px-3',
        armed
          ? 'border-destructive bg-destructive text-white'
          : 'border-border bg-card text-destructive hover:bg-destructive/10',
      )}
    >
      <Trash2Icon className="size-4 shrink-0" aria-hidden="true" />
      {!compact && (armed ? '삭제 확인' : '삭제')}
      {compact && armed && <span className="whitespace-nowrap">확인</span>}
    </button>
  )
}
