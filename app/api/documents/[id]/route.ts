import { NextRequest, NextResponse } from 'next/server'
import {
  deleteMetadata,
  appendAuditLog,
  readMetadata,
  readConfig,
  writeConfig,
} from '@/lib/storage'
import { removeDocumentFile } from '@/lib/object-storage'
import { getUserFromHeaders, canEdit } from '@/lib/auth'

const CONFIG_FIELDS = {
  companies: 'company',
  'document-types': 'documentType',
  materials: 'material',
  specifications: 'specification',
  products: 'product',
} as const


async function cleanupUnusedConfigValues() {
  const documents = await readMetadata()

  for (const [configName, field] of Object.entries(CONFIG_FIELDS)) {
    const configValues = await readConfig(configName)

    const usedValues = new Set(
      documents
        .map(doc => doc[field])
        .filter(
          (value): value is string =>
            typeof value === 'string' &&
            value.trim().length > 0
        )
    )

    const filtered = configValues.filter(value =>
      usedValues.has(value)
    )

    if (filtered.length !== configValues.length) {
      await writeConfig(configName, filtered)
    }
  }
}


export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestUser = await getUserFromHeaders(req.headers)
  if (!requestUser || !canEdit(requestUser.role)) {
    return NextResponse.json({ error: '문서 삭제 권한이 없습니다.' }, { status: 403 })
  }

  const { id } = await params

  const existing = (await readMetadata()).find((doc) => doc.id === id)
  if (!existing) {
    return NextResponse.json(
      { error: '문서를 찾을 수 없습니다.' },
      { status: 404 }
    )
  }

  try {
    await removeDocumentFile(existing.storagePath)
  } catch (err) {
    console.error('파일 삭제 실패:', err)
    return NextResponse.json({ error: '파일 삭제에 실패했습니다.' }, { status: 500 })
  }

  const removed = await deleteMetadata(id)
  if (!removed) {
    return NextResponse.json(
      { error: '문서를 찾을 수 없습니다.' },
      { status: 404 }
    )
  }

  // 사용하지 않는 설정값 자동 제거
  await cleanupUnusedConfigValues()
  await appendAuditLog({
    action: 'DELETE',
    target: 'document',
    detail: `${removed.originalName} (문서 ID ${removed.id})`,
    userId: requestUser.id,
    userName: requestUser.displayName,
  })

  return NextResponse.json({
    success: true,
  })
}
