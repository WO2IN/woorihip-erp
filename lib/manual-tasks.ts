// 대시보드 업무대기에 사용자가 직접 등록하는 업무.
export const MANUAL_TASKS_COLLECTION = 'manual_tasks'
export const MANUAL_TASK_TITLE_MAX = 60
export const MANUAL_TASK_MEMO_MAX = 200

export interface ManualTask {
  id: string
  title: string
  memo?: string
  done: boolean
  createdAt: string
  createdBy: string
  createdById: string
}

/** 요청 본문을 검증한다. 잘못되면 사용자에게 보여줄 메시지를 돌려준다. */
export function parseManualTask(body: unknown): { value: { title: string; memo?: string } } | { error: string } {
  const raw = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const title = typeof raw.title === 'string' ? raw.title.trim() : ''
  if (!title) return { error: '업무 내용을 입력해 주세요.' }
  if (title.length > MANUAL_TASK_TITLE_MAX) return { error: `업무 내용은 ${MANUAL_TASK_TITLE_MAX}자 이내로 입력해 주세요.` }
  const memo = typeof raw.memo === 'string' ? raw.memo.trim() : ''
  if (memo.length > MANUAL_TASK_MEMO_MAX) return { error: `메모는 ${MANUAL_TASK_MEMO_MAX}자 이내로 입력해 주세요.` }
  return { value: { title, ...(memo ? { memo } : {}) } }
}
