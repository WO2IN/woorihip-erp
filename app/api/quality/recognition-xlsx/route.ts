import { NextRequest, NextResponse } from 'next/server'
import { getUserFromHeaders } from '@/lib/auth'
import {
  renderRecognitionCertificateDownload,
  type RecognitionCertificateInput,
} from '@/lib/recognition-certificate-excel'

export const runtime = 'nodejs'

type PersonPayload = {
  name?: string
  certNo?: string
  department?: string
  duty?: string
  joinDate?: string
  renewalDate?: string
  issueDate?: string
  photoBase64?: string
  photoMime?: string
  includePhoto?: boolean
  includeSeal?: boolean
}

function toInput(person: PersonPayload): RecognitionCertificateInput | null {
  const name = String(person.name ?? '').trim()
  if (!name) return null
  return {
    name,
    certNo: String(person.certNo ?? '').trim(),
    department: String(person.department ?? '').trim(),
    joinDate: String(person.joinDate ?? '').trim(),
    renewalDate: String(person.renewalDate ?? '').trim(),
    duty: String(person.duty ?? '').trim(),
    issueDate: String(person.issueDate ?? '').trim(),
    photoBase64: person.photoBase64,
    photoMime: person.photoMime,
    includePhoto: person.includePhoto,
    includeSeal: person.includeSeal,
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

  try {
    const { buffer, filename, contentType } = await renderRecognitionCertificateDownload(people)
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : '엑셀 출력에 실패했습니다.'
    return NextResponse.json({ error: message.slice(0, 500) }, { status: 500 })
  }
}
