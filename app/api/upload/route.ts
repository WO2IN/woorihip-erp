import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { appendMetadata, appendAuditLog } from '@/lib/storage'
import { saveDocumentFile } from '@/lib/object-storage'
import { DocumentMetadata } from '@/lib/types'
import { normalizeLot, normalizeRegisteredLot, buildLotEnd, normalizeIssueDate } from '@/lib/lot'
import { format } from 'date-fns'
import { getUserFromHeaders, canEdit } from '@/lib/auth'
import { CERTIFICATE_TYPE, fileKind, isCertificate } from '@/lib/file-types'

export async function POST(req: NextRequest) {
  const requestUser = await getUserFromHeaders(req.headers)
  if (!requestUser || !canEdit(requestUser.role)) {
    return NextResponse.json({ error: '문서 등록 권한이 없습니다.' }, { status: 403 })
  }
  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: '파일이 없습니다.' }, { status: 400 })
  const MAX_SIZE = 50 * 1024 * 1024
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: '파일 크기는 50MB를 초과할 수 없습니다.' }, { status: 400 })
  }

  const company = (formData.get('company') as string)?.trim()
  const rawDocumentType = (formData.get('documentType') as string)?.trim()
  const certificate = isCertificate(rawDocumentType)
  if (!certificate) {
    return NextResponse.json({ error: '도면과 기타 문서는 테스트 중이라 아직 등록할 수 없습니다.' }, { status: 400 })
  }
  const documentType = CERTIFICATE_TYPE
  const kind = fileKind(file.name)
  if (!kind) {
    return NextResponse.json({ error: '지원하지 않는 파일 형식입니다.' }, { status: 400 })
  }
  if (certificate && kind.ext !== 'pdf') {
    return NextResponse.json({ error: '성적서는 PDF 파일만 올릴 수 있습니다.' }, { status: 400 })
  }
  const shipmentCategoryRaw = (formData.get('shipmentCategory') as string)?.trim()
  const shipmentFloorRaw = (formData.get('shipmentFloor') as string)?.trim()
  const userFloor = requestUser.floor
  // 사용자에게 층이 지정되어 있으면 클라이언트가 보낸 값보다 서버의 로그인 정보를 우선합니다.
  const effectiveFloor = userFloor ?? (
    ['1', '2', '3'].includes(shipmentFloorRaw)
      ? Number(shipmentFloorRaw) as 1 | 2 | 3
      : undefined
  )
  const shipmentFloor = effectiveFloor
  // 층은 기본값을 정하는 데만 사용하고, 사용자가 선택한 신규 분류를 덮어쓰지 않습니다.
  const shipmentCategory = shipmentCategoryRaw || undefined
  const lotStart = normalizeRegisteredLot(normalizeLot(formData.get('lotStart') as string))
  const lotEndRaw = normalizeLot(formData.get('lotEnd') as string)
  const lotEnd = lotEndRaw.includes('-')
    ? lotEndRaw
    : lotStart && lotEndRaw
      ? buildLotEnd(lotStart, lotEndRaw)
      : lotEndRaw
  const product = (formData.get('product') as string) || ''
  const material = (formData.get('material') as string) || ''
  const specification = (formData.get('specification') as string) || ''
  const quantity = formData.get('quantity') ? Number(formData.get('quantity')) : undefined
  const quantityUnitRaw = (formData.get('quantityUnit') as string)?.trim()
  const quantityUnit = ['Kg', 'EA', 'R'].includes(quantityUnitRaw)
    ? quantityUnitRaw as DocumentMetadata['quantityUnit']
    : undefined
  const issueDate = (formData.get('issueDate') as string) || ''
  const note = (formData.get('note') as string) || ''
  const movementRaw = (formData.get('movementType') as string)?.trim()
  const movementType = movementRaw === '입고' || movementRaw === '출고' ? movementRaw : undefined
  const linkedMovementId = (formData.get('linkedMovementId') as string)?.trim() || undefined

  if (!company || !documentType) {
    return NextResponse.json({ error: '업체명과 문서유형은 필수입니다.' }, { status: 400 })
  }

  // 저장 전 서버에서도 발행일 형식과 실제 날짜를 검증합니다.
  let effectiveDate: string
  try {
    effectiveDate = issueDate === '-'
      ? format(new Date(), 'yyyy-MM-dd')
      : normalizeIssueDate(issueDate) || format(new Date(), 'yyyy-MM-dd')
  } catch {
    // 잘못된 발행일도 문서 등록은 허용하고, 표시값은 미지정(-)으로 저장합니다.
    effectiveDate = format(new Date(), 'yyyy-MM-dd')
  }
  const dateStr = effectiveDate.replace(/-/g, '')
  const lotPart = lotStart
  ? (lotEnd ? `${lotStart}_${lotEnd}` : lotStart)
  : format(new Date(), 'HHmmss')

  // 파일명에 사용할 제품명 정리
  const safeProduct = product
    ? product.replace(/[<>:"/\\|?*]/g, '_').trim()
    : '미지정'

  // 날짜 + 제품명 + LOT + UUID로 파일명 생성
  const generatedName =
    `${dateStr}_${safeProduct}_${lotPart}_${uuidv4()}.${kind.ext}`

  const year = effectiveDate.split('-')[0]
  const storagePath = [company, documentType, year, generatedName].join('/')
  const buffer = Buffer.from(await file.arrayBuffer())
  await saveDocumentFile(storagePath, buffer, kind.mime)

  const doc: DocumentMetadata = {
    id: uuidv4(),
    filename: generatedName,
    originalName: file.name,
    company,
    documentType,
    product,
    lotStart: certificate ? lotStart : '',
    material: certificate ? material : '',
    ...(certificate ? {
      movementType,
      linkedMovementId,
      shipmentCategory,
      shipmentFloor,
      floor: shipmentFloor,
      lotEnd: lotEnd || undefined,
      specification: specification || undefined,
      quantity,
      quantityUnit,
    } : {}),
    issueDate: issueDate === '-' ? '-' : effectiveDate,
    note: note || undefined,
    fileSize: file.size,
    year,
    storagePath,
    createdAt: new Date().toISOString(),
    createdBy: requestUser.displayName,
    createdById: requestUser.id,
  }

  await appendMetadata(doc)
  await appendAuditLog({
    action: 'UPLOAD',
    target: 'document',
    detail: `${doc.originalName} (${doc.company}/${doc.documentType})`,
    userId: requestUser.id,
    userName: requestUser.displayName,
  })

  return NextResponse.json({ success: true, data: doc })
}
