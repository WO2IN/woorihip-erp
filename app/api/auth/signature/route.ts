import { NextRequest, NextResponse } from 'next/server'
import { findUserById, getUserFromHeaders, toPublicUser, writeUserSignature, readUserSignature } from '@/lib/auth'
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
  const id = requested && /^[a-zA-Z0-9-]{8,80}$/.test(requested) ? requested : user.id
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

export async function PUT(request: NextRequest) {
  const user = await currentUser(request)
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: '서명 그림을 선택해 주세요.' }, { status: 400 })
  if (file.size > 2 * 1024 * 1024) return NextResponse.json({ error: '서명 그림은 2MB까지 올릴 수 있습니다.' }, { status: 400 })

  const png = await prepareSignature(Buffer.from(await file.arrayBuffer()))
  if (!png) return NextResponse.json({ error: 'png, jpg 그림만 서명으로 저장할 수 있습니다.' }, { status: 400 })
  await writeUserSignature(user.id, png)
  return NextResponse.json({ ok: true, user: toPublicUser({ ...user, hasSignature: true }) })
}

export async function DELETE(request: NextRequest) {
  const user = await currentUser(request)
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  await writeUserSignature(user.id, null)
  return NextResponse.json({ ok: true, user: toPublicUser({ ...user, hasSignature: false }) })
}

export const dynamic = 'force-dynamic'
