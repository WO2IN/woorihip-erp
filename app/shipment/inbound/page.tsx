import { redirect } from 'next/navigation'

/** 입고 등록은 재고 관리 '진행현황' 탭으로 옮겼다. 예전 주소로 와도 그쪽으로 보낸다. */
export default async function InboundPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = new URLSearchParams({ tab: 'flow' })
  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value === 'string' && key !== 'tab') params.set(key, value)
  }
  redirect(`/shipment?${params.toString()}`)
}
