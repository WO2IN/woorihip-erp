'use client'

import Link from 'next/link'
import { ArrowLeftIcon } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { BAND_BUTTON_PRIMARY } from '@/components/shared/page-header'
import { detectFloor } from '@/lib/floor'
import { cn } from '@/lib/utils'

type ChecksheetTab = '5s' | 'daily' | 'temp' | 'process'

export function ChecksheetBackLink({
  floor,
  name,
  tab,
}: {
  floor?: string | null
  name?: string | null
  tab: ChecksheetTab
}) {
  const floorKey = detectFloor(floor, name)
  return (
    <Link
      href={`/checksheets?floor=${encodeURIComponent(floorKey)}&tab=${tab}`}
      aria-label="목록으로 돌아가기"
      className={cn(buttonVariants({ variant: 'outline', size: 'icon' }), 'size-10 shrink-0', BAND_BUTTON_PRIMARY)}
    >
      <ArrowLeftIcon className="size-4" />
    </Link>
  )
}
