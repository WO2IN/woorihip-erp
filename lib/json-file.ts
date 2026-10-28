import fs from 'node:fs'
import path from 'node:path'

// 읽기 실패를 빈 값으로 넘기면 다음 저장 때 기존 데이터 전체가 빈 값으로 덮어써지므로, 깨진 파일은 반드시 예외로 멈춘다.
export function readJsonFile<T>(file: string, fallback: T): T {
  if (!fs.existsSync(file)) return fallback
  const raw = fs.readFileSync(file, 'utf-8')
  if (!raw.trim()) return fallback
  try {
    return JSON.parse(raw) as T
  } catch (error) {
    const backup = `${file}.corrupt-${Date.now()}`
    fs.copyFileSync(file, backup)
    throw new Error(`${path.basename(file)} 파일을 읽을 수 없습니다. 원본을 ${path.basename(backup)}로 보관했습니다.`, { cause: error })
  }
}

export function writeJsonFile(file: string, data: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8')
  fs.renameSync(tmp, file)
}
