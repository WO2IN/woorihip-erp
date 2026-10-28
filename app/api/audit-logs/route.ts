import { NextRequest, NextResponse } from 'next/server'
import { getUserFromHeaders } from '@/lib/auth'
import { deleteAuditLog, readAuditLogs } from '@/lib/storage'

export async function GET(request: NextRequest) {
  const user = await getUserFromHeaders(request.headers)
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
  }

  const limit = Math.min(Number(new URL(request.url).searchParams.get('limit')) || 200, 500)
  return NextResponse.json({ data: (await readAuditLogs()).slice(0, limit) })
}

export async function DELETE(request: NextRequest) {
  const user = await getUserFromHeaders(request.headers)
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: '로그를 삭제할 권한이 없습니다.' }, { status: 403 })
  }

  const { id } = await request.json()
  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: '삭제할 로그를 지정해 주세요.' }, { status: 400 })
  }

  if (!await deleteAuditLog(id)) {
    return NextResponse.json({ error: '로그를 찾을 수 없습니다.' }, { status: 404 })
  }

  return NextResponse.json({ success: true })
}

export const dynamic = 'force-dynamic'
