import { NextRequest, NextResponse } from 'next/server'
import { canEdit, getUserFromHeaders } from '@/lib/auth'
import { normalizeChangeRequest, type ChangeRequest } from '@/lib/change-request'
import { decodeAttachments, removeRequestAttachments, storeUploadedAttachments } from '@/lib/change-request-files'
import { getSetting, setSetting } from '@/lib/records'
import { appendAuditLog } from '@/lib/storage'
import type { UserRole } from '@/lib/types'

const KEY = 'development-change-requests'

async function readRows() {
  const rows = await getSetting<unknown>(KEY, [])
  return Array.isArray(rows) ? rows.filter((row): row is ChangeRequest => !!row && typeof row === 'object' && typeof (row as ChangeRequest).id === 'string') : []
}

async function editor(request: NextRequest) {
  const user = await getUserFromHeaders(request.headers)
  const role = user?.role as UserRole | undefined
  if (!user || !role || !canEdit(role)) return null
  return user
}

export async function GET() {
  const rows = await readRows()
  return NextResponse.json({ data: rows })
}

export async function PUT(request: NextRequest) {
  const user = await editor(request)
  if (!user) return NextResponse.json({ error: '수정 권한이 없습니다.' }, { status: 403 })

  const body = await request.json().catch(() => null)
  const rows = await readRows()
  const current = rows.find((row) => row.id === body?.row?.id)
  const next = normalizeChangeRequest(body?.row, current)
  if (!next) return NextResponse.json({ error: '변경요청 내용이 올바르지 않습니다.' }, { status: 400 })
  let uploaded
  try {
    uploaded = decodeAttachments(body?.files)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '첨부는 png, jpg 사진만 올릴 수 있습니다.' }, { status: 400 })
  }
  await storeUploadedAttachments(next, uploaded, current)

  const saved = current ? rows.map((row) => (row.id === next.id ? next : row)) : [next, ...rows]
  await setSetting(KEY, saved)
  await appendAuditLog({
    action: 'UPDATE',
    target: 'development-change-requests',
    detail: typeof body.detail === 'string' && body.detail ? body.detail.slice(0, 200) : `4M 변경요청 저장 · ${next.docNo || next.product || next.id}`,
    userId: user.id,
    userName: user.displayName,
  })
  return NextResponse.json({ data: next })
}

export async function DELETE(request: NextRequest) {
  const user = await editor(request)
  if (!user) return NextResponse.json({ error: '수정 권한이 없습니다.' }, { status: 403 })

  const body = await request.json().catch(() => null)
  const id = typeof body?.id === 'string' ? body.id : ''
  if (!id) return NextResponse.json({ error: '삭제할 변경요청이 없습니다.' }, { status: 400 })

  const rows = await readRows()
  const target = rows.find((row) => row.id === id)
  if (!target) return NextResponse.json({ error: '변경요청을 찾지 못했습니다.' }, { status: 404 })

  await removeRequestAttachments(target)
  await setSetting(KEY, rows.filter((row) => row.id !== id))
  await appendAuditLog({
    action: 'DELETE',
    target: 'development-change-requests',
    detail: `4M 변경요청 삭제 · ${target.docNo || target.product || target.id}`,
    userId: user.id,
    userName: user.displayName,
  })
  return NextResponse.json({ ok: true })
}

export const dynamic = 'force-dynamic'
