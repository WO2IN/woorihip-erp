'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { SearchableCombobox } from '@/components/ui/searchable-combobox'
import { DocumentMetadata } from '@/lib/types'
import { toast } from 'sonner'
import { notifyDataChanged } from '@/lib/data-events'
import { getSession, buildAuthHeaders } from '@/lib/auth-client'

interface EditDocumentDialogProps {
  document: DocumentMetadata
  open: boolean
  onClose: () => void
  onUpdate: (doc: DocumentMetadata) => void
}

export function EditDocumentDialog({ document, open, onClose, onUpdate }: EditDocumentDialogProps) {
  const [form, setForm] = useState({
    company: document.company,
    documentType: document.documentType,
    lotStart: document.lotStart,
    lotEnd: document.lotEnd || '',
    product: document.product,
    material: document.material,
    specification: document.specification || '',
    shipmentCategory: document.shipmentCategory || '',
    floor: document.floor ? `${document.floor}층` : '',
    quantity: document.quantity?.toString() || '',
    quantityUnit: document.quantityUnit || 'Kg',
    issueDate: document.issueDate,
    note: document.note || '',
  })

  const [companies, setCompanies] = useState<string[]>([])
  const [docTypes, setDocTypes] = useState<string[]>([])
  const [materials, setMaterials] = useState<string[]>([])
  const [specifications, setSpecifications] = useState<string[]>([])
  const [products, setProducts] = useState<string[]>([])
  const [shipmentCategories, setShipmentCategories] = useState<string[]>([])
  const [recentCompanies, setRecentCompanies] = useState<string[]>([])
  const [recentDocTypes, setRecentDocTypes] = useState<string[]>([])
  const [recentMaterials, setRecentMaterials] = useState<string[]>([])
  const [recentSpecifications, setRecentSpecifications] = useState<string[]>([])
  const [recentProducts, setRecentProducts] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  
  useEffect(() => {
    if (!open) return

    setForm({
      company: document.company,
      documentType: document.documentType,
      lotStart: document.lotStart,
      lotEnd: document.lotEnd || '',
      product: document.product,
      material: document.material,
      specification: document.specification || '',
      shipmentCategory: document.shipmentCategory || '',
      floor: document.floor ? `${document.floor}층` : '',
      quantity: document.quantity?.toString() || '',
      quantityUnit: document.quantityUnit || 'Kg',
      issueDate: document.issueDate,
      note: document.note || '',
    })

    const session = getSession()
    const headers = session ? buildAuthHeaders(session) : {}
  
    Promise.all([
      fetch('/api/config?name=companies', { headers }).then(r => r.json()),
      fetch('/api/config?name=document-types', { headers }).then(r => r.json()),
      fetch('/api/config?name=materials', { headers }).then(r => r.json()),
      fetch('/api/config?name=specifications', { headers }).then(r => r.json()),
      fetch('/api/config?name=products', { headers }).then(r => r.json()),
      fetch('/api/config?name=shipment-categories', { headers }).then(r => r.json()),
    ]).then(([c, dt, m, s, p, sc]) => {
      setCompanies(c.data || [])
      setDocTypes(dt.data || [])
      setMaterials(m.data || [])
      setSpecifications(s.data || [])
      setProducts(p.data || [])
      const savedCategories = Array.isArray(sc.data) ? sc.data : []
      setShipmentCategories(form.shipmentCategory && !savedCategories.includes(form.shipmentCategory)
        ? [form.shipmentCategory, ...savedCategories]
        : savedCategories)
    
      // 최근 사용 5개
      setRecentCompanies((c.data || []).slice(0, 5))
      setRecentDocTypes((dt.data || []).slice(0, 5))
      setRecentMaterials((m.data || []).slice(0, 5))
      setRecentSpecifications((s.data || []).slice(0, 5))
      setRecentProducts((p.data || []).slice(0, 5))
    })
  }, [open])

  const set = (key: keyof typeof form) => (val: string) =>
    setForm(prev => ({ ...prev, [key]: val }))

  const handleSave = async () => {
    if (!form.company || !form.documentType) {
      toast.error('업체명과 문서유형은 필수입니다.')
      return
    }
    setSaving(true)
    try {
      const session = getSession()
      const res = await fetch('/api/documents', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(session ? buildAuthHeaders(session) : {}),
        },
        body: JSON.stringify({
          id: document.id,
          ...form,
          quantity: form.quantity ? Number(form.quantity) : undefined,
          quantityUnit: form.quantityUnit,
          lotEnd: form.lotEnd,
          specification: form.specification,
          shipmentCategory: form.shipmentCategory || undefined,
          floor: form.floor ? Number(form.floor.replace('층', '')) : undefined,
          note: form.note,
        }),
      })
      if (!res.ok) throw new Error()
      toast.success('문서 정보가 수정되었습니다.')
      onUpdate({
        ...document,
        ...form,
        shipmentCategory: form.shipmentCategory as DocumentMetadata['shipmentCategory'],
        floor: form.floor ? Number(form.floor.replace('층', '')) as DocumentMetadata['floor'] : undefined,
        quantity: form.quantity ? Number(form.quantity) : undefined,
        quantityUnit: form.quantityUnit as DocumentMetadata['quantityUnit'],
      })
      notifyDataChanged('documents')
      onClose()
    } catch {
      toast.error('수정에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>문서 정보 수정</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {/* 필수 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm">업체명 <span className="text-destructive">*</span></Label>
              <SearchableCombobox
                configName="companies"
                options={companies}
                recentOptions={recentCompanies}
                value={form.company}
                onChange={set('company')}
                onOptionsChange={setCompanies}
                placeholder="업체 선택..."
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">문서유형 <span className="text-destructive">*</span></Label>
              <SearchableCombobox
                configName="document-types"
                options={docTypes}
                recentOptions={recentDocTypes}
                value={form.documentType}
                onChange={set('documentType')}
                onOptionsChange={setDocTypes}
                placeholder="문서유형 선택..."
              />
            </div>
          </div>

          {/* LOT */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm">LOT 시작번호</Label>
              <Input value={form.lotStart} onChange={e => set('lotStart')(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">LOT 종료번호</Label>
              <Input value={form.lotEnd} onChange={e => set('lotEnd')(e.target.value)} />
            </div>
          </div>

          {/* 품목 / 재질 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm">품목</Label>
              <SearchableCombobox
                configName="products"
                options={products}
                recentOptions={recentProducts}
                value={form.product}
                onChange={set('product')}
                onOptionsChange={setProducts}
                placeholder="품목 선택..."
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">재질</Label>
              <SearchableCombobox
                configName="materials"
                options={materials}
                recentOptions={recentMaterials}
                value={form.material}
                onChange={set('material')}
                onOptionsChange={setMaterials}
                placeholder="재질 선택..."
              />
            </div>
          </div>

          {/* 도금 종류 / 층 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm">도금 종류</Label>
              <SearchableCombobox
                configName="shipment-categories"
                options={shipmentCategories}
                recentOptions={shipmentCategories.slice(0, 5)}
                onOptionsChange={setShipmentCategories}
                value={form.shipmentCategory}
                onChange={set('shipmentCategory')}
                placeholder="도금 종류 선택..."
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">층</Label>
              <SearchableCombobox
                configName="shipment-floor"
                options={['1층', '2층', '3층']}
                recentOptions={['1층', '2층', '3층']}
                value={form.floor}
                onChange={set('floor')}
                placeholder="층 선택..."
              />
            </div>
          </div>

          {/* 사양 / 수량 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm">도금사양</Label>
              <SearchableCombobox
                configName="specifications"
                options={specifications}
                recentOptions={recentSpecifications}
                value={form.specification}
                onChange={set('specification')}
                onOptionsChange={setSpecifications}
                placeholder="사양 선택..."
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">수량</Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  value={form.quantity}
                  onChange={e => set('quantity')(e.target.value)}
                  className="h-10 min-w-0 flex-1"
                />
                <select
                  value={form.quantityUnit}
                  onChange={e => set('quantityUnit')(e.target.value)}
                  aria-label="수량 단위"
                  className="h-10 w-20 rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="Kg">Kg</option>
                  <option value="EA">EA</option>
                  <option value="R">R</option>
                </select>
              </div>
            </div>
          </div>

          {/* 발행일 */}
          <div className="space-y-1.5">
            <Label className="text-sm">발행일</Label>
            <Input value={form.issueDate} onChange={e => set('issueDate')(e.target.value)} placeholder="예: 2025-07-07 또는 25.07.07" />
          </div>

          {/* 비고 */}
          <div className="space-y-1.5">
            <Label className="text-sm">비고</Label>
            <Textarea value={form.note} onChange={e => set('note')(e.target.value)} rows={2} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>취소</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? '저장 중...' : '저장'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
