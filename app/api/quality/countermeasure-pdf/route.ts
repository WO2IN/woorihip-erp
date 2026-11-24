import { NextRequest, NextResponse } from 'next/server'
import { canManageQualityRecords, getUserFromHeaders } from '@/lib/auth'
import type { CountermeasureFile, CustomerNonconformity, ProcessNonconformity } from '@/lib/non-conformity'
import {
  readCustomerNonconformities,
  readProcessNonconformities,
  updateCustomerNonconformity,
  updateProcessNonconformity,
} from '@/lib/storage'
import { getStoredFile, putStoredFile, removeStoredFileObject, softDeleteStoredFile } from '@/lib/stored-files'

const MAX_BYTES = 20 * 1024 * 1024

function isKind(value: unknown): value is 'customer' | 'process' {
  return value === 'customer' || value === 'process'
}

async function findRow(kind: 'customer' | 'process', id: string) {
  const rows = kind === 'customer' ? await readCustomerNonconformities() : await readProcessNonconformities()
  return rows.find((row) => row.id === id) ?? null
}

async function saveFile(kind: 'customer' | 'process', id: string, file: CountermeasureFile | null) {
  const updates = { countermeasureFile: file, updatedAt: new Date().toISOString() }
  return kind === 'customer'
    ? updateCustomerNonconformity(id, updates)
    : updateProcessNonconformity(id, updates)
}

async function discard(file: CountermeasureFile | null | undefined) {
  if (!file?.id) return
  const row = await getStoredFile(file.id)
  if (!row) return
  await removeStoredFileObject(row)
  await softDeleteStoredFile(row.id)
}

export async function POST(req: NextRequest) {
  const user = await getUserFromHeaders(req.headers)
  if (!user || !canManageQualityRecords(user.role)) {
    return NextResponse.json({ error: '관리자만 등록할 수 있습니다.' }, { status: 403 })
  }
  const form = await req.formData().catch(() => null)
  const kind = form?.get('kind')
  const id = typeof form?.get('id') === 'string' ? form.get('id') as string : ''
  const file = form?.get('file')
  if (!isKind(kind) || !id) return NextResponse.json({ error: '대상 항목이 없습니다.' }, { status: 400 })
  if (!(file instanceof File)) return NextResponse.json({ error: 'PDF 파일이 없습니다.' }, { status: 400 })
  const name = file.name.trim() || '대책서.pdf'
  if (file.type !== 'application/pdf' && !name.toLowerCase().endsWith('.pdf')) {
    return NextResponse.json({ error: 'PDF 파일만 올릴 수 있습니다.' }, { status: 400 })
  }
  if (file.size <= 0 || file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'PDF는 20MB까지 올릴 수 있습니다.' }, { status: 400 })
  }
  const current = await findRow(kind, id)
  if (!current) return NextResponse.json({ error: '항목을 찾을 수 없습니다.' }, { status: 404 })

  const stored = await putStoredFile({
    domain: 'quality',
    category: 'countermeasure',
    buffer: Buffer.from(await file.arrayBuffer()),
    mime: 'application/pdf',
    ext: 'pdf',
    originalName: name,
    ownerType: kind === 'customer' ? 'customer-nonconformity' : 'process-nonconformity',
    ownerId: id,
    uploadedBy: user.id,
    uploadedByName: user.displayName,
  })
  const countermeasureFile: CountermeasureFile = { id: stored.id, name }
  const updated = await saveFile(kind, id, countermeasureFile)
  if (!updated) {
    await discard(countermeasureFile)
    return NextResponse.json({ error: '항목을 찾을 수 없습니다.' }, { status: 404 })
  }
  if (current.countermeasureFile?.id && current.countermeasureFile.id !== stored.id) {
    await discard(current.countermeasureFile)
  }
  return NextResponse.json({ data: countermeasureFile })
}

export async function DELETE(req: NextRequest) {
  const user = await getUserFromHeaders(req.headers)
  if (!user || !canManageQualityRecords(user.role)) {
    return NextResponse.json({ error: '관리자만 삭제할 수 있습니다.' }, { status: 403 })
  }
  const body = await req.json().catch(() => ({}))
  const kind = body.kind
  const id = typeof body.id === 'string' ? body.id : ''
  if (!isKind(kind) || !id) return NextResponse.json({ error: '대상 항목이 없습니다.' }, { status: 400 })
  const current = await findRow(kind, id) as (CustomerNonconformity | ProcessNonconformity) | null
  if (!current) return NextResponse.json({ error: '항목을 찾을 수 없습니다.' }, { status: 404 })
  const updated = await saveFile(kind, id, null)
  if (!updated) return NextResponse.json({ error: '항목을 찾을 수 없습니다.' }, { status: 404 })
  await discard(current.countermeasureFile)
  return NextResponse.json({ data: null })
}
