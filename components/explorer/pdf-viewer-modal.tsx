'use client'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Download, FileText } from 'lucide-react'

interface PdfViewerModalProps {
  open: boolean
  onClose: () => void
  fileUrl: string
  filename: string
  downloadName?: string
  subtitle?: string
}

export function PdfViewerModal({
  open,
  onClose,
  fileUrl,
  filename,
  downloadName,
  subtitle,
}: PdfViewerModalProps) {
  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent
  showCloseButton
  overlayClassName="z-[100]"
  className="
    !top-[50%]
    !z-[100]
    w-[65vw]
    h-[95vh]
    !max-w-[88vw]
    p-0
    gap-0
    overflow-hidden
    rounded-xl
    flex
    flex-col
  "
>
        <DialogHeader className="flex-shrink-0 border-b border-border px-4 py-3">
          <div className="flex items-center gap-3 pr-8">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-red-50 dark:bg-red-950/30">
              <FileText className="h-4 w-4 text-red-500" />
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="truncate text-sm font-semibold">{filename}</DialogTitle>
              {subtitle && (
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</p>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 gap-1.5"
              disabled={!fileUrl}
              onClick={() => {
                if (!fileUrl) return
                window.location.href = `${fileUrl}&download=true${downloadName ? `&downloadName=${encodeURIComponent(downloadName)}` : ''}`
              }}
            >
              <Download className="h-3.5 w-3.5" />
              다운로드
            </Button>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 bg-muted/30">
          {fileUrl ? (
            <iframe
              src={fileUrl}
              className="h-full w-full border-0"
              title={filename}
            />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
