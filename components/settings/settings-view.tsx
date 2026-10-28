'use client'

import { useCallback, useEffect, useState } from 'react'
import { Building2, ChevronRight, FileType, Layers, Package, Settings2, Sparkles, Table2, Tag, type LucideIcon } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ConfigManager } from './config-manager'
import { PlatingInfoManager } from './plating-info-manager'
import { PageHeader } from '@/components/shared/page-header'
import { cn } from '@/lib/utils'

type Tone = 'blue' | 'violet' | 'green' | 'amber' | 'rose' | 'cyan'

const TONE: Record<Tone, { text: string; soft: string; bar: string }> = {
  blue: { text: 'text-[oklch(0.52_0.19_258)] dark:text-[oklch(0.72_0.16_258)]', soft: 'bg-[oklch(0.52_0.19_258/0.10)] dark:bg-[oklch(0.62_0.18_258/0.18)]', bar: 'bg-[oklch(0.52_0.19_258)]' },
  violet: { text: 'text-[oklch(0.48_0.18_288)] dark:text-[oklch(0.74_0.15_288)]', soft: 'bg-[oklch(0.55_0.18_288/0.12)] dark:bg-[oklch(0.62_0.18_288/0.18)]', bar: 'bg-[oklch(0.55_0.18_288)]' },
  green: { text: 'text-[oklch(0.45_0.15_162)] dark:text-[oklch(0.70_0.15_162)]', soft: 'bg-[oklch(0.58_0.15_162/0.12)] dark:bg-[oklch(0.62_0.15_162/0.18)]', bar: 'bg-[oklch(0.58_0.15_162)]' },
  amber: { text: 'text-[oklch(0.55_0.16_55)] dark:text-[oklch(0.78_0.15_60)]', soft: 'bg-[oklch(0.70_0.16_58/0.14)] dark:bg-[oklch(0.74_0.16_58/0.18)]', bar: 'bg-[oklch(0.70_0.16_58)]' },
  rose: { text: 'text-[oklch(0.55_0.21_25)] dark:text-[oklch(0.72_0.17_25)]', soft: 'bg-[oklch(0.60_0.21_25/0.10)] dark:bg-[oklch(0.62_0.21_25/0.18)]', bar: 'bg-[oklch(0.60_0.21_25)]' },
  cyan: { text: 'text-[oklch(0.50_0.12_215)] dark:text-[oklch(0.75_0.12_215)]', soft: 'bg-[oklch(0.62_0.12_215/0.12)] dark:bg-[oklch(0.65_0.12_215/0.18)]', bar: 'bg-[oklch(0.62_0.12_215)]' },
}

interface SettingsItem {
  key: string
  label: string
  description: string
  icon: LucideIcon
  tone: Tone
  configName: string
  placeholder: string
  unit: string
}

const settingsItems: SettingsItem[] = [
  { key: 'companies', label: '업체 관리', description: '거래처 업체명 목록', icon: Building2, tone: 'blue', configName: 'companies', placeholder: '새 업체명 입력', unit: '곳' },
  { key: 'products', label: '품목 관리', description: '입출고·성적서에 쓰는 품목 목록', icon: Package, tone: 'rose', configName: 'products', placeholder: '새 품목 입력', unit: '종' },
  { key: 'plating-info', label: '도금 정보 관리', description: '업체·품목별 재질과 도금사양 CSV', icon: Table2, tone: 'cyan', configName: 'plating-info', placeholder: '', unit: '건' },
  { key: 'document-types', label: '문서유형 관리', description: '성적서, 도면 등 문서 유형', icon: FileType, tone: 'violet', configName: 'document-types', placeholder: '새 문서유형 입력', unit: '개' },
  { key: 'materials', label: '재질 관리', description: '소재 재질 목록', icon: Layers, tone: 'green', configName: 'materials', placeholder: '새 재질 입력', unit: '개' },
  { key: 'specifications', label: '도금사양 관리', description: '도금사양 목록', icon: Tag, tone: 'amber', configName: 'specifications', placeholder: '새 도금사양 입력', unit: '개' },
  { key: 'shipment-categories', label: '도금 종류 관리', description: '판재, 커넥터, 랙 등 도금 종류', icon: Sparkles, tone: 'rose', configName: 'shipment-categories', placeholder: '새 도금 종류 입력', unit: '개' },
]

const GROUPS = [
  { title: '거래처 · 품목', sub: '입출고와 성적서 등록에서 고르는 기본 목록', keys: ['companies', 'products', 'plating-info'] },
  { title: '문서 · 도금 기준', sub: '문서 분류와 도금 사양 기준값', keys: ['document-types', 'materials', 'specifications', 'shipment-categories'] },
]

interface Summary {
  count: number
  preview: string[]
}

async function loadSummary(item: SettingsItem): Promise<Summary> {
  if (item.key === 'plating-info') {
    const res = await fetch('/api/plating-info')
    const json = await res.json().catch(() => ({}))
    const rows: { company?: string; product?: string }[] = Array.isArray(json.rows) ? json.rows : []
    return { count: rows.length, preview: rows.slice(0, 3).map((r) => [r.company, r.product].filter(Boolean).join(' · ')) }
  }
  const res = await fetch(`/api/config?name=${item.configName}`)
  const json = await res.json().catch(() => ({}))
  const values: unknown[] = Array.isArray(json.data) ? json.data : []
  const names = values.map((v) => (typeof v === 'string' ? v : (v as { name?: string })?.name ?? '')).filter(Boolean)
  return { count: names.length, preview: names.slice(0, 3) }
}

export function SettingsView() {
  const [activeDialog, setActiveDialog] = useState<string | null>(null)
  const [summaries, setSummaries] = useState<Record<string, Summary>>({})

  const active = settingsItems.find(s => s.key === activeDialog)

  const refresh = useCallback(async () => {
    const entries = await Promise.all(settingsItems.map(async (item) => [item.key, await loadSummary(item).catch(() => ({ count: 0, preview: [] }))] as const))
    setSummaries(Object.fromEntries(entries))
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const total = Object.values(summaries).reduce((sum, s) => sum + s.count, 0)

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 p-4 sm:p-6">
      <PageHeader
        tone="slate"
        icon={Settings2}
        eyebrow="SYSTEM · 시스템관리"
        title="기준정보 설정"
        description="업체, 품목, 문서유형, 도금 기준을 한곳에서 관리"
        stat={{ label: '등록된 기준값', value: total.toLocaleString('ko-KR'), unit: '건', sub: `${settingsItems.length}개 항목` }}
      />

      {GROUPS.map((group) => (
        <section key={group.title}>
          <div className="mb-3 flex items-baseline gap-2">
            <h2 className="text-lg font-bold">{group.title}</h2>
            <p className="text-sm text-muted-foreground">{group.sub}</p>
          </div>
          <div className={cn('grid gap-4 sm:grid-cols-2', group.keys.length === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-4')}>
            {group.keys.map((key) => {
              const item = settingsItems.find((s) => s.key === key)!
              const Icon = item.icon
              const tone = TONE[item.tone]
              const summary = summaries[key]
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveDialog(key)}
                  className="group relative flex flex-col overflow-hidden rounded-2xl border bg-card p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
                >
                  <span className={cn('absolute inset-x-0 top-0 h-1', tone.bar)} />
                  <div className="flex items-start justify-between gap-3">
                    <span className={cn('flex h-11 w-11 items-center justify-center rounded-xl', tone.soft)}>
                      <Icon className={cn('h-5 w-5', tone.text)} />
                    </span>
                    <p className="text-right">
                      <span className="text-3xl font-extrabold tabular-nums">{summary ? summary.count.toLocaleString('ko-KR') : '–'}</span>
                      <span className="ml-0.5 text-sm font-semibold text-muted-foreground">{item.unit}</span>
                    </p>
                  </div>
                  <p className="mt-4 text-base font-bold">{item.label}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{item.description}</p>
                  <div className="mt-3 flex min-h-[26px] flex-wrap gap-1.5">
                    {summary?.preview.map((value) => (
                      <span key={value} className="max-w-full truncate rounded-md bg-muted px-2 py-0.5 text-[11.5px] font-medium">{value}</span>
                    ))}
                    {summary && summary.count > summary.preview.length && (
                      <span className="rounded-md px-1 py-0.5 text-[11.5px] text-muted-foreground">외 {summary.count - summary.preview.length}</span>
                    )}
                  </div>
                  <span className={cn('mt-auto inline-flex items-center pt-4 gap-0.5 text-sm font-semibold', tone.text)}>
                    관리하기 <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </button>
              )
            })}
          </div>
        </section>
      ))}

      <Dialog open={!!activeDialog} onOpenChange={v => { if (!v) { setActiveDialog(null); void refresh() } }}>
        <DialogContent className={cn(
          'z-[70] max-h-[calc(100vh-2rem)] max-w-[calc(100vw-2rem)] overflow-hidden',
          active?.key === 'plating-info'
            ? 'w-[calc(100vw-2rem)] sm:w-[1100px] sm:max-w-[1100px]'
            : 'w-full sm:max-w-xl'
        )}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {active && (
                <>
                  <div className={cn('flex h-8 w-8 items-center justify-center rounded-lg', TONE[active.tone].soft)}>
                    <active.icon className={cn('h-4 w-4', TONE[active.tone].text)} />
                  </div>
                  {active.label}
                </>
              )}
            </DialogTitle>
          </DialogHeader>
          {active && active.key === 'plating-info' ? (
            <PlatingInfoManager />
          ) : active ? (
            <ConfigManager
              configName={active.configName}
              label={active.label.replace(' 관리', '')}
              placeholder={active.placeholder}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
