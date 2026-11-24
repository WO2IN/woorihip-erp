'use client'

import { useState } from 'react'
import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { barcodeSvg, LABEL_SIZES, printBarcodeLabels, type BarcodeLabel, type LabelSizeId } from '@/lib/barcode-label'
import { cn } from '@/lib/utils'

const SIZE_KEY = 'woorihip-label-size'

/** 바코드 라벨 출력 버튼. 누르면 미리보기·크기·매수를 고르는 창이 열린다. */
export function BarcodePrintButton({ label, className }: { label: BarcodeLabel; className?: string }) {
  const [open, setOpen] = useState(false)
  const [size, setSize] = useState<LabelSizeId>('100x50')
  const [copies, setCopies] = useState('1')
  const ready = !!barcodeSvg(label.barcode)
  const current = LABEL_SIZES.find((item) => item.id === size) ?? LABEL_SIZES[0]

  function openDialog() {
    const saved = window.localStorage.getItem(SIZE_KEY)
    if (LABEL_SIZES.some((item) => item.id === saved)) setSize(saved as LabelSizeId)
    setCopies('1')
    setOpen(true)
  }

  function print() {
    window.localStorage.setItem(SIZE_KEY, size)
    printBarcodeLabels(label, size, Number(copies))
  }

  const title = [label.partner, label.product].filter(Boolean).join(' · ')
  const meta = [label.lotNo && `LOT ${label.lotNo}`, label.spec, label.date].filter(Boolean).join('   ')
  const svg = barcodeSvg(label.barcode)

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!ready}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={openDialog}
        className={cn('no-print', className)}
        title={ready ? undefined : '바코드 번호가 있어야 출력할 수 있습니다.'}
      >
        <Printer className="h-3.5 w-3.5" />
        바코드 출력
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent overlayClassName="!z-[90]" className="!z-[100] sm:max-w-md" onPointerDown={(event) => event.stopPropagation()}>
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">바코드 라벨 출력</DialogTitle>
            <DialogDescription>라벨 크기와 매수를 고른 뒤 출력하세요. 프린터 설정에서 용지를 라벨 크기로 맞춰 주세요.</DialogDescription>
          </DialogHeader>

          <div className="flex justify-center rounded-xl bg-slate-100 p-4 dark:bg-slate-900">
            <div
              className="flex flex-col justify-center overflow-hidden bg-white px-3 py-2 text-black shadow-md"
              style={{ width: `${current.width * 2.6}px`, height: `${current.height * 2.6}px`, maxWidth: '100%' }}
            >
              {title && <p className="truncate text-[11px] font-bold">{title}</p>}
              {svg && <div className="min-h-0 flex-1 py-1 [&_svg]:h-full [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />}
              <p className="text-center font-mono text-xs font-bold tracking-[0.12em]">{label.barcode}</p>
              {meta && <p className="truncate text-center text-[9px]">{meta}</p>}
            </div>
          </div>

          <div className="space-y-1.5">
            <span className="text-xs font-semibold text-muted-foreground">라벨 크기</span>
            <div className="grid grid-cols-3 gap-2">
              {LABEL_SIZES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSize(item.id)}
                  aria-pressed={size === item.id}
                  className={cn(
                    'rounded-lg border px-2 py-2 text-sm font-semibold transition',
                    size === item.id
                      ? 'border-blue-400 bg-blue-50 text-blue-700 dark:border-blue-500/50 dark:bg-blue-950/40 dark:text-blue-200'
                      : 'hover:bg-muted',
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-muted-foreground">매수</span>
            <Input type="number" min={1} max={100} value={copies} onChange={(event) => setCopies(event.target.value)} className="w-28" />
          </label>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>닫기</Button>
            <Button type="button" onClick={print}>
              <Printer className="h-4 w-4" />출력
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
