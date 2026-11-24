'use client'

import { PrinterIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { BAND_BUTTON } from '@/components/shared/page-header'
import { cn } from '@/lib/utils'

/** 머리글 띠(PageHeader) 위에 올리는 인쇄 버튼 */
export function PrintButton() {
  return (
    <Button variant="outline" className={cn('no-print h-10 px-4', BAND_BUTTON)} onClick={() => window.print()}>
      <PrinterIcon data-icon="inline-start" />
      인쇄
    </Button>
  )
}
