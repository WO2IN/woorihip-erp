'use client'

import Link from 'next/link'
import { useState } from 'react'
import { BuildingIcon, ChevronRightIcon, ClipboardCheckIcon, ThermometerIcon, Trash2Icon, UserRoundIcon, WrenchIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { TodayStatusBadge } from '@/components/shared/today-status-badge'
import type { TodayStatus } from '@/lib/today-check'

export type TargetKind = 'daily' | 'fiveS' | 'temp'

const KIND = {
  daily: { icon: WrenchIcon, tile: 'bg-[oklch(0.70_0.16_58/0.14)] text-[oklch(0.52_0.15_50)] dark:text-[oklch(0.80_0.14_60)]' },
  fiveS: { icon: ClipboardCheckIcon, tile: 'bg-[oklch(0.62_0.12_230/0.14)] text-[oklch(0.48_0.13_235)] dark:text-[oklch(0.78_0.11_230)]' },
  temp: { icon: ThermometerIcon, tile: 'bg-[oklch(0.55_0.18_288/0.12)] text-[oklch(0.48_0.18_288)] dark:text-[oklch(0.76_0.14_288)]' },
} as const

const STRIPE: Record<TodayStatus, string> = {
  missing: 'bg-[oklch(0.72_0.16_62)]',
  done: 'bg-[oklch(0.62_0.15_162)]',
  off: 'bg-border',
}

interface TargetListRowProps {
  href: string
  name: string
  floor?: string | null
  department?: string | null
  manager?: string | null
  inspectorName?: string | null
  deleteTitle: string
  deleteDescription: string
  deleteAction: (id: number) => Promise<void>
  id: number
  status?: TodayStatus
  statusLabel?: string
  canDelete?: boolean
  kind?: TargetKind
}

export function TargetListRow({
  href,
  name,
  department,
  manager,
  inspectorName,
  deleteTitle,
  deleteDescription,
  deleteAction,
  id,
  status,
  statusLabel,
  canDelete = false,
  kind = 'daily',
}: TargetListRowProps) {
  const [pending, setPending] = useState(false)
  const { icon: Icon, tile } = KIND[kind]
  const person = inspectorName || manager

  async function handleDelete() {
    setPending(true)
    try {
      await deleteAction(id)
      toast.success('삭제되었습니다.')
    } catch (error) {
      console.error('[v0] delete target error:', error)
      toast.error('삭제에 실패했습니다.')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="group relative flex overflow-hidden rounded-xl border bg-card shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md">
      <span className={cn('w-1 shrink-0', STRIPE[status ?? 'off'])} aria-hidden="true" />
      <Link href={href} className="flex min-w-0 flex-1 items-center gap-3 py-3.5 pl-3.5 pr-3">
        <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl', tile)}>
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate font-semibold">{name}</span>
          <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <BuildingIcon className="size-3.5" aria-hidden="true" />
              {department || '부서 미지정'}
            </span>
            <span className={cn('inline-flex items-center gap-1', person && 'font-medium text-foreground/80')}>
              <UserRoundIcon className="size-3.5" aria-hidden="true" />
              {person ? `점검자 ${person}` : '점검자 미지정'}
            </span>
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {status && statusLabel ? <TodayStatusBadge status={status} label={statusLabel} /> : null}
          <ChevronRightIcon className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </span>
      </Link>
      {canDelete && (
      <AlertDialog>
        <AlertDialogTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="mr-2 self-center shrink-0 text-muted-foreground opacity-100 hover:text-destructive sm:opacity-0 sm:group-hover:opacity-100"
            />
          }
        >
          <Trash2Icon />
          <span className="sr-only">{name} 삭제</span>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>{deleteDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={handleDelete}
              disabled={pending}
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      )}
    </div>
  )
}
