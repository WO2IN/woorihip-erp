import { NextRequest, NextResponse } from 'next/server'
import { findUserById, getUserFromHeaders, toPublicUser, writeUserSignature, readUserSignature, canManageUsers } from '@/lib/auth'
import { prepareSignature } from '@/lib/signature'

async function currentUser(request: NextRequest) {
  const session = await getUserFromHeaders(request.headers)
  if (!session) return null
  return findUserById(session.id)
}

export async function GET(request: NextRequest) {
  const user = await currentUser(request)
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  const requested = request.nextUrl.searchParams.get('userId')
  let id = user.id
  if (requested && /^[a-f0-9-]{36}$/i.test(requested)) {
    if (requested !== user.id && !canManageUsers(user.role)) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
    }
    id = requested
  }
  const image = await readUserSignature(id)
  if (!image) return new NextResponse(null, { status: 404 })
  const prepared = await prepareSignature(image)
  return new NextResponse(new Uint8Array(prepared ?? image), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'private, no-store',
    },
  })
}

function resolveSignatureTargetId(sessionUser: NonNullable<Awaited<ReturnType<typeof currentUser>>>, requested: string | null) {
  if (!requested || !/^[a-f0-9-]{36}$/i.test(requested) || requested === sessionUser.id) {
    return sessionUser.id
  }
  if (!canManageUsers(sessionUser.role)) {
    return null
  }
  return requested
}

export async function PUT(request: NextRequest) {
  const user = await currentUser(request)
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  const requested = typeof form?.get('userId') === 'string' ? String(form.get('userId')) : null
  const targetId = resolveSignatureTargetId(user, requested)
  if (!targetId) return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
  if (!(file instanceof File)) return NextResponse.json({ error: '서명 그림을 선택해 주세요.' }, { status: 400 })
  if (file.size > 2 * 1024 * 1024) return NextResponse.json({ error: '서명 그림은 2MB까지 올릴 수 있습니다.' }, { status: 400 })

  const png = await prepareSignature(Buffer.from(await file.arrayBuffer()))
  if (!png) return NextResponse.json({ error: 'png, jpg 그림만 서명으로 저장할 수 있습니다.' }, { status: 400 })
  await writeUserSignature(targetId, png)
  const updated = await findUserById(targetId)
  if (!updated) return NextResponse.json({ error: '사용자를 찾을 수 없습니다.' }, { status: 404 })
  return NextResponse.json({ ok: true, user: toPublicUser(updated) })
}

export async function DELETE(request: NextRequest) {
  const user = await currentUser(request)
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  const requested = request.nextUrl.searchParams.get('userId')
  const targetId = resolveSignatureTargetId(user, requested)
  if (!targetId) return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
  await writeUserSignature(targetId, null)
  const updated = await findUserById(targetId)
  if (!updated) return NextResponse.json({ error: '사용자를 찾을 수 없습니다.' }, { status: 404 })
  return NextResponse.json({ ok: true, user: toPublicUser(updated) })
}

export const dynamic = 'force-dynamic'
