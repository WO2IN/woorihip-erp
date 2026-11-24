'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { SearchableCombobox } from '@/components/ui/searchable-combobox'
import { BarcodePrintButton } from '@/components/shared/barcode-print-button'
import { getJsonAuthHeaders } from '@/lib/auth-client'
import type { TraceBarcode } from '@/lib/trace'

const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })

async function loadOptions(name: 'companies' | 'products') {
  try {
    const response = await fetch(`/api/config?name=${name}`, { cache: 'no-store' })
    const body = await response.json().catch(() => null)
    return Array.isArray(body?.data) ? (body.data as unknown[]).filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

/**
 * 입고등록 없이 작업·출하까지 된 제품처럼, 바코드만 따로 등록한다.
 * 만든 바코드는 이력카드에서 골라 연결하면 수입검사·출하성적서까지 한 바코드로 묶인다.
 */
export function BarcodeRegisterDialog({
  open,
  onOpenChange,
  defaultCompany = '',
  defaultProduct = '',
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultCompany?: string
  defaultProduct?: string
  onCreated?: (record: TraceBarcode) => void
}) {
  const [companies, setCompanies] = useState<string[]>([])
  const [products, setProducts] = useState<string[]>([])
  const [company, setCompany] = useState('')
  const [product, setProduct] = useState('')
  const [quantity, setQuantity] = useState('')
  const [unit, setUnit] = useState('EA')
  const [receivedAt, setReceivedAt] = useState(today())
  const [floor, setFloor] = useState('1')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [created, setCreated] = useState<TraceBarcode | null>(null)

  useEffect(() => {
    if (!open) return
    setCompany(defaultCompany)
    setProduct(defaultProduct)
    setQuantity('')
    setUnit('EA')
    setReceivedAt(today())
    setFloor('1')
    setNote('')
    setCreated(null)
    void loadOptions('companies').then(setCompanies)
    void loadOptions('products').then(setProducts)
  }, [open, defaultCompany, defaultProduct])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (saving) return
    if (!company.trim() || !product.trim()) {
      toast.error('업체명과 품명을 입력해 주세요.')
      return
    }
    setSaving(true)
    try {
      const response = await fetch('/api/trace-barcodes', {
        method: 'POST',
        headers: getJsonAuthHeaders(),
        body: JSON.stringify({ company, product, quantity, quantityUnit: unit, receivedAt, floor: Number(floor), note }),
      })
      const body = await response.json().catch(() => null)
      if (!response.ok || !body?.data) {
        toast.error(body?.error ?? '바코드를 등록하지 못했습니다.')
        return
      }
      setCreated(body.data as TraceBarcode)
      onCreated?.(body.data as TraceBarcode)
    } catch {
      toast.error('바코드를 등록하지 못했습니다.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent overlayClassName="!z-[90]" className="!z-[100] max-h-[92dvh] overflow-y-auto sm:max-w-md" onPointerDown={(event) => event.stopPropagation()}>
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">{created ? '바코드를 등록했습니다' : '바코드 직접 등록'}</DialogTitle>
          <DialogDescription>
            {created
              ? '라벨을 출력해 제품에 붙이세요. 이력카드에서 이 바코드를 고르면 서류가 함께 묶입니다.'
              : '입고등록 없이 작업·출하까지 된 제품의 바코드를 따로 만듭니다. 나중에 이력카드에서 연결할 수 있습니다.'}
          </DialogDescription>
        </DialogHeader>

        {created ? (
          <div className="space-y-4">
            <div className="rounded-xl bg-slate-100 px-4 py-5 text-center dark:bg-slate-900">
              <p className="font-mono text-2xl font-extrabold tracking-[0.14em]">{created.barcode}</p>
              <p className="mt-1 text-sm text-muted-foreground">{created.company} · {created.product}</p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>닫기</Button>
              <BarcodePrintButton
                label={{ barcode: created.barcode, partner: created.company, product: created.product, date: created.receivedAt }}
                className="h-9"
              />
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <Labeled label="업체명">
              <SearchableCombobox configName="companies" options={companies} recentOptions={companies.slice(0, 8)} value={company} onChange={setCompany} placeholder="업체 검색 또는 입력..." className="h-10" />
            </Labeled>
            <Labeled label="품명">
              <SearchableCombobox configName="products" options={products} recentOptions={products.slice(0, 8)} value={product} onChange={setProduct} placeholder="품명 검색 또는 입력..." className="h-10" />
            </Labeled>
            <div className="grid grid-cols-2 gap-3">
              <Labeled label="입고일자 (선택)">
                <Input type="date" value={receivedAt} onChange={(event) => setReceivedAt(event.target.value)} />
              </Labeled>
              <Labeled label="층">
                <select value={floor} onChange={(event) => setFloor(event.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="1">1층</option>
                  <option value="2">2층</option>
                  <option value="3">3층</option>
                </select>
              </Labeled>
            </div>
            <Labeled label="수량 (선택)">
              <div className="flex gap-2">
                <Input type="number" min="0" step="any" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
                <select value={unit} onChange={(event) => setUnit(event.target.value)} className="w-24 rounded-md border border-input bg-background px-3 text-sm">
                  <option value="EA">EA</option>
                  <option value="Kg">Kg</option>
                  <option value="R">R</option>
                </select>
              </div>
            </Labeled>
            <Labeled label="메모 (선택)">
              <Input value={note} onChange={(event) => setNote(event.target.value)} placeholder="예) 입고 미등록 건, 거래명세표 번호" />
            </Labeled>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
              <Button type="submit" disabled={saving}>{saving ? '등록 중…' : '바코드 등록'}</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <span className="block text-xs font-semibold text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}
