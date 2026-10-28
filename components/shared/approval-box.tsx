'use client'

import { useState, useTransition } from 'react'
import { Input } from '@/components/ui/input'

interface ApprovalBoxProps {
  writer: string | null | undefined
  reviewer: string | null | undefined
  approver: string | null | undefined
  onSave: (fields: { writer?: string; reviewer?: string; approver?: string }) => Promise<void>
  readOnly?: boolean
}

export function ApprovalBox({ writer, reviewer, approver, onSave, readOnly = false }: ApprovalBoxProps) {
  const [values, setValues] = useState({
    writer: writer ?? '',
    reviewer: reviewer ?? '',
    approver: approver ?? '',
  })
  const [, startTransition] = useTransition()

  function handleBlur(field: 'writer' | 'reviewer' | 'approver') {
    if (readOnly) return
    startTransition(() => {
      onSave({ [field]: values[field] })
    })
  }

  return (
    <div className="print-approval-box flex shrink-0 border border-border">
      {(
        [
          ['writer', '작 성'],
          ['reviewer', '검 토'],
          ['approver', '승 인'],
        ] as const
      ).map(([key, label], i) => (
        <div key={key} className={i > 0 ? 'border-l border-border' : ''}>
          <div className="print-compact-label border-b border-border bg-muted px-3 py-1 text-center text-xs font-medium text-muted-foreground">
            {label}
          </div>
          <Input
            value={values[key]}
            readOnly={readOnly}
            onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
            onBlur={() => handleBlur(key)}
            placeholder="-"
            className="print-compact-input h-10 w-24 rounded-none border-0 text-center shadow-none focus-visible:ring-0"
          />
        </div>
      ))}
    </div>
  )
}
