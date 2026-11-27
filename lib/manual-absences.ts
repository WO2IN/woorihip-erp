import { isIsoDate } from '@/lib/date-nav'

// 관리자가 결재 없이 직접 등록하는 출장·연차·반차 기록.
export const MANUAL_ABSENCES_COLLECTION = 'manual_absences'
export const MANUAL_ABSENCE_KINDS = ['출장', '연차', '반차'] as const
export const MANUAL_ABSENCE_NAME_MAX = 20
export const MANUAL_ABSENCE_PLACE_MAX = 40
export const MANUAL_ABSENCE_REASON_MAX = 200

export type ManualAbsenceKind = (typeof MANUAL_ABSENCE_KINDS)[number]

export interface ManualAbsence {
  id: string
  kind: ManualAbsenceKind
  name: string
  start: string
  end: string
  place?: string
  reason?: string
  createdAt: string
  createdBy: string
}

type Draft = Omit<ManualAbsence, 'id' | 'createdAt' | 'createdBy'>

/** 요청 본문을 검증한다. 잘못되면 사용자에게 보여줄 메시지를 돌려준다. */
export function parseManualAbsence(body: unknown): { value: Draft } | { error: string } {
  const raw = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const kind = raw.kind
  if (!MANUAL_ABSENCE_KINDS.includes(kind as ManualAbsenceKind)) return { error: '구분을 선택해 주세요.' }
  const name = typeof raw.name === 'string' ? raw.name.trim() : ''
  if (!name) return { error: '이름을 입력해 주세요.' }
  if (name.length > MANUAL_ABSENCE_NAME_MAX) return { error: `이름은 ${MANUAL_ABSENCE_NAME_MAX}자 이내로 입력해 주세요.` }
  const start = raw.start
  const end = raw.end
  if (!isIsoDate(start) || !isIsoDate(end)) return { error: '기간을 입력해 주세요.' }
  if (start > end) return { error: '종료일은 시작일 이후여야 합니다.' }
  const place = typeof raw.place === 'string' ? raw.place.trim() : ''
  if (place.length > MANUAL_ABSENCE_PLACE_MAX) return { error: `출장지는 ${MANUAL_ABSENCE_PLACE_MAX}자 이내로 입력해 주세요.` }
  const reason = typeof raw.reason === 'string' ? raw.reason.trim() : ''
  if (reason.length > MANUAL_ABSENCE_REASON_MAX) return { error: `사유는 ${MANUAL_ABSENCE_REASON_MAX}자 이내로 입력해 주세요.` }
  return {
    value: {
      kind: kind as ManualAbsenceKind,
      name,
      start,
      end,
      ...(place ? { place } : {}),
      ...(reason ? { reason } : {}),
    },
  }
}
