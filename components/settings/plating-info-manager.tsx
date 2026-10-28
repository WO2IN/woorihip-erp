'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, Download, Loader2, Plus, Save, Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'

type Row = { company: string; product: string; material: string; gold: string; nickel: string }
const emptyRow: Row = { company: '', product: '', material: '', gold: '', nickel: '' }
const columns: Array<[keyof Row, string]> = [['company', '업체명'], ['product', '품목'], ['material', '재질'], ['gold', '금도금'], ['nickel', '니켈도금']]

function parseCsv(text: string): Row[] {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean)
  return lines.slice(1).map(line => {
    const values: string[] = []; let value = ''; let quoted = false
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"' && line[i + 1] === '"') { value += '"'; i++ }
      else if (line[i] === '"') quoted = !quoted
      else if (line[i] === ',' && !quoted) { values.push(value.trim()); value = '' }
      else value += line[i]
    }
    values.push(value.trim())
    return { company: values[0] || '', product: values[1] || '', material: values[2] || '', gold: values[3] || '', nickel: values[4] || '' }
  })
}

export function PlatingInfoManager() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [sortKey, setSortKey] = useState<keyof Row | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { fetch('/api/plating-info').then(r => r.json()).then(data => setRows(data.rows || [])).catch(() => toast.error('CSV를 불러오지 못했습니다.')).finally(() => setLoading(false)) }, [])

  const sortedRows = [...rows].map((row, index) => ({ row, index })).sort((a, b) => {
    if (!sortKey) return a.index - b.index
    const comparison = a.row[sortKey].localeCompare(b.row[sortKey], 'ko')
    return sortDirection === 'asc' ? comparison : -comparison
  })

  const handleSort = (key: keyof Row) => {
    if (sortKey === key) setSortDirection(direction => direction === 'asc' ? 'desc' : 'asc')
    else {
      setSortKey(key)
      setSortDirection('asc')
    }
  }

  const update = (index: number, key: keyof Row, value: string) => setRows(current => current.map((row, i) => i === index ? { ...row, [key]: value } : row))
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
    const csv = ['업체명,품목,재질,금도금,니켈도금', ...rows.map(row => [row.company, row.product, row.material, row.gold, row.nickel].map(value => `"${value.replace(/"/g, '""')}"`).join(','))].join('\n')
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
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground"><span>업체명·품목·재질·도금두께가 모두 같을 때만 중복으로 처리합니다. 총 {rows.length}개</span><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} className="border-sky-500/50 bg-sky-500/10 text-sky-600 hover:bg-sky-500/20 hover:text-sky-700 dark:text-sky-400 dark:hover:text-sky-300"><Upload className="mr-1.5 size-3.5" />CSV 가져오기</Button><input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={e => e.target.files?.[0] && importCsv(e.target.files[0])} /><Button variant="outline" size="sm" onClick={exportCsv} className="border-violet-500/50 bg-violet-500/10 text-violet-600 hover:bg-violet-500/20 hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300"><Download className="mr-1.5 size-3.5" />CSV 내보내기</Button></div></div>
    <div className="min-w-0 rounded-lg border border-border overflow-hidden">{loading ? <div className="flex h-32 items-center justify-center"><Loader2 className="size-5 animate-spin" /></div> : <div className="h-[min(55vh,460px)] w-full overflow-auto"><div className="min-w-[800px]"><div className="grid grid-cols-[1.1fr_1.1fr_1fr_1fr_1fr_40px] gap-2 border-b bg-muted/40 px-3 py-2 text-xs font-semibold">{columns.map(([key, label]) => <button key={key} type="button" onClick={() => handleSort(key)} className="flex items-center gap-1 text-left hover:text-foreground" aria-label={`${label} 정렬`}>{label}{sortKey === key ? (sortDirection === 'asc' ? <ArrowUp className="size-3" aria-hidden="true" /> : <ArrowDown className="size-3" aria-hidden="true" />) : <ArrowUpDown className="size-3 text-muted-foreground" aria-hidden="true" />}</button>)}<span /></div>{sortedRows.map(({ row, index }) => <div key={index} className="grid grid-cols-[1.1fr_1.1fr_1fr_1fr_1fr_40px] gap-2 border-b p-2 last:border-0">{columns.map(([key, label]) => <Input key={key} aria-label={`${label} ${index + 1}행`} value={row[key]} onChange={e => update(index, key, e.target.value)} className="h-8 text-xs" />)}<Button variant="ghost" size="icon" className="size-8 text-destructive" onClick={() => remove(index)} aria-label={`${index + 1}행 삭제`}><Trash2 className="size-3.5" /></Button></div>)}</div></div>}</div>
    <div className="flex justify-between"><Button variant="outline" onClick={add}><Plus className="mr-1.5 size-4" />행 추가</Button><Button onClick={save} disabled={saving || loading}>{saving ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Save className="mr-1.5 size-4" />}저장</Button></div>
  </div>
}
