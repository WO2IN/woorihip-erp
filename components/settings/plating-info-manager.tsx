'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, Download, Loader2, Plus, Save, Search, Trash2, Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { searchText } from '@/lib/product-name'

type Row = { company: string; product: string; material: string; gold: string; nickel: string; fullWidth: string; gap: string; plateWidth: string }
const emptyRow: Row = { company: '', product: '', material: '', gold: '', nickel: '', fullWidth: '', gap: '', plateWidth: '' }
/**
 * 간격·도금폭은 제품 폭 방향 순서대로 최대 3개씩 적는다. 저장은 지금처럼 한 칸에 '12.1/24.8/25.1' 로 이어 붙인다.
 * 전폭은 품목 규격(0.3*68 → 68)에서 가져오므로 입력 칸을 두지 않는다.
 */
const MAX_PARTS = 3
const partsOf = (value: string) => value.split('/').map(part => part.trim())
const partOf = (value: string, index: number) => partsOf(value)[index] ?? ''
function withPart(value: string, index: number, next: string) {
  const parts = Array.from({ length: MAX_PARTS }, (_, i) => partOf(value, i))
  parts[index] = next.replace(/\//g, '').trim()
  while (parts.length && !parts[parts.length - 1]) parts.pop()
  return parts.join('/')
}
type Column = { id: string; label: string; get: (row: Row) => string; set: (row: Row, value: string) => Row }
const field = (key: keyof Row, label: string): Column => ({ id: key, label, get: row => row[key], set: (row, value) => ({ ...row, [key]: value }) })
const part = (key: 'gap' | 'plateWidth', name: string, index: number): Column => ({
  id: `${key}-${index}`,
  label: `${name}${index + 1}`,
  get: row => partOf(row[key], index),
  set: (row, value) => ({ ...row, [key]: withPart(row[key], index, value) }),
})
// 간격1 → 도금폭1 → 간격2 → 도금폭2 … 제품 폭 방향 순서대로 놓는다.
const columns: Column[] = [
  field('company', '업체명'), field('product', '품목'), field('material', '재질'), field('gold', '금도금'), field('nickel', '니켈도금'),
  ...Array.from({ length: MAX_PARTS }, (_, i) => [part('gap', '간격', i), part('plateWidth', '도금폭', i)]).flat(),
]
const columnGrid = 'grid-cols-[1.1fr_1.2fr_1fr_1.1fr_1.1fr_repeat(6,0.55fr)_40px]'

function splitCsvLine(line: string) {
  const values: string[] = []
  let value = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"' && line[i + 1] === '"') { value += '"'; i++ }
    else if (line[i] === '"') quoted = !quoted
    else if (line[i] === ',' && !quoted) { values.push(value.trim()); value = '' }
    else value += line[i]
  }
  values.push(value.trim())
  return values
}

function parseCsv(text: string): Row[] {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean)
  const header = splitCsvLine(lines[0] || '')
  const named = header.includes('업체명') && header.includes('품목')
  const indexOf = (label: string, fallback: number) => {
    const index = header.indexOf(label)
    return named && index >= 0 ? index : fallback
  }
  const companyAt = indexOf('업체명', 0)
  const productAt = indexOf('품목', 1)
  const materialAt = indexOf('재질', 2)
  const goldAt = indexOf('금도금', 3)
  const nickelAt = indexOf('니켈도금', 4)
  const fullWidthAt = indexOf('전폭', 5)
  const gapAt = indexOf('간격', 6)
  const plateWidthAt = indexOf('도금폭', 7)
  return lines.slice(1).map(line => {
    const values = splitCsvLine(line)
    return {
      company: values[companyAt] || '',
      product: values[productAt] || '',
      material: values[materialAt] || '',
      gold: values[goldAt] || '',
      nickel: values[nickelAt] || '',
      fullWidth: values[fullWidthAt] || '',
      gap: values[gapAt] || '',
      plateWidth: values[plateWidthAt] || '',
    }
  })
}

export function PlatingInfoManager() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [query, setQuery] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { fetch('/api/plating-info').then(r => r.json()).then(data => setRows(data.rows || [])).catch(() => toast.error('CSV를 불러오지 못했습니다.')).finally(() => setLoading(false)) }, [])

  const needle = searchText(query.trim())
  const sortedRows = [...rows].map((row, index) => ({ row, index })).sort((a, b) => {
    const column = columns.find(item => item.id === sortKey)
    if (!column) return a.index - b.index
    const comparison = column.get(a.row).localeCompare(column.get(b.row), 'ko', { numeric: true })
    return sortDirection === 'asc' ? comparison : -comparison
  }).filter(({ row }) => !needle || columns.some(column => searchText(column.get(row)).includes(needle)))

  const handleSort = (key: string) => {
    if (sortKey === key) setSortDirection(direction => direction === 'asc' ? 'desc' : 'asc')
    else {
      setSortKey(key)
      setSortDirection('asc')
    }
  }

  const update = (index: number, column: Column, value: string) => setRows(current => current.map((row, i) => i === index ? column.set(row, value) : row))
  const add = () => setRows(current => [{ ...emptyRow }, ...current])
  const remove = (index: number) => setRows(current => current.filter((_, i) => i !== index))

  const save = async () => {
    setSaving(true)
    try {
      const response = await fetch('/api/plating-info', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rows) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      setRows(data.rows); toast.success('도금 정보가 저장되었습니다.')
    } catch (error) { toast.error(error instanceof Error ? error.message : '저장에 실패했습니다.') } finally { setSaving(false) }
  }

  const exportCsv = () => {
    const csv = ['업체명,품목,재질,금도금,니켈도금,전폭,간격,도금폭', ...rows.map(row => [row.company, row.product, row.material, row.gold, row.nickel, row.fullWidth, row.gap, row.plateWidth].map(value => `"${value.replace(/"/g, '""')}"`).join(','))].join('\n')
    const utf8Bom = '\uFEFF'
    const url = URL.createObjectURL(new Blob([utf8Bom + csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'plating-information.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  const importCsv = async (file: File) => {
    const buffer = await file.arrayBuffer()
    const bytes = new Uint8Array(buffer)
    let text: string

    if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
      text = new TextDecoder('utf-8').decode(bytes)
    } else {
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
      } catch {
        text = new TextDecoder('windows-949').decode(bytes)
      }
    }

    const imported = parseCsv(text)
    if (!imported.length) return toast.error('CSV 데이터가 없습니다.')
    setRows(imported)
    toast.success(`${imported.length}개 행을 불러왔습니다. 저장 버튼을 눌러 반영하세요.`)
    if (fileRef.current) fileRef.current.value = ''
  }

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground"><span>업체명·품목·재질·도금두께가 모두 같을 때만 중복으로 처리합니다. {needle ? `검색 ${sortedRows.length}개 / 총 ${rows.length}개` : `총 ${rows.length}개`}</span><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} className="border-sky-500/50 bg-sky-500/10 text-sky-600 hover:bg-sky-500/20 hover:text-sky-700 dark:text-sky-400 dark:hover:text-sky-300"><Upload className="mr-1.5 size-3.5" />CSV 가져오기</Button><input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={e => e.target.files?.[0] && importCsv(e.target.files[0])} /><Button variant="outline" size="sm" onClick={exportCsv} className="border-violet-500/50 bg-violet-500/10 text-violet-600 hover:bg-violet-500/20 hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300"><Download className="mr-1.5 size-3.5" />CSV 내보내기</Button></div></div>
    <label className="relative block">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input value={query} onChange={event => setQuery(event.target.value)} placeholder="업체명, 품목, 재질, 도금, 치수 검색" className="h-9 pr-9 pl-9" aria-label="도금 정보 검색" />
      {query && <button type="button" onClick={() => setQuery('')} className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-muted" aria-label="검색어 지우기"><X className="size-4" /></button>}
    </label>
    <div className="min-w-0 rounded-lg border border-border overflow-hidden">{loading ? <div className="flex h-32 items-center justify-center"><Loader2 className="size-5 animate-spin" /></div> : <div className="h-[min(55vh,460px)] w-full overflow-auto"><div className="min-w-[1080px]"><div className={`grid ${columnGrid} gap-2 border-b bg-muted/40 px-3 py-2 text-xs font-semibold`}>{columns.map(({ id: key, label }) => <button key={key} type="button" onClick={() => handleSort(key)} className="flex items-center gap-1 text-left hover:text-foreground" aria-label={`${label} 정렬`}>{label}{sortKey === key ? (sortDirection === 'asc' ? <ArrowUp className="size-3" aria-hidden="true" /> : <ArrowDown className="size-3" aria-hidden="true" />) : <ArrowUpDown className="size-3 text-muted-foreground" aria-hidden="true" />}</button>)}<span /></div>{sortedRows.length === 0 ? <p className="px-3 py-10 text-center text-sm text-muted-foreground">{needle ? '검색 결과가 없습니다.' : '등록된 도금 정보가 없습니다.'}</p> : sortedRows.map(({ row, index }) => <div key={index} className={`grid ${columnGrid} gap-2 border-b p-2 last:border-0`}>{columns.map(column => <Input key={column.id} aria-label={`${column.label} ${index + 1}행`} value={column.get(row)} onChange={e => update(index, column, e.target.value)} className="h-8 text-xs" />)}<Button variant="ghost" size="icon" className="size-8 text-destructive" onClick={() => remove(index)} aria-label={`${index + 1}행 삭제`}><Trash2 className="size-3.5" /></Button></div>)}</div></div>}</div>
    <div className="flex justify-between"><Button variant="outline" onClick={add}><Plus className="mr-1.5 size-4" />행 추가</Button><Button onClick={save} disabled={saving || loading}>{saving ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Save className="mr-1.5 size-4" />}저장</Button></div>
  </div>
}
