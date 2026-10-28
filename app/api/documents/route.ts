import { NextRequest, NextResponse } from 'next/server'
import { readMetadata, updateMetadata, appendMetadata, appendAuditLog } from '@/lib/storage'
import { normalizeLot, buildLotEnd } from '@/lib/lot'
import { getUserFromHeaders, canEdit } from '@/lib/auth'
import { canOperateFloor } from '@/lib/access'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)

  const companies = searchParams.getAll('company')
  const documentTypes = searchParams.getAll('documentType')
  const products = searchParams.getAll('product')
  const materials = searchParams.getAll('material')
  const specifications = searchParams.getAll('specification')

  const startDate = searchParams.get('startDate') || ''
  const endDate = searchParams.get('endDate') || ''
  const lotNumber = searchParams.get('lotNumber') || ''
  const query = searchParams.get('query') || ''

  let docs = await readMetadata()


  // =========================
  // 발행일 검색
  // =========================
  if (startDate || endDate) {
    docs = docs.filter(doc => {

      if (!doc.issueDate) return false

      const date = doc.issueDate.replace(/\./g, '-')

      if (startDate && date < startDate) {
        return false
      }

      if (endDate && date > endDate) {
        return false
      }

      return true
    })
  }


  // =========================
  // 업체
  // =========================
  if (companies.length > 0) {
    docs = docs.filter(doc =>
      companies.includes(doc.company)
    )
  }


  // =========================
  // 문서유형
  // =========================
  if (documentTypes.length > 0) {
    docs = docs.filter(doc =>
      documentTypes.includes(doc.documentType)
    )
  }


  // =========================
  // 품목
  // =========================
  if (products.length > 0) {
    docs = docs.filter(doc =>
      doc.product &&
      products.includes(doc.product)
    )
  }


  // =========================
  // 재질
  // =========================
  if (materials.length > 0) {
    docs = docs.filter(doc =>
      doc.material &&
      materials.includes(doc.material)
    )
  }


  // =========================
  // 도금사양
  // =========================
  if (specifications.length > 0) {
    docs = docs.filter(doc =>
      doc.specification &&
      specifications.includes(doc.specification)
    )
  }


  // =========================
  // LOT 번호 검색
  // =========================
  if (lotNumber) {

    const lot = lotNumber.toLowerCase()

    docs = docs.filter(doc => {

      const start =
        doc.lotStart?.toLowerCase() || ''

      const end =
        doc.lotEnd?.toLowerCase() || ''


      return (
        start.includes(lot) ||
        end.includes(lot)
      )
    })
  }


  // =========================
  // 통합 검색
  // =========================
  if (query) {

    const q = query.toLowerCase()


    docs = docs.filter(doc => {

      const fields = [
        doc.company,
        doc.documentType,
        doc.product,
        doc.material,
        doc.specification,
        doc.lotStart,
        doc.lotEnd,
        doc.filename,
        doc.originalName,
        doc.note,
      ]


      return fields.some(value =>
        value?.toLowerCase().includes(q)
      )
    })
  }



  // =========================
  // 발행일 최신순
  // =========================
  docs.sort((a,b)=>{

    const dateA = Number(String(a.issueDate || '').replace(/[^0-9]/g, '').slice(0, 8)) || 0
    const dateB = Number(String(b.issueDate || '').replace(/[^0-9]/g, '').slice(0, 8)) || 0


    return dateB - dateA

  })



  return NextResponse.json({
    data: docs,
    total: docs.length
  })

}




export async function PATCH(req: NextRequest) {
  const requestUser = await getUserFromHeaders(req.headers)
  if (!requestUser || !canEdit(requestUser.role)) {
    return NextResponse.json({ error: '문서 수정 권한이 없습니다.' }, { status: 403 })
  }

  const body = await req.json()

  const { id, ...updates } = body
  const currentDocument = (await readMetadata()).find(document => document.id === id)
  if (currentDocument && ('quantity' in updates || 'floor' in updates)) {
    const nextFloor = updates.floor ?? currentDocument.floor
    if (!canOperateFloor(requestUser, currentDocument.floor) || !canOperateFloor(requestUser, nextFloor)) {
      return NextResponse.json({ error: '다른 층 출고 수량은 수정할 수 없습니다.' }, { status: 403 })
    }
  }

  Object.keys(updates).forEach(key => {
    if (typeof updates[key] === 'string') {
      updates[key] = updates[key].trim()
    }
  })


  if (!id) {

    return NextResponse.json(
      {
        error:'ID가 필요합니다.'
      },
      {
        status:400
      }
    )

  }



  if (updates.lotStart) {

    updates.lotStart =
      normalizeLot(updates.lotStart)

  }



  if (updates.lotEnd) {


    if(updates.lotEnd.includes('-')){

      updates.lotEnd =
        normalizeLot(updates.lotEnd)

    }
    else if(updates.lotStart){

      updates.lotEnd =
        buildLotEnd(
          updates.lotStart,
          updates.lotEnd
        )

    }

  }



  updates.updatedAt = new Date().toISOString()
  updates.updatedBy = requestUser.displayName
  updates.updatedById = requestUser.id

  const success =
    await updateMetadata(id, updates)



  if (success) {
    const fieldLabels: Record<string, string> = {
      company: '업체명',
      documentType: '문서 유형',
      lotStart: 'LOT 시작번호',
      lotEnd: 'LOT 종료번호',
      product: '품목',
      material: '재질',
      specification: '규격',
      shipmentCategory: '도금 종류',
      floor: '층',
      quantity: '수량',
      quantityUnit: '수량 단위',
      issueDate: '발행일',
      note: '비고',
    }
    const changedFields = Object.keys(updates)
      .filter(key => !['updatedAt', 'updatedBy', 'updatedById'].includes(key))
      .filter(key => {
        const previous = currentDocument?.[key as keyof typeof currentDocument]
        const next = updates[key]
        return String(previous ?? '') !== String(next ?? '')
      })
      .map(key => {
        const label = fieldLabels[key] ?? key
        const value = updates[key] === undefined || updates[key] === '' ? '미지정' : String(updates[key])
        const previous = currentDocument?.[key as keyof typeof currentDocument]
        const previousValue = previous === undefined || previous === '' ? '미지정' : String(previous)
        return `${label}: ${previousValue} → ${value}`
      })

    if (changedFields.length === 0) {
      return NextResponse.json({ success: true, message: '변경된 내용이 없습니다.' })
    }

    await appendAuditLog({
      action: 'UPDATE',
      target: 'document',
      detail: `문서 수정 (ID: ${id})\n${changedFields.join('\n')}`,
      userId: requestUser.id,
      userName: requestUser.displayName,
    })
  }

  if(!success){

    return NextResponse.json(
      {
        error:'문서를 찾을 수 없습니다.'
      },
      {
        status:404
      }
    )

  }



  return NextResponse.json({
    success:true
  })

}


export async function POST(req: NextRequest) {
  const requestUser = await getUserFromHeaders(req.headers);
  if (!requestUser || !canEdit(requestUser.role)) {
    return NextResponse.json({ error: '등록 권한이 없습니다.' }, { status: 403 });
  }

  const body = await req.json();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const newDoc = {
    id,
    filename: '수기입력',
    originalName: '수기입력 (파일없음)',
    company: body.company || '',
    documentType: body.documentType || '명세표',
    movementType: body.movementType || '입고',
    floor: Math.min(3, Math.max(1, Number(body.floor) || 1)) as 1 | 2 | 3,
    product: body.product || '',
    quantity: Number(body.quantity) || 0,
    quantityUnit: body.quantityUnit || 'EA',
    issueDate: body.issueDate || now.slice(0, 10),
    lotStart: body.lotStart || '',
    material: body.material || '-',
    fileSize: 0,
    year: (body.issueDate || now).slice(0, 4),
    storagePath: 'MANUAL',
    createdAt: now,
    createdBy: requestUser.displayName,
    createdById: requestUser.id,
  };

  await appendAuditLog({
    action: 'CREATE',
    target: 'document',
    detail: [
      `${newDoc.company || '업체 미지정'} · ${newDoc.product || '품목 미지정'}`,
      `${newDoc.floor}층 · ${newDoc.quantity}${newDoc.quantityUnit} 수기 입고`,
    ].join('\n'),
    userId: requestUser.id,
    userName: requestUser.displayName,
  });

  await appendMetadata(newDoc);

  return NextResponse.json({ success: true, data: newDoc });
}
