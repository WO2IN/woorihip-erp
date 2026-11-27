import { NextRequest, NextResponse } from 'next/server'
import { canOperateFloor } from '@/lib/access'
import { canEdit, getUserFromHeaders } from '@/lib/auth'
import { findRecords, patchRecord } from '@/lib/records'
import { linesOf, lineName } from '@/lib/production-lines'
import { appendAuditLog, updateInventory } from '@/lib/storage'
import { findTraceBarcode, stageForStatus, TRACE_BARCODE_COLLECTION } from '@/lib/trace-barcode'
import { type BarcodeStatus, type TraceBarcode } from '@/lib/trace'

export const dynamic = 'force-dynamic'

/** '' = 작업 전 (되돌리기). undefined 로 두면 응답 JSON 에서 빠져 화면이 이전 상태를 그대로 들고 있게 된다. */
type WorkStatus = 'working' | 'done' | ''
type WorkCard = {
  id: string
  floor?: string
  barcode?: string
  lotNo?: string
  partner?: string
  product?: string
  spec?: string
  workStatus?: WorkStatus
  workStartedAt?: string
  workStartedBy?: string
  workDoneAt?: string
  workDoneBy?: string
  /** 이 롤을 작업한 생산 라인 번호 (lib/production-lines). 0 = 안 고름 */
  workLine?: number
}

const str = (value: unknown) => (typeof value === 'string' ? value.trim() : '')
const ACTION_LABEL = { start: '작업 시작', done: '작업 완료', reset: '작업 취소' } as const

/**
 * 현장 작업: 이력카드 한 장(롤 하나)의 작업을 시작·완료·취소한다.
 * 같은 바코드의 이력카드(롤)들을 보고 바코드 상태를 맞춘다.
 *   작업 중인 롤이 있으면 '작업중', 몇 개만 끝나고 진행 중인 롤이 없으면 '대기',
 *   모두 끝나면 '작업완료'를 거쳐 바로 '출하대기'로 넘긴다. (출하완료된 바코드는 건드리지 않는다.)
 */
export async function POST(request: NextRequest) {
  const user = await getUserFromHeaders(request.headers)
  if (!user || !canEdit(user.role)) return NextResponse.json({ error: '작업 상태를 바꿀 권한이 없습니다.' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const id = str(body.id)
  const action = body.action as keyof typeof ACTION_LABEL
  if (!id || !(action in ACTION_LABEL || body.action === 'line')) return NextResponse.json({ error: '요청이 올바르지 않습니다.' }, { status: 400 })

  const [card] = await findRecords<WorkCard>('lot-cards', (row) => row.id === id, 1)
  if (!card) return NextResponse.json({ error: '이력카드를 찾을 수 없습니다.' }, { status: 404 })
  if (!canOperateFloor(user, card.floor ?? '1')) return NextResponse.json({ error: '다른 층 작업은 바꿀 수 없습니다.' }, { status: 403 })

  // 라인 고르기: 작업 상태는 그대로 두고 라인만 바꾼다.
  if (body.action === 'line') {
    const floor = Number(card.floor ?? 1)
    const line = Number(body.line ?? 0)
    if (line && !linesOf(floor).some((item) => item.no === line)) return NextResponse.json({ error: '이 층에 없는 라인입니다.' }, { status: 400 })
    const saved = await patchRecord<WorkCard>('lot-cards', id, { workLine: line })
    if (!saved) return NextResponse.json({ error: '이력카드를 찾을 수 없습니다.' }, { status: 404 })
    await appendAuditLog({
      action: 'UPDATE',
      target: 'lot-card',
      detail: [[str(card.partner), str(card.product) || str(card.spec)].filter(Boolean).join(' · '), `LOT ${str(card.lotNo) || '-'} 라인: ${lineName(floor, line) || '안 고름'}`].join('\n'),
      userId: user.id,
      userName: user.displayName,
    })
    return NextResponse.json({ data: saved })
  }

  const now = new Date().toISOString()
  const patch: Partial<WorkCard> =
    action === 'start'
      ? { workStatus: 'working', workStartedAt: now, workStartedBy: user.displayName, workDoneAt: '', workDoneBy: '' }
      : action === 'done'
        ? { workStatus: 'done', workStartedAt: card.workStartedAt || now, workStartedBy: card.workStartedBy || user.displayName, workDoneAt: now, workDoneBy: user.displayName }
        : { workStatus: '', workStartedAt: '', workStartedBy: '', workDoneAt: '', workDoneBy: '' }
  const updated = await patchRecord<WorkCard>('lot-cards', id, patch)
  if (!updated) return NextResponse.json({ error: '이력카드를 찾을 수 없습니다.' }, { status: 404 })

  // 바코드 상태 맞추기
  const code = str(card.barcode).toUpperCase()
  if (code) {
    const siblings = await findRecords<WorkCard>('lot-cards', (row) => str(row.barcode).toUpperCase() === code)
    const all = siblings.map((row) => (row.id === id ? updated : row))
    const next: BarcodeStatus = all.every((row) => row.workStatus === 'done')
      ? 'shipReady'
      : all.some((row) => row.workStatus === 'working')
        ? 'working'
        : all.some((row) => row.workStatus === 'done')
          ? 'paused'
          : 'received'
    const record = await findTraceBarcode(code)
    if (record && record.status !== next && record.status !== 'shipped') {
      // 작업완료 → 출하대기를 한 번에 넘길 때도 작업완료 기록을 남긴다.
      const entries = next === 'shipReady'
        ? [{ status: 'done' as const, at: now, by: user.displayName }, { status: next, at: now, by: user.displayName }]
        : [{ status: next, at: now, by: user.displayName }]
      await patchRecord<TraceBarcode>(TRACE_BARCODE_COLLECTION, record.id, (current) => ({
        status: next,
        statusLog: [...(current.statusLog ?? []), ...entries].slice(-50),
      }))
      if (record.inventoryId) await updateInventory(record.inventoryId, { workStage: stageForStatus(next) })
    }
  }

  await appendAuditLog({
    action: 'UPDATE',
    target: 'lot-card',
    detail: [[str(card.partner), str(card.product) || str(card.spec)].filter(Boolean).join(' · '), `LOT ${str(card.lotNo) || '-'} ${ACTION_LABEL[action]}`].join('\n'),
    userId: user.id,
    userName: user.displayName,
  })

  return NextResponse.json({ data: updated })
}
