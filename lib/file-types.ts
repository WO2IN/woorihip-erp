import type { DocumentMetadata } from '@/lib/types'

export const CERTIFICATE_TYPE = '성적서'
export const DEFAULT_OTHER_TYPE = '기타'

type Preview = 'pdf' | 'image' | null

const FILE_KINDS: Record<string, { mime: string; label: string; preview: Preview }> = {
  pdf: { mime: 'application/pdf', label: 'PDF', preview: 'pdf' },
  xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', label: 'Excel', preview: null },
  xls: { mime: 'application/vnd.ms-excel', label: 'Excel', preview: null },
  csv: { mime: 'text/csv', label: 'CSV', preview: null },
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', label: 'Word', preview: null },
  doc: { mime: 'application/msword', label: 'Word', preview: null },
  pptx: { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', label: 'PPT', preview: null },
  ppt: { mime: 'application/vnd.ms-powerpoint', label: 'PPT', preview: null },
  hwp: { mime: 'application/x-hwp', label: '한글', preview: null },
  hwpx: { mime: 'application/hwp+zip', label: '한글', preview: null },
  txt: { mime: 'text/plain', label: 'TXT', preview: null },
  zip: { mime: 'application/zip', label: 'ZIP', preview: null },
  jpg: { mime: 'image/jpeg', label: '이미지', preview: 'image' },
  jpeg: { mime: 'image/jpeg', label: '이미지', preview: 'image' },
  png: { mime: 'image/png', label: '이미지', preview: 'image' },
  webp: { mime: 'image/webp', label: '이미지', preview: 'image' },
}

export const ACCEPT_ALL_FILES = Object.keys(FILE_KINDS).map(ext => `.${ext}`).join(',')
export const ACCEPT_CERTIFICATE = '.pdf,application/pdf'

export function fileExtension(name?: string | null) {
  const match = String(name ?? '').toLowerCase().match(/\.([a-z0-9]+)$/)
  return match ? match[1] : ''
}

export function fileKind(name?: string | null) {
  const ext = fileExtension(name)
  const kind = FILE_KINDS[ext]
  return kind ? { ext, ...kind } : null
}

export function isCertificate(documentType?: string | null) {
  return String(documentType ?? '').replace(/\s+/g, '') === CERTIFICATE_TYPE
}

/** 저장된 문서의 실제 파일 경로(storagePath)가 기준이고, 없으면 원본 이름을 본다. */
export function documentFileKind(doc: Pick<DocumentMetadata, 'storagePath' | 'originalName' | 'filename'>) {
  return fileKind(doc.storagePath) ?? fileKind(doc.filename) ?? fileKind(doc.originalName)
}

function sanitize(value: string) {
  return value.replace(/[\\/:*?"<>|\r\n]/g, '_').replace(/\s+/g, '_').trim() || '미입력'
}

export function documentDownloadName(doc: DocumentMetadata) {
  const ext = documentFileKind(doc)?.ext || 'pdf'
  const date = String(doc.issueDate || '').replace(/[^0-9]/g, '').slice(0, 8) || '날짜없음'
  if (!isCertificate(doc.documentType)) {
    const base = String(doc.originalName || doc.filename || '문서').replace(/\.[^.]+$/, '')
    return `${date}_${sanitize(doc.company)}_${sanitize(base)}.${ext}`
  }
  const quantity = doc.quantity != null ? `${doc.quantity}${doc.quantityUnit || 'Kg'}` : '수량없음'
  const product = String(doc.product || '').replace(/\*/g, 'x').replace(/\s+/g, '_')
  return `${date}_${sanitize(doc.company)}_${product}_${quantity}.${ext}`
}
