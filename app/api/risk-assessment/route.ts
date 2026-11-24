import { NextRequest, NextResponse } from 'next/server'
import { canEdit, getUserFromHeaders } from '@/lib/auth'
import { buildSeed, type RiskAssessment, type RiskSettings } from '@/lib/risk/model'
import { deleteRiskAssessment, readRisk, replaceRisk, saveRiskAssessment, saveRiskSettings } from '@/lib/risk/store'

export async function GET(req: NextRequest) {
  const user = await getUserFromHeaders(req.headers)
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  return NextResponse.json(await readRisk())
}

export async function POST(req: NextRequest) {
  const user = await getUserFromHeaders(req.headers)
  if (!user || !canEdit(user.role)) {
    return NextResponse.json({ error: '수정 권한이 없습니다.' }, { status: 403 })
  }
  const body = await req.json().catch(() => ({}))
  const action = String(body.action || '')
  if (action === 'save') {
    const assessment = body.assessment as RiskAssessment
    if (!assessment?.id || !assessment.method || !Array.isArray(assessment.rows)) {
      return NextResponse.json({ error: '평가 내용이 올바르지 않습니다.' }, { status: 400 })
    }
    return NextResponse.json({ assessment: await saveRiskAssessment(assessment) })
  }
  if (action === 'delete') {
    const id = String(body.id || '')
    if (!id) return NextResponse.json({ error: '평가를 지정해 주세요.' }, { status: 400 })
    await deleteRiskAssessment(id)
    return NextResponse.json({ ok: true })
  }
  if (action === 'settings') {
    const settings = body.settings as RiskSettings
    if (!settings?.biz) return NextResponse.json({ error: '사업자 정보가 올바르지 않습니다.' }, { status: 400 })
    return NextResponse.json({ settings: await saveRiskSettings(settings) })
  }
  if (action === 'reset') {
    const seeded = buildSeed()
    return NextResponse.json(await replaceRisk(seeded.settings, seeded.assessments))
  }
  if (action === 'import') {
    const settings = body.settings as RiskSettings
    const assessments = body.assessments as RiskAssessment[]
    if (!settings?.biz || !Array.isArray(assessments)) {
      return NextResponse.json({ error: '백업 형식이 올바르지 않습니다.' }, { status: 400 })
    }
    return NextResponse.json(await replaceRisk(settings, assessments))
  }
  return NextResponse.json({ error: '요청을 처리할 수 없습니다.' }, { status: 400 })
}
