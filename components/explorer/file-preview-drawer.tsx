'use client'

import { useState } from 'react'
import { X, Download, Edit, Trash2, FileText, Maximize2, UserRound, CalendarDays } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { DocumentMetadata } from '@/lib/types'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { toast } from 'sonner'
import { notifyDataChanged } from '@/lib/data-events'
import { getSession, buildAuthHeaders } from '@/lib/auth-client'
import { useAuth } from '@/components/auth/auth-context'
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
import { EditDocumentDialog } from '@/components/explorer/edit-document-dialog'
import { PdfViewerModal } from '@/components/explorer/pdf-viewer-modal'
import { documentDownloadName, documentFileKind } from '@/lib/file-types'

interface FilePreviewDrawerProps {
  document: DocumentMetadata | null
  open: boolean
  onClose: () => void
  onDelete: (id: string) => void
  onUpdate: (doc: DocumentMetadata) => void
}

function normalizeDate(value?: string | null) {
  if (!value) return null

  const raw = value.trim().replace(/\./g, '-')
  const match = raw.match(/^(\d{4})-?(\d{2})-?(\d{2})/)
  if (!match) return null

  const [, year, month, day] = match
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))

  if (
    !Number.isFinite(date.getTime()) ||
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() !== Number(month) - 1 ||
    date.getUTCDate() !== Number(day)
  ) {
    return null
  }

  return date
}

function formatTimestamp(value?: string | null) {
  if (!value) return '-'

  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? '-'
    : format(date, 'yyyy-MM-dd HH:mm', { locale: ko })
}

function MetaRow({ label, value }: { label: string; value?: string | number | null }) {
  if (!value && value !== 0) return null

  return (
    <div className="flex items-start gap-4 py-2.5">
      <span className="text-sm font-medium text-muted-foreground w-24 flex-shrink-0">
        {label}
      </span>
      <span className="text-[15px] text-foreground flex-1 break-all">
        {value}
      </span>
    </div>
  )
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

const getDownloadName = documentDownloadName

export function FilePreviewDrawer({ document, open, onClose, onDelete, onUpdate }: FilePreviewDrawerProps) {
  const { user } = useAuth()
  const canEditDoc = user && ['editor', 'admin'].includes(user.role)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [fullViewOpen, setFullViewOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    if (!document) return
    setDeleting(true)
    try {
      const session = getSession()
      const res = await fetch(`/api/documents/${document.id}`, {
        method: 'DELETE',
        headers: session ? buildAuthHeaders(session) : {},
      })
      if (!res.ok) throw new Error()
      toast.success('문서가 삭제되었습니다.')
      onDelete(document.id)
      notifyDataChanged('documents')
      onClose()
    } catch {
      toast.error('삭제에 실패했습니다.')
    } finally {
      setDeleting(false)
      setDeleteOpen(false)
    }
  }

  if (!document) return null

  const kind = documentFileKind(document)
  const fileUrl = `/api/file?path=${encodeURIComponent(document.storagePath)}`
  const downloadName = getDownloadName(document)
  const downloadUrl = `${fileUrl}&download=true&downloadName=${encodeURIComponent(downloadName)}`

  return (
    <>
      <Sheet open={open} onOpenChange={v => !v && onClose()}>
        <SheetContent side="right" className="w-full sm:max-w-3xl p-0 flex flex-col gap-0">
          <SheetHeader className="px-6 py-4 border-b border-border flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-50 dark:bg-red-950/30 rounded-xl flex items-center justify-center flex-shrink-0">
                <FileText className="w-5 h-5 text-red-500" />
              </div>
              <div className="flex-1 min-w-0">
                <SheetTitle className="text-sm font-semibold truncate">{document.filename}</SheetTitle>
                <p className="text-xs text-muted-foreground mt-0.5">{document.company} · {document.documentType}</p>
              </div>
            </div>
          </SheetHeader>

          <div className="flex-1 overflow-auto">
            {/* PDF Preview */}
            <div className="p-4">
              <div
              className="group relative w-full bg-muted/40 rounded-xl overflow-hidden border border-border"
              style={{ height: '340px' }}
              >
                {kind?.preview === 'image' ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={fileUrl} alt={document.originalName} className="h-full w-full object-contain" />
                ) : kind?.preview !== 'pdf' ? (
                  <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
                    <FileText className="h-12 w-12 opacity-40" />
                    <p className="text-sm font-semibold text-foreground">{kind?.label ?? '파일'} 파일은 미리보기를 지원하지 않습니다.</p>
                    <p className="text-xs">아래 다운로드 버튼으로 내려받아 확인하세요.</p>
                  </div>
                ) : (
                <iframe
                  src={fileUrl}
                  className="w-full h-full"
                  title={document.filename}
                />
                )}
                {kind?.preview === 'pdf' && <Button
                  type="button"
                  variant="secondary"
                  className="absolute top-15 right-5 z-10
                            gap-2 px-5 py-2.5 h-auto text-sm
                            opacity-0 group-hover:opacity-100
                            transition-opacity duration-200"
                  onClick={() => setFullViewOpen(true)}
                >
                  <Maximize2 className="w-4 h-4" />
                  크게 보기
                </Button>}
              </div>
            </div>

            {/* Metadata */}
            <div className="px-6 pb-4">
              <p className="text-base font-semibold text-muted-foreground uppercase tracking-wider mb-3">문서 정보</p>
              <Separator className="mb-3" />
              <div className="divide-y divide-border/50">
                <MetaRow label="업체명" value={document.company} />
                <MetaRow label="문서유형" value={document.documentType} />
                <MetaRow label="도금 종류" value={document.shipmentCategory} />
                <MetaRow
                  label="층수"
                  value={document.floor ?? document.shipmentFloor ? `${document.floor ?? document.shipmentFloor}층` : null}
                />
                <MetaRow label="LOT 시작" value={document.lotStart} />
                <MetaRow label="LOT 종료" value={document.lotEnd} />
                <MetaRow label="품목" value={document.product} />
                <MetaRow label="재질" value={document.material} />
                <MetaRow label="도금사양" value={document.specification} />
                <MetaRow label="수량" value={document.quantity ? `${document.quantity.toLocaleString()} ${document.quantityUnit || 'Kg'}` : null} />
                <MetaRow
                  label="발행일"
                  value={
                    normalizeDate(document.issueDate)
                      ? format(
                          new Date(normalizeDate(document.issueDate)!),
                          'yyyy년 MM월 dd일',
                          { locale: ko }
                        )
                      : '-'
                  }
                />
                <MetaRow label="파일 형식" value={kind ? `${kind.label} (.${kind.ext})` : null} />
                <MetaRow label="원본 파일명" value={document.originalName} />
                <MetaRow label="파일크기" value={formatBytes(document.fileSize)} />
                <MetaRow label="비고" value={document.note} />
              </div>

              {/* Author info */}
              {(document.createdBy || document.updatedBy) && (
                <div className="mt-4 pt-4 border-t border-border/50">
                  <p className="text-base font-semibold text-muted-foreground uppercase tracking-wider mb-3">작성자 정보</p>
                  <Separator className="mb-3" />
                  <div className="divide-y divide-border/50">
                    {document.createdBy && (
                      <div className="flex items-center gap-4 py-2.5">
                        <span className="text-sm font-medium text-muted-foreground w-24 flex-shrink-0 flex items-center gap-1.5">
                          <UserRound className="w-3.5 h-3.5" />
                          등록자
                        </span>
                        <span className="text-[15px] text-foreground flex-1">
                          {document.createdBy}
                        </span>
                      </div>
                    )}
                    {document.createdAt && (
                      <div className="flex items-center gap-4 py-2.5">
                        <span className="text-sm font-medium text-muted-foreground w-24 flex-shrink-0 flex items-center gap-1.5">
                          <CalendarDays className="w-3.5 h-3.5" />
                          등록일시
                        </span>
                        <span className="text-[15px] text-foreground flex-1">
                          {formatTimestamp(document.createdAt)}
                        </span>
                      </div>
                    )}
                    {document.updatedBy && (
                      <div className="flex items-center gap-4 py-2.5">
                        <span className="text-sm font-medium text-muted-foreground w-24 flex-shrink-0 flex items-center gap-1.5">
                          <UserRound className="w-3.5 h-3.5" />
                          최종 수정자
                        </span>
                        <span className="text-[15px] text-foreground flex-1">
                          {document.updatedBy}
                        </span>
                      </div>
                    )}
                    {document.updatedAt && (
                      <div className="flex items-center gap-4 py-2.5">
                        <span className="text-sm font-medium text-muted-foreground w-24 flex-shrink-0 flex items-center gap-1.5">
                          <CalendarDays className="w-3.5 h-3.5" />
                          수정일시
                        </span>
                        <span className="text-[15px] text-foreground flex-1">
                          {formatTimestamp(document.updatedAt)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="px-6 py-4 border-t border-border flex-shrink-0 flex gap-2">
            <Button
              variant="default"
              className="flex-1 gap-1.5"
              onClick={() => {
                window.location.href = downloadUrl
              }}
            >
              <Download className="w-4 h-4" />
              다운로드
            </Button>
            {canEditDoc && (
              <>
                <Button variant="outline" size="icon" onClick={() => setEditOpen(true)} title="수정">
                  <Edit className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => setDeleteOpen(true)}
                  title="삭제"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* PDF full view modal */}
      <PdfViewerModal
        open={fullViewOpen}
        onClose={() => setFullViewOpen(false)}
        fileUrl={fileUrl}
        filename={document.filename}
        downloadName={downloadName}
        subtitle={`${document.company} · ${document.documentType}`}
      />

      {/* Delete confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>문서 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{document.filename}</strong> 을(를) 삭제하시겠습니까?
              <br />이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleting ? '삭제 중...' : '삭제'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit dialog */}
      {editOpen && (
        <EditDocumentDialog
          document={document}
          open={editOpen}
          onClose={() => setEditOpen(false)}
          onUpdate={doc => {
            onUpdate(doc)
            setEditOpen(false)
          }}
        />
      )}
    </>
  )
}
