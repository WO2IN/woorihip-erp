'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import {
  Minus,
  Plus,
  RotateCw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString()

interface PdfDragPreviewProps {
  file: File
}

export function PdfDragPreview({ file }: PdfDragPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  const [numPages, setNumPages] = useState(0)
  const [scale, setScale] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [pdfData, setPdfData] = useState<Uint8Array | null>(null)

  const draggingRef = useRef(false)

  const dragStart = useRef({
    x: 0,
    y: 0,
    scrollLeft: 0,
    scrollTop: 0,
  })

  // PDF 파일을 Uint8Array로 변환
  useEffect(() => {
    let cancelled = false

    const loadPdf = async () => {
      try {
        setPdfData(null)
        setNumPages(0)

        const buffer = await file.arrayBuffer()

        if (!cancelled) {
          setPdfData(new Uint8Array(buffer))
        }
      } catch (error) {
        console.error('PDF 파일을 불러오지 못했습니다.', error)
      }
    }

    loadPdf()

    return () => {
      cancelled = true
    }
  }, [file])

  // Document에 전달하는 file 객체를 고정
  const documentFile = useMemo(() => {
    if (!pdfData) return null

    return {
      data: pdfData,
    }
  }, [pdfData])

  // 마우스 드래그 시작
  const handleMouseDown = (
    e: React.MouseEvent<HTMLDivElement>
  ) => {
    if ((e.target as HTMLElement).closest('button')) return

    e.preventDefault()

    const container = containerRef.current
    if (!container) return

    draggingRef.current = true
    container.style.cursor = 'grabbing'

    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      scrollLeft: container.scrollLeft,
      scrollTop: container.scrollTop,
    }
  }

  // 마우스로 PDF 이동
  const handleMouseMove = (
    e: React.MouseEvent<HTMLDivElement>
  ) => {
    if (!draggingRef.current) return

    const container = containerRef.current
    if (!container) return

    const dx = e.clientX - dragStart.current.x
    const dy = e.clientY - dragStart.current.y

    container.scrollLeft =
      dragStart.current.scrollLeft - dx

    container.scrollTop =
      dragStart.current.scrollTop - dy
  }

  // 드래그 종료
  const handleMouseUp = () => {
    draggingRef.current = false

    if (containerRef.current) {
      containerRef.current.style.cursor = 'grab'
    }
  }

  // 영역 밖에서 마우스를 놓아도 드래그 종료
  useEffect(() => {
    const handleWindowMouseUp = () => {
      draggingRef.current = false

      if (containerRef.current) {
        containerRef.current.style.cursor = 'grab'
      }
    }

    window.addEventListener('mouseup', handleWindowMouseUp)

    return () => {
      window.removeEventListener(
        'mouseup',
        handleWindowMouseUp
      )
    }
  }, [])

  // 확대
  const zoomIn = () => {
    setScale(prev => Math.min(3, prev + 0.2))
  }

  // 축소
  const zoomOut = () => {
    setScale(prev => Math.max(0.5, prev - 0.2))
  }

  // 회전
  const rotate = () => {
    setRotation(prev => (prev + 90) % 360)
  }

  return (
    <div className="h-full flex flex-col bg-muted/30">
      {/* 상단 컨트롤 */}
      <div className="h-12 shrink-0 flex items-center justify-center gap-2 border-b border-border bg-card">
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={zoomOut}
        >
          <Minus className="w-4 h-4" />
        </Button>

        <span className="text-sm font-medium min-w-[60px] text-center">
          {Math.round(scale * 100)}%
        </span>

        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={zoomIn}
        >
          <Plus className="w-4 h-4" />
        </Button>

        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={rotate}
        >
          <RotateCw className="w-4 h-4" />
        </Button>
      </div>

      {/* PDF 영역 */}
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDragStart={e => e.preventDefault()}
        className="
          flex-1
          min-h-0
          overflow-auto
          select-none
          cursor-grab
        "
      >
        <div className="min-w-max p-6">
          {documentFile ? (
            <Document
              file={documentFile}
              onLoadSuccess={({ numPages }) => {
                setNumPages(numPages)
              }}
              onLoadError={error => {
                console.error('PDF 로드 오류:', error)
              }}
              loading={
                <p className="p-5 text-sm text-muted-foreground">
                  PDF 불러오는 중...
                </p>
              }
            >
              <div className="space-y-4">
                {Array.from(
                  { length: numPages },
                  (_, index) => (
                    <Page
                    key={index}
                    pageNumber={index + 1}
                    scale={scale}
                    rotate={rotation}
                    renderTextLayer={false}
                    renderAnnotationLayer={false}
                    className="shadow-lg pointer-events-none"
                  />
                  )
                )}
              </div>
            </Document>
          ) : (
            <p className="p-5 text-sm text-muted-foreground">
              PDF 준비 중...
            </p>
          )}
        </div>
      </div>
    </div>
  )
}