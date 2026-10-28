'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { StickyNote } from 'lucide-react'
import {
  Eye,
  Download,
  Trash2,
  MoreVertical,
  FileText,
  CheckSquare,
  Square
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import { DocumentMetadata } from '@/lib/types'
import { useAuth } from '@/components/auth/auth-context'
import { documentDownloadName, documentFileKind, isCertificate } from '@/lib/file-types'
import { notifyDataChanged } from '@/lib/data-events'
import { getSession, buildAuthHeaders } from '@/lib/auth-client'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'

interface FileCardProps {
  document: DocumentMetadata
  onPreview: (doc: DocumentMetadata) => void
  onDelete: (id: string) => void
  viewMode?: 'grid' | 'list'
  selected?: boolean
  onSelect?: () => void
}

export const LIST_GRID = 'grid grid-cols-[1.7fr_0.8fr_1.4fr_1.6fr_0.9fr_0.9fr] gap-4'

function canDeleteDocument(role?: string | null) {
  return role === 'editor' || role === 'admin'
}

const getDownloadName = documentDownloadName

function formatBytes(bytes?: number) {
  if (!bytes || bytes === 0) return '0 Bytes'

  const sizes = ['Bytes', 'KB', 'MB', 'GB']

  const i = Math.floor(Math.log(bytes) / Math.log(1024))

  return `${parseFloat((bytes / Math.pow(1024, i)).toFixed(2))} ${sizes[i]}`
}

function normalizeDate(value?: string | null) {
  if (!value) return null

  const raw = value.trim().replace(/\./g, '-')
  const match = raw.match(/^(\d{4})-?(\d{2})-?(\d{2})/)
  if (!match) return null

  const [, year, month, day] = match
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))

  // Reject impossible calendar dates instead of passing them to date-fns.
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

function getDocumentTypeStyle(type: string) {
  switch (type) {
    case '성적서':
      return {
        badge: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
        icon: 'bg-blue-50 text-blue-500 dark:bg-blue-950/30',
      }

    case '도면':
      return {
        badge: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300',
        icon: 'bg-green-50 text-green-500 dark:bg-green-950/30',
      }

    case '검사성적서':
      return {
        badge: 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300',
        icon: 'bg-purple-50 text-purple-500 dark:bg-purple-950/30',
      }

    case '견적서':
      return {
        badge: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300',
        icon: 'bg-orange-50 text-orange-500 dark:bg-orange-950/30',
      }

    default:
      return {
        badge: 'bg-gray-100 text-gray-700',
        icon: 'bg-gray-50 text-gray-500',
      }
  }
}

export function FileCard({
  document,
  onPreview,
  onDelete,
  viewMode = 'grid',
  selected = false,
  onSelect,
}: FileCardProps) {
  const { user } = useAuth()
  const canDelete = canDeleteDocument(user?.role)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const formattedIssueDate = normalizeDate(document.issueDate)

  const typeStyle = getDocumentTypeStyle(document.documentType)
  const kind = documentFileKind(document)
  const detail = isCertificate(document.documentType)
    ? [document.material, document.specification].filter(value => value && value !== '-').join(' · ')
    : document.originalName
  const downloadUrl = `/api/file?path=${encodeURIComponent(document.storagePath)}&download=true&downloadName=${encodeURIComponent(getDownloadName(document))}`

  const handleDelete = async () => {
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
    } catch {
      toast.error('삭제에 실패했습니다.')
    } finally {
      setDeleting(false)
      setDeleteOpen(false)
    }
  }

  if (viewMode === 'list') {
    return (
      <>
        <div
          className={`flex items-center gap-3 px-4 py-2.5 transition-colors border-b border-border/50 last:border-b-0 group cursor-pointer ${selected ? 'bg-primary/5' : 'hover:bg-muted/40'}`}
          onClick={() => onPreview(document)}
        >

          {/* 체크박스 */}
          <button
            type="button"
            className="
              flex items-center justify-center
              w-5 h-5
              shrink-0
              rounded-md
              hover:bg-muted
            "
            onClick={(e) => {
              e.stopPropagation()
              onSelect?.()
            }}
          >
            {selected ? (
              <CheckSquare className="w-5 h-5 text-primary" />
            ) : (
              <Square className="w-5 h-5 text-muted-foreground" />
            )}
          </button>


          {/* 파일 아이콘 */}
          <div
            title={kind?.label}
            className={`relative w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${typeStyle.icon}`}
          >
            <FileText className="w-[18px] h-[18px]" />
            {kind && kind.ext !== 'pdf' && (
              <span className="absolute -bottom-1 -right-1.5 rounded bg-foreground px-1 text-[9px] font-bold uppercase leading-[14px] text-background">
                {kind.ext}
              </span>
            )}
          </div>
          <div className={`flex-1 min-w-0 items-center ${LIST_GRID}`}>
            <div className="min-w-0 overflow-hidden">
              <div className="flex items-center gap-1.5 min-w-0">
                <p
                  className="text-sm font-bold text-foreground truncate"
                  title={document.company}
                >
                  {document.company}
                </p>

                {document.note && (
                  <span title={document.note}>
                    <StickyNote className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  </span>
                )}
              </div>

              {detail && (
                <p className="text-xs text-muted-foreground truncate max-w-full" title={detail}>
                  {detail}
                </p>
              )}
            </div>
            <div className="hidden md:flex items-center justify-center">
              <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${typeStyle.badge}`}>
                {document.documentType}
              </span>
            </div>

            <div className="hidden md:flex min-w-0 items-center justify-center">
              <span
                className="text-sm font-medium text-foreground truncate"
                title={document.product}
              >
                {document.product || '-'}
              </span>
            </div>

            <div className="hidden md:flex min-w-0 items-center">
              <span className="text-[13px] text-muted-foreground font-mono truncate whitespace-nowrap">
                {document.lotStart || '-'}{document.lotEnd ? ` ~ ${document.lotEnd}` : ''}
              </span>
            </div>
            <div className="hidden md:flex items-center justify-center">
              <span className="whitespace-nowrap text-[13px] text-muted-foreground tabular-nums">
                {formattedIssueDate
                  ? format(
                    new Date(formattedIssueDate),
                    'yyyy.MM.dd'
                  )
                  : '-'}
              </span>
            </div>

            <div className="hidden md:flex items-center justify-end gap-2">
              <span className="whitespace-nowrap text-[13px] font-semibold text-foreground tabular-nums">
                {document.quantity
                  ? `${document.quantity.toLocaleString()} ${document.quantityUnit || 'Kg'}`
                  : '-'}
              </span>
            </div>
          </div>

          <button
            type="button"
            title="다운로드"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100"
            onClick={(event) => {
              event.stopPropagation()
              window.location.href = downloadUrl
            }}
          >
            <Download className="h-4 w-4" />
          </button>
        </div>
        <DeleteDialog open={deleteOpen} onClose={() => setDeleteOpen(false)} onConfirm={handleDelete} deleting={deleting} filename={document.filename} />
      </>
    )
  }

  return (
    <>
      <div
        className={`
          bg-card rounded-xl p-5 shadow-sm hover:shadow-md transition-all group cursor-pointer animate-fade-in-up
          ${selected
            ? 'border-2 border-primary ring-2 ring-primary/20'
            : 'border border-border hover:border-primary/30'
          }
        `}
      >

        {/* Header */}
        <div className="flex items-start justify-between">

          {/* 체크박스 */}
          <button
            type="button"
            className="
            flex
            items-center
            justify-center
            w-5
            h-5
            mt-1
            shrink-0
            rounded-md
            hover:bg-muted
          "
            onClick={(e) => {
              e.stopPropagation()
              onSelect?.()
            }}
          >
            {selected ? (
              <CheckSquare className="w-5 h-5 text-primary" />
            ) : (
              <Square className="w-5 h-5 text-muted-foreground" />
            )}
          </button>


          {/* 메뉴 */}
          <DropdownMenu>
            <DropdownMenuTrigger className="w-7 h-7 opacity-0 group-hover:opacity-100 inline-flex items-center justify-center rounded-md hover:bg-accent">
              <MoreVertical className="w-3.5 h-3.5" />
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onPreview(document)}>
                <Eye className="w-3.5 h-3.5 mr-2" />
                미리보기
              </DropdownMenuItem>


              <DropdownMenuItem
                onClick={() => {
                  window.location.href =
                    `/api/file?path=${encodeURIComponent(document.storagePath)}&download=true&downloadName=${encodeURIComponent(getDownloadName(document))}`
                }}
              >
                <Download className="w-3.5 h-3.5 mr-2" />
                다운로드
              </DropdownMenuItem>


              {canDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={() => setDeleteOpen(true)}
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-2" />
                    삭제
                  </DropdownMenuItem>
                </>
              )}

            </DropdownMenuContent>
          </DropdownMenu>

        </div>

        {/* 정보 */}
        <div
          onClick={() => onPreview(document)}
          className="mt-3 space-y-3"
        >

          <div>
            <p className="text-xs text-muted-foreground">
              업체 :
            </p>

            <div className="flex items-center gap-2">
              <p
                className="text-base font-bold truncate"
                title={document.company}
              >
                {document.company}
              </p>

              <Badge
                className={`text-sm border-0 px-3 py-1 ${typeStyle.badge}`}
              >
                {document.documentType}
              </Badge>

              {document.note && (
                <span title={document.note}>
                  <StickyNote className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                </span>
              )}
            </div>
          </div>


          <div className="grid grid-cols-2 gap-3">

            <div>
              <p className="text-xs text-muted-foreground">
                제품
              </p>
              <p className="text-sm truncate">
                {document.product || '-'}
              </p>
            </div>


            <div className="text-right">
              <p className="text-xs text-muted-foreground">
                수량
              </p>
              <p className="text-sm font-medium">
                {document.quantity
                  ? `${document.quantity.toLocaleString()} ${document.quantityUnit || 'Kg'}`
                  : '-'}
              </p>
            </div>

          </div>


          <div>
            <p className="text-xs text-muted-foreground">
              LOT
            </p>
            <p className="text-xs font-mono">
              {document.lotStart}
              {document.lotEnd &&
                ` ~ ${document.lotEnd}`}
            </p>
          </div>


          <div className="grid grid-cols-2 gap-3 pt-1">

            <div>
              <p className="text-xs text-muted-foreground">
                발행일
              </p>
              <p className="text-xs">
                {formattedIssueDate
                  ? format(
                    new Date(formattedIssueDate),
                    'yyyy.MM.dd'
                  )
                  : '-'}
              </p>
            </div>


            <div className="text-right">
              <p className="text-xs text-muted-foreground">
                파일 크기
              </p>
              <p className="text-xs">
                {formatBytes(document.fileSize)}
              </p>
            </div>

          </div>
        </div>

        {/* 버튼 */}
        <div className="flex gap-1.5 mt-3 pt-3 border-t border-border opacity-0 group-hover:opacity-100 transition-opacity">

          <Button
            variant="outline"
            size="sm"
            className="flex-1 h-8 text-sm"
            onClick={() => onPreview(document)}
          >
            <Eye className="w-3 h-3 mr-1" />
            미리보기
          </Button>


          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7"
            onClick={() => {
              window.location.href =
                `/api/file?path=${encodeURIComponent(document.storagePath)}&download=true&downloadName=${encodeURIComponent(getDownloadName(document))}`
            }}
          >
            <Download className="w-3 h-3" />
          </Button>


          {canDelete && (
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7 text-destructive"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="w-3 h-3" />
            </Button>
          )}

        </div>


      </div>


      <DeleteDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        deleting={deleting}
        filename={document.filename}
      />

    </>
  )
}

function DeleteDialog({ open, onClose, onConfirm, deleting, filename }: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  deleting: boolean
  filename: string
}) {
  return (
    <AlertDialog open={open} onOpenChange={v => !v && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>문서 삭제</AlertDialogTitle>
          <AlertDialogDescription>
            <strong>{filename}</strong> 을(를) 삭제하시겠습니까?
            이 작업은 되돌릴 수 없습니다.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>취소</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={deleting}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            {deleting ? '삭제 중...' : '삭제'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
