/** 소수 1자리까지 천 단위 구분 */
export function formatNumber1(value: number) {
  return value.toLocaleString('ko-KR', { maximumFractionDigits: 1 })
}

/** 불량률 `12.3%`, 분모가 0 이하면 null */
export function formatDefectRate(defect: number, base: number) {
  if (base <= 0) return null
  return `${formatNumber1((defect / base) * 100)}%`
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
