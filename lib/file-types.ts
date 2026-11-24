import type { DocumentMetadata } from '@/lib/types'

/**
 * 저장되는 값은 예전부터 '성적서'다. 재고·KPI 계산이 이 값으로 출하 문서를 가려내므로 바꾸지 않고,
 * 화면에는 documentTypeLabel()로 '출하성적서'라고 보여 준다.
 */
export const CERTIFICATE_TYPE = '성적서'
export const CERTIFICATE_LABEL = '출하성적서'
export const INCOMING_INSPECTION_TYPE = '수입검사성적서'
export const LOT_CARD_TYPE = '이력카드'
export const DEFAULT_OTHER_TYPE = '기타'

/** 문서 등록·문서탐색기에서 쓰는 재고 관리 문서 3종 (저장값 기준, 흐름 순서) */
export const SHEET_DOCUMENT_TYPES = [INCOMING_INSPECTION_TYPE, LOT_CARD_TYPE, CERTIFICATE_TYPE] as const

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

function compactType(documentType?: string | null) {
  return String(documentType ?? '').replace(/\s+/g, '')
}

/** 출하 성적서('성적서' 또는 화면 이름 '출하성적서') */
export function isCertificate(documentType?: string | null) {
  const value = compactType(documentType)
  return value === CERTIFICATE_TYPE || value === CERTIFICATE_LABEL
}

/** 저장값 → 화면에 보이는 이름. 성적서는 출하성적서로 보인다. */
export function documentTypeLabel(documentType?: string | null) {
  const value = String(documentType ?? '')
  return isCertificate(value) ? CERTIFICATE_LABEL : value
}

/** 화면 이름이든 저장값이든 등록할 수 있는 3종이면 저장값으로, 아니면 null */
export function normalizeSheetDocumentType(documentType?: string | null) {
  if (isCertificate(documentType)) return CERTIFICATE_TYPE
  const value = compactType(documentType)
  return (SHEET_DOCUMENT_TYPES as readonly string[]).includes(value) ? value : null
}

/** PDF로 올리고 업체·품목·LOT 같은 항목을 쓰는 문서(성적서·수입검사성적서·이력카드) */
export function isSheetDocumentType(documentType?: string | null) {
  return normalizeSheetDocumentType(documentType) !== null
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
  // 재고 관리 화면에서 자동 저장된 문서는 수량이 없으므로 올린 이름 그대로 쓴다.
  if (!isCertificate(doc.documentType) || doc.sourceSheetId) {
    const base = String(doc.originalName || doc.filename || '문서').replace(/\.[^.]+$/, '')
    return `${date}_${sanitize(doc.company)}_${sanitize(base)}.${ext}`
  }
  const quantity = doc.quantity != null ? `${doc.quantity}${doc.quantityUnit || 'Kg'}` : '수량없음'
  const product = String(doc.product || '').replace(/\*/g, 'x').replace(/\s+/g, '_')
  return `${date}_${sanitize(doc.company)}_${product}_${quantity}.${ext}`
}
