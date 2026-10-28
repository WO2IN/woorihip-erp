export interface AuditDetailView {
  title: string
  lines: string[]
}

const CONFIG_NAMES: Record<string, string> = {
  companies: '업체',
  'document-types': '문서 종류',
  materials: '재질',
  specifications: '규격',
  products: '제품',
  'shipment-categories': '출하 구분',
}

export function describeAuditDetail(log: { action?: string; target?: string; detail?: string }): AuditDetailView {
  const detail = log.detail?.trim() ?? ''
  if (!detail) return { title: '기록된 내용이 없습니다.', lines: [] }

  const known = rewriteKnownDetail(log.action ?? '', log.target ?? '', detail)
  if (known) return known

  const [title, ...lines] = detail.split('\n').map((line) => line.trim()).filter(Boolean)
  return { title: title || detail, lines }
}

function rewriteKnownDetail(action: string, target: string, detail: string): AuditDetailView | null {
  const template = detail.match(/^공정 점검 (추가|삭제|항목 수정) \((.+?)층 \/ (.+)\)$/)
  if (template) {
    const verb = template[1]
    const place = `${template[2].trim()}층 · ${template[3].trim()}`
    const line = verb === '추가'
      ? '공정 점검표를 추가했습니다.'
      : verb === '삭제'
        ? '공정 점검표를 삭제했습니다.'
        : '공정 점검표 항목을 수정했습니다.'
    return { title: place, lines: [line] }
  }

  const check = detail.match(/^공정 점검 (등록|수정|삭제) \((?:ID: [^)]+|(.+?) \/ (.+))\)$/)
  if (check) {
    if (!check[2]) {
      const verb = check[1] === '등록' ? '등록' : check[1] === '삭제' ? '삭제' : '수정'
      return { title: `공정 점검 기록 ${verb}`, lines: [] }
    }
    const verb = check[1] === '등록' ? '점검 기록을 등록했습니다.' : check[1] === '삭제' ? '점검 기록을 삭제했습니다.' : '점검 기록을 수정했습니다.'
    return { title: `${check[2].trim()} · ${check[3].trim()}`, lines: [verb] }
  }

  const documentUpdate = detail.match(/^문서 수정 \(ID: [^)]+\)\n?([\s\S]*)$/)
  if (documentUpdate) {
    const lines = documentUpdate[1].split('\n').map((line) => line.trim()).filter(Boolean)
    return { title: lines[0] ?? '문서 정보를 수정했습니다.', lines: lines.slice(1) }
  }

  if (target === 'config') {
    const splitAt = detail.indexOf(': ')
    if (splitAt > 0) {
      const name = detail.slice(0, splitAt)
      const value = detail.slice(splitAt + 2).trim()
      const label = CONFIG_NAMES[name] ?? name
      const verb = action.toUpperCase() === 'DELETE' ? '삭제' : '추가'
      return { title: value, lines: [`기초정보 ${label} ${verb}`] }
    }
  }

  const idOnly = detail.match(/^(입고 내역 (?:등록|수정|삭제)|입고 수량 수정|입고 내역 수기 등록) \(ID: [^)]+\)$/)
  if (idOnly) {
    return { title: idOnly[1].replace('내역 ', ''), lines: [] }
  }

  if (target === 'document') {
    const file = detail.match(/^(.+?) \(([^/]+)\/([^)]+)\)$/)
    if (file) return { title: file[1].trim(), lines: [`${file[2].trim()} · ${file[3].trim()}`] }
  }

  const nonconformity = detail.match(/^(공정 부적합|고객 부적합) (등록|삭제) \((.+)\)$/)
  if (nonconformity) {
    const verb = nonconformity[2] === '등록' ? '등록했습니다.' : '삭제했습니다.'
    return { title: nonconformity[3].trim(), lines: [`${nonconformity[1]}을 ${verb}`] }
  }

  if (target === 'organization' && detail === '조직도 수정') {
    return { title: '조직도 수정', lines: ['조직 구성을 저장했습니다.'] }
  }

  return null
}
