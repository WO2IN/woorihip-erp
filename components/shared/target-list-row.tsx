'use client'

import Link from 'next/link'
import { useState } from 'react'
import { BuildingIcon, ChevronRightIcon, ClipboardCheckIcon, FactoryIcon, ThermometerIcon, Trash2Icon, WrenchIcon } from 'lucide-react'
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

export type TargetKind = 'daily' | 'fiveS' | 'temp' | 'process'

const KIND = {
  daily: { icon: WrenchIcon, tile: 'bg-[oklch(0.70_0.16_58/0.16)] text-[oklch(0.52_0.15_50)] dark:text-[oklch(0.80_0.14_60)]' },
  fiveS: { icon: ClipboardCheckIcon, tile: 'bg-[oklch(0.62_0.12_230/0.16)] text-[oklch(0.48_0.13_235)] dark:text-[oklch(0.78_0.11_230)]' },
  temp: { icon: ThermometerIcon, tile: 'bg-[oklch(0.55_0.18_288/0.14)] text-[oklch(0.48_0.18_288)] dark:text-[oklch(0.76_0.14_288)]' },
  process: { icon: FactoryIcon, tile: 'bg-[oklch(0.62_0.15_162/0.16)] text-[oklch(0.45_0.13_165)] dark:text-[oklch(0.78_0.13_162)]' },
} as const

const STRIPE: Record<TodayStatus, string> = {
  missing: 'bg-rose-500',
  done: 'bg-emerald-500',
  off: 'bg-border',
}

/** 목록 한 줄(층 홈과 각 점검 목록이 함께 씁니다). */
export function TargetRow({
  href,
  name,
  department,
  person,
  status,
  statusLabel,
  gap,
  todayLabel,
  kind = 'daily',
  trailing,
}: {
  href: string
  name: string
  department?: string | null
  person?: string | null
  status?: TodayStatus
  statusLabel?: string
  gap?: string
  todayLabel?: string
  kind?: TargetKind
  trailing?: React.ReactNode
}) {
  const { icon: Icon, tile } = KIND[kind]
  return (
    <div
      className={cn(
        'group relative flex items-center border-b border-border/70 transition-colors last:border-b-0 hover:bg-muted/50',
        status === 'missing' && 'bg-rose-50/70 dark:bg-rose-500/[0.07]',
        status === 'done' && 'bg-emerald-50/70 dark:bg-emerald-500/[0.07]',
      )}
    >
      <span className={cn('absolute inset-y-0 left-0 w-1', STRIPE[status ?? 'off'])} aria-hidden="true" />
      <Link href={href} className="flex min-h-[4.25rem] min-w-0 flex-1 items-center gap-3.5 py-3 pl-5 pr-3">
        <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl', tile)}>
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{name}</span>
          <span className="mt-1 flex min-w-0 items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex min-w-0 items-center gap-1">
              <BuildingIcon className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{department || '부서 미지정'}</span>
            </span>
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <span
                className={cn(
                  'flex size-[1.15rem] shrink-0 items-center justify-center rounded-full text-[10px] font-bold',
                  person ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
                )}
              >
                {person ? person.trim().charAt(0) : '?'}
              </span>
              <span className={cn('truncate', person && 'font-medium text-foreground/80')}>{person || '점검자 미지정'}</span>
            </span>
          </span>
        </span>
        {gap && gap !== todayLabel ? (
          <span className="hidden max-w-36 shrink-0 truncate rounded-md bg-amber-100/70 px-2 py-1 text-xs font-medium text-amber-800 lg:block dark:bg-amber-500/10 dark:text-amber-300">
            {gap}
          </span>
        ) : null}
        <span className="flex shrink-0 items-center gap-1.5">
          {status && statusLabel ? <TodayStatusBadge status={status} label={statusLabel} /> : null}
          <ChevronRightIcon className="size-4 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5" />
        </span>
      </Link>
      {trailing}
    </div>
  )
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
  gap?: string
  todayLabel?: string
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
  gap,
  todayLabel,
  canDelete = false,
  kind = 'daily',
}: TargetListRowProps) {
  const [pending, setPending] = useState(false)
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
    <TargetRow
      href={href}
      name={name}
      department={department}
      person={person}
      status={status}
      statusLabel={statusLabel}
      gap={gap}
      todayLabel={todayLabel}
      kind={kind}
      trailing={
        canDelete ? (
      <AlertDialog>
        <AlertDialogTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="mr-3 self-center shrink-0 text-muted-foreground hover:text-destructive"
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
        ) : null
      }
    />
  )
}
