/** 수입검사 성적서·이력카드·출하성적서의 양식 목록. 양식 2 이후는 아직 미정이라 자리만 잡아 둔다. */
export type DocFormKind = 'incoming' | 'lot-card' | 'outgoing'

export const DEFAULT_FORM_ID = 'basic'

export const DOC_FORMS: Record<DocFormKind, { id: string; label: string }[]> = {
  incoming: [
    { id: DEFAULT_FORM_ID, label: '기본 양식' },
    { id: 'form-2', label: '양식 2 (미정)' },
  ],
  'lot-card': [
    { id: DEFAULT_FORM_ID, label: '기본 양식' },
    { id: 'form-2', label: '양식 2 (미정)' },
  ],
  outgoing: [
    { id: DEFAULT_FORM_ID, label: '양식 1 (기본)' },
    { id: 'form-2', label: '양식 2' },
  ],
}
