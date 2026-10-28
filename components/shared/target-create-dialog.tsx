'use client'

import { useState, useTransition } from 'react'
import { PlusIcon } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog'
import { Field, FieldLabel, FieldError, FieldContent } from '@/components/ui/field'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { FLOOR_OPTIONS } from '@/lib/floor'
import { cn } from '@/lib/utils'

interface TargetCreateDialogProps {
  title: string
  triggerText: string
  createAction: (data: { name: string; floor?: string; department?: string; manager?: string; standard?: string }) => Promise<{ id: number }>
  redirectPathPrefix: string
  triggerClassName?: string
  lockedFloor?: string
}

export function TargetCreateDialog({ title, triggerText, createAction, redirectPathPrefix, triggerClassName, lockedFloor }: TargetCreateDialogProps) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const data = {
      name: formData.get('name') as string,
      floor: lockedFloor || (formData.get('floor') as string),
      department: formData.get('department') as string,
      manager: formData.get('manager') as string,
      standard: formData.get('standard') as string,
    }

    if (!data.name) {
      toast.error('이름을 입력해주세요.')
      return
    }

    startTransition(async () => {
      try {
        const result = await createAction(data)
        toast.success('추가되었습니다.')
        setOpen(false)
        router.refresh()
        router.push(`${redirectPathPrefix}/${result.id}`)
      } catch (err) {
        toast.error('오류가 발생했습니다.')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className={cn(buttonVariants({ variant: 'default' }), triggerClassName)}>
        <PlusIcon data-icon="inline-start" />
        {triggerText}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <Field>
            <FieldLabel htmlFor="name">항목명 / 구역명</FieldLabel>
            <FieldContent>
              <Input id="name" name="name" placeholder="예: 3층 도금라인" required />
            </FieldContent>
          </Field>
          <Field>
            <FieldLabel htmlFor="floor">층</FieldLabel>
            <FieldContent>
              <select id="floor" name="floor" defaultValue={lockedFloor ?? ''} disabled={Boolean(lockedFloor)} className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm disabled:opacity-70">
                {!lockedFloor && <option value="">미지정</option>}
                {FLOOR_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </FieldContent>
          </Field>
          <Field>
            <FieldLabel htmlFor="department">점검부서</FieldLabel>
            <FieldContent>
              <Input id="department" name="department" placeholder="예: 생산팀" />
            </FieldContent>
          </Field>
          <Field>
            <FieldLabel htmlFor="manager">담당자</FieldLabel>
            <FieldContent>
              <Input id="manager" name="manager" placeholder="담당자 이름" />
            </FieldContent>
          </Field>
          <Field>
            <FieldLabel htmlFor="standard">관리기준 (옵션)</FieldLabel>
            <FieldContent>
              <Input id="standard" name="standard" placeholder="기본적으로 적용할 기준 문구" />
            </FieldContent>
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
              취소
            </Button>
            <Button type="submit" disabled={isPending}>
              추가
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
