import { NextRequest, NextResponse } from 'next/server'
import { canEdit, getUserFromHeaders } from '@/lib/auth'
import { readConfig, readMetadata } from '@/lib/storage'
import { HEADER_VARIANTS, recognizeCertificateHeader, renderPdfFirstPage } from '@/lib/ocr/certificate-ocr'
import {
  parseCertificateText,
  type CertificateCandidates,
  type CertificateOcrFields,
} from '@/lib/ocr/certificate-parse'
import { fileKind, isCertificate } from '@/lib/file-types'

export const runtime = 'nodejs'

const FIELD_GROUPS: (keyof CertificateOcrFields)[][] = [
  ['company'],
  ['product'],
  ['lotStart', 'lotStartNo', 'lotEndNo'],
  ['issueDate'],
  ['quantity', 'quantityUnit'],
  ['material'],
  ['specification'],
]

function uniqueValues(values: Array<string | undefined>) {
  return [...new Set(values.map(value => value?.trim() ?? '').filter(value => value && value !== '-'))]
}

async function loadCandidates(): Promise<CertificateCandidates> {
  const [companies, products, materials, specifications, metadata] = await Promise.all([
    readConfig('companies'),
    readConfig('products'),
    readConfig('materials'),
    readConfig('specifications'),
    readMetadata(),
  ])
  const certificates = metadata.filter(doc => isCertificate(doc.documentType))
  const productsByCompany: Record<string, string[]> = {}
  for (const doc of certificates) {
    const company = doc.company?.trim()
    const product = doc.product?.trim()
    if (!company || !product || product === '-') continue
    const list = (productsByCompany[company] ??= [])
    if (!list.includes(product)) list.push(product)
  }

  return {
    companies: uniqueValues([...companies, ...certificates.map(doc => doc.company)]),
    productsByCompany,
    products: uniqueValues([...products, ...certificates.map(doc => doc.product)]),
    materials: uniqueValues([...materials, ...certificates.map(doc => doc.material)]),
    specifications: uniqueValues([...specifications, ...certificates.map(doc => doc.specification)]),
  }
}

export async function POST(req: NextRequest) {
  const user = await getUserFromHeaders(req.headers)
  if (!user || !canEdit(user.role)) {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
  }

  const formData = await req.formData()
  const file = formData.get('file')
  if (!(file instanceof File) || fileKind(file.name)?.ext !== 'pdf') {
    return NextResponse.json({ error: 'PDF 파일이 없습니다.' }, { status: 400 })
  }

  try {
    const [candidates, page] = await Promise.all([
      loadCandidates(),
      renderPdfFirstPage(Buffer.from(await file.arrayBuffer())),
    ])
    const fields: CertificateOcrFields = {}

    for (const variant of HEADER_VARIANTS) {
      const found = parseCertificateText(await recognizeCertificateHeader(page, variant), candidates)
      for (const group of FIELD_GROUPS) {
        if (fields[group[0]] || !found[group[0]]) continue
        for (const key of group) if (found[key]) Object.assign(fields, { [key]: found[key] })
      }
      if (FIELD_GROUPS.every(group => fields[group[0]])) break
    }

    return NextResponse.json({ fields })
  } catch (error) {
    console.error('성적서 OCR 실패:', error)
    return NextResponse.json({ error: '성적서 자동 인식에 실패했습니다.' }, { status: 500 })
  }
}
