import { ensureSetup, query } from './db'

/** 층 담당자의 오늘 업무 한 건. done 은 시스템 기록 기준 자동 판정에 사용자가 직접 전환한 값을 반영한 최종 상태. */
export type FloorTask = {
  key: string
  label: string
  href: string
  detail: string
  done: boolean
}

function ensureTable() {
  return ensureSetup('my-task-checks', async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS my_task_checks (
        user_id text NOT NULL,
        task_date text NOT NULL,
        task_key text NOT NULL,
        done boolean NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, task_date, task_key)
      )
    `)
  })
}

export async function readMyTaskChecks(userId: string, date: string): Promise<Record<string, boolean>> {
  await ensureTable()
  const rows = await query<{ task_key: string; done: boolean }>(
    'SELECT task_key, done FROM my_task_checks WHERE user_id = $1 AND task_date = $2',
    [userId, date],
  )
  return Object.fromEntries(rows.map((row) => [row.task_key, row.done]))
}

export async function writeMyTaskCheck(userId: string, date: string, key: string, done: boolean) {
  await ensureTable()
  await query(
    `INSERT INTO my_task_checks (user_id, task_date, task_key, done, updated_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (user_id, task_date, task_key)
     DO UPDATE SET done = EXCLUDED.done, updated_at = now()`,
    [userId, date, key, done],
  )
}

/** 사용자가 직접 전환한 값이 있으면 그 값을 우선하고, 없으면 시스템 자동 판정을 그대로 쓴다. */
export function applyTaskChecks(tasks: FloorTask[], checks: Record<string, boolean>): FloorTask[] {
  return tasks.map((task) => (task.key in checks ? { ...task, done: checks[task.key] } : task))
}
