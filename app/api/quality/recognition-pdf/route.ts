import { NextRequest, NextResponse } from 'next/server'
import { getUserFromHeaders } from '@/lib/auth'
import type { RecognitionCertificateInput } from '@/lib/recognition-certificate-excel'
import { buildRecognitionCertificatePdf } from '@/lib/recognition-certificate-pdf'

export const runtime = 'nodejs'

type PersonPayload = {
  name?: string
  department?: string
  duty?: string
  joinDate?: string
  issueDate?: string
  photoBase64?: string
  photoMime?: string
  includePhoto?: boolean
}

function toInput(person: PersonPayload): RecognitionCertificateInput | null {
  const name = String(person.name ?? '').trim()
  if (!name) return null
  return {
    name,
    department: String(person.department ?? '').trim(),
    joinDate: String(person.joinDate ?? '').trim(),
    duty: String(person.duty ?? '').trim(),
    issueDate: String(person.issueDate ?? '').trim(),
    photoBase64: person.photoBase64,
    photoMime: person.photoMime,
    includePhoto: person.includePhoto,
  }
}

export async function POST(request: NextRequest) {
  const user = await getUserFromHeaders(request.headers)
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  let body: { people?: PersonPayload[] }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 })
  }

  const people = (Array.isArray(body.people) ? body.people : [])
    .slice(0, 30)
    .map(toInput)
    .filter((item): item is RecognitionCertificateInput => Boolean(item))

  if (!people.length) {
    return NextResponse.json({ error: '출력할 인원을 선택하세요.' }, { status: 400 })
  }

  if (people.length > 1) {
    return NextResponse.json(
      { error: '인쇄는 한 명씩 출력해 주세요. (체크 대상은 순서대로 인쇄 대화상자가 열립니다.)' },
      { status: 400 },
    )
  }

  try {
    const bytes = await buildRecognitionCertificatePdf(people[0])
    const filename = `자격인정서_${people[0].name}.pdf`
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'PDF 출력에 실패했습니다.'
    return NextResponse.json({ error: message.slice(0, 500) }, { status: 500 })
  }
}
