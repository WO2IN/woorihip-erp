import { DEFAULT_FORM_ID, DOC_FORMS, type DocFormKind } from '@/lib/doc-forms'

/** 문서 머리글에서 양식을 고르는 선택 상자. 고른 양식 id는 문서에 저장된다. */
export function DocFormSelect({
  kind,
  value,
  onChange,
  disabled,
}: {
  kind: DocFormKind
  value?: string
  onChange: (formId: string) => void
  disabled?: boolean
}) {
  return (
    <label className="no-print flex items-center gap-1.5 text-[13px] font-semibold text-slate-600 dark:text-slate-300">
      양식
      <select
        value={value || DEFAULT_FORM_ID}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="h-9 rounded-md border border-slate-300 bg-white px-2 text-[14px] font-normal text-slate-900 disabled:opacity-50 dark:border-white/20 dark:bg-slate-900 dark:text-white"
      >
        {DOC_FORMS[kind].map((form) => (
          <option key={form.id} value={form.id}>{form.label}</option>
        ))}
      </select>
    </label>
  )
}
