'use client'

import type { ReactNode } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

export function ConfirmDeleteDialog({
  open,
  onOpenChange,
  title,
  children,
  onConfirm,
  pending,
  pendingLabel = '삭제 중...',
  keepOpenOnConfirm = false,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  children: ReactNode
  onConfirm: () => void
  /** 지정하면 진행 중일 때 버튼을 잠그고 `pendingLabel`을 보여준다 */
  pending?: boolean
  pendingLabel?: string
  /** 확인 후 닫기를 호출 측에서 처리 (비동기 완료 후 닫을 때) */
  keepOpenOnConfirm?: boolean
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{children}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={keepOpenOnConfirm && pending}>취소</AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              if (keepOpenOnConfirm) event.preventDefault()
              onConfirm()
            }}
            disabled={pending}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            {pending ? pendingLabel : '삭제'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
