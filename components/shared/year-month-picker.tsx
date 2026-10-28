'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface YearMonthPickerProps {
  year: number
  month: number
}

export function YearMonthPicker({ year, month }: YearMonthPickerProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function update(nextYear: number, nextMonth: number) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('year', String(nextYear))
    params.set('month', String(nextMonth))
    router.push(`${pathname}?${params.toString()}`)
  }

  const years = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - 2 + i)
  const months = Array.from({ length: 12 }, (_, i) => i + 1)

  return (
    <div className="no-print flex items-center gap-2">
      <Select value={String(year)} onValueChange={(v) => update(Number(v), month)}>
        <SelectTrigger className="w-24">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {years.map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}년
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <Select value={String(month)} onValueChange={(v) => update(year, Number(v))}>
        <SelectTrigger className="w-20">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {months.map((m) => (
              <SelectItem key={m} value={String(m)}>
                {m}월
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  )
}
