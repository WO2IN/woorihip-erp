'use client'

import { useState, useTransition } from 'react'
import { Edit2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog'
import { Field, FieldLabel, FieldContent } from '@/components/ui/field'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { FLOOR_OPTIONS, toFloorSelectValue } from '@/lib/floor'

interface NumberFieldDef {
  key: string
  label: string
  defaultValue?: number | null
}

interface SheetHeaderEditorProps {
  id: number
  name: string
  floor?: string
  department: string
  manager: string
  standard?: string
  updateAction: (id: number, data: any) => Promise<any>
  showStandard?: boolean
  standardLabel?: string
  numberFields?: NumberFieldDef[]
}

function buildFormValues(
  name: string,
  department: string,
  manager: string,
  standard: string | undefined,
  floor: string | undefined,
  numberFields: NumberFieldDef[] | undefined,
) {
  const values: Record<string, string> = {
    name,
    department,
    manager,
    standard: standard ?? '',
    floor: toFloorSelectValue(floor, name),
  }

  if (numberFields) {
    for (const field of numberFields) {
      values[field.key] = field.defaultValue != null ? String(field.defaultValue) : ''
    }
  }

  return values
}

export function SheetHeaderEditor({
  id,
  name,
  department,
  manager,
  standard,
  floor,
  updateAction,
  showStandard,
  standardLabel = "관리기준",
  numberFields,
}: SheetHeaderEditorProps) {
  const [open, setOpen] = useState(false)
  const [formValues, setFormValues] = useState<Record<string, string>>(() =>
    buildFormValues(name, department, manager, standard, floor, numberFields),
  )
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setFormValues(buildFormValues(name, department, manager, standard, floor, numberFields))
    }
    setOpen(nextOpen)
  }

  function updateField(key: string, value: string) {
    setFormValues((current) => ({ ...current, [key]: value }))
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const data: Record<string, string | number | null> = {
      name: formValues.name,
      floor: formValues.floor || '',
      department: formValues.department,
      manager: formValues.manager,
    }
    if (showStandard) {
      data.standard = formValues.standard
    }
    if (numberFields) {
      for (const field of numberFields) {
        const raw = formValues[field.key] ?? ''
        data[field.key] = raw === '' ? null : Number(raw)
      }
    }

    startTransition(async () => {
      try {
        await updateAction(id, data)
        toast.success('수정되었습니다.')
        setOpen(false)
        router.refresh()
      } catch (err) {
        toast.error('오류가 발생했습니다.')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        className="no-print ml-2 h-6 w-6 text-muted-foreground hover:text-foreground"
      >
        <Edit2Icon className="h-3 w-3" />
    </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>기본 정보 수정</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <Field>
            <FieldLabel htmlFor="name">항목명 / 설비명</FieldLabel>
            <FieldContent>
              <Input id="name" name="name" value={formValues.name} onChange={(e) => updateField('name', e.target.value)} required />
            </FieldContent>
          </Field>
          <Field>
            <FieldLabel htmlFor="floor">층</FieldLabel>
            <FieldContent>
              <select id="floor" value={formValues.floor ?? ''} onChange={(e) => updateField('floor', e.target.value)} className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm">
                <option value="">미지정</option>
                {FLOOR_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </FieldContent>
          </Field>
          <Field>
            <FieldLabel htmlFor="department">점검부서</FieldLabel>
            <FieldContent>
              <Input id="department" name="department" value={formValues.department} onChange={(e) => updateField('department', e.target.value)} />
            </FieldContent>
          </Field>
          <Field>
            <FieldLabel htmlFor="manager">담당자</FieldLabel>
            <FieldContent>
              <Input id="manager" name="manager" value={formValues.manager} onChange={(e) => updateField('manager', e.target.value)} />
            </FieldContent>
          </Field>
          {showStandard && (
            <Field>
              <FieldLabel htmlFor="standard">{standardLabel}</FieldLabel>
              <FieldContent>
                <Input id="standard" name="standard" value={formValues.standard} onChange={(e) => updateField('standard', e.target.value)} />
              </FieldContent>
            </Field>
          )}
          {numberFields && numberFields.length > 0 && (
            <div className="grid grid-cols-2 gap-4">
              {numberFields.map((field) => (
                <Field key={field.key}>
                  <FieldLabel htmlFor={field.key}>{field.label}</FieldLabel>
                  <FieldContent>
                    <Input
                      id={field.key}
                      name={field.key}
                      type="number"
                      step="0.1"
                      value={formValues[field.key] ?? ''}
                      onChange={(e) => updateField(field.key, e.target.value)}
                    />
                  </FieldContent>
                </Field>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
              취소
            </Button>
            <Button type="submit" disabled={isPending}>
              저장
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
