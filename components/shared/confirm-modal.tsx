'use client'

import { useEffect, useState, type ReactNode } from 'react'
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
import { cn } from '@/lib/utils'

type ConfirmOptions = {
  title: string
  description?: ReactNode
  /** 확인 버튼 글자. 기본 '확인' */
  confirmLabel?: string
  /** 삭제처럼 되돌릴 수 없는 일이면 확인 버튼을 빨갛게 */
  destructive?: boolean
}
type Pending = ConfirmOptions & { resolve: (ok: boolean) => void }

let show: ((pending: Pending) => void) | null = null

/** 브라우저 기본 확인창(window.confirm) 대신 쓰는 모달. 확인하면 true. */
export function confirmModal(options: ConfirmOptions): Promise<boolean> {
  if (!show) return Promise.resolve(window.confirm(options.title))
  const open = show
  return new Promise((resolve) => open({ ...options, resolve }))
}

/** 앱에 한 번만 둔다 (app/layout.tsx). */
export function ConfirmModalHost() {
  const [current, setCurrent] = useState<Pending | null>(null)
  useEffect(() => {
    show = setCurrent
    return () => { show = null }
  }, [])

  function close(ok: boolean) {
    current?.resolve(ok)
    setCurrent(null)
  }

  return (
    <AlertDialog open={!!current} onOpenChange={(open) => { if (!open) close(false) }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{current?.title}</AlertDialogTitle>
          {current?.description ? (
            <AlertDialogDescription className="whitespace-pre-line">{current.description}</AlertDialogDescription>
          ) : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>취소</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => close(true)}
            className={cn(current?.destructive && 'bg-destructive text-white hover:bg-destructive/90')}
          >
            {current?.confirmLabel ?? '확인'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
