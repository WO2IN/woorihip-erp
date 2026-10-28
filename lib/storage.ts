import path from 'path'
import { DocumentMetadata } from './types'
import { ProcessCheckRecord, ProcessTemplate } from './process-checklist'
import type { CustomerNonconformity, ProcessNonconformity } from './non-conformity'
import type { Floor3WorkLog } from './floor3-work-log'
import type { WorkStage } from './stock'
import {
  deleteRecord,
  deleteRecordsWhere,
  getSetting,
  insertRecord,
  listRecords,
  patchRecord,
  putRecord,
  replaceRecords,
  setSetting,
} from './records'

export type { Floor3WorkLog }

const ROOT = process.cwd()

// 성적서 PDF는 MinIO 버킷 woorihip 또는 public/storage, 나머지 데이터는 PostgreSQL
export const STORAGE_DIR = path.join(ROOT, 'public', 'storage')

export type InventoryRecord = Pick<DocumentMetadata, 'id' | 'company' | 'product' | 'floor' | 'quantity' | 'quantityUnit' | 'issueDate' | 'lotStart' | 'createdAt' | 'createdBy' | 'createdById'> & {
  movementType: '입고'
  storagePath: 'INVENTORY'
  /** 3층 재고에서 현 재고수량에서 빼는 불량 수량 */
  defectQuantity?: number
  /** 3층 재고에서 현 재고수량에서 빼는 검사시료 수량 */
  sampleQuantity?: number
  /** 고객 소재의 작업 단계. 출고 완료는 성적서 출고로 자동 판정하므로 저장하지 않는다. */
  workStage?: WorkStage
}

export interface AuditLogEntry {
  id: string
  action: string
  target: string
  detail?: string
  userId: string
  userName: string
  createdAt: string
}

// ─── Inventory ───────────────────────────────────────────────────────────────

export function readInventory() {
  return listRecords<InventoryRecord>('inventory')
}

export async function appendInventory(record: InventoryRecord) {
  await insertRecord('inventory', record)
}

export function updateInventory(id: string, updates: Partial<InventoryRecord>) {
  return patchRecord<InventoryRecord>('inventory', id, updates)
}

export function deleteInventory(id: string) {
  return deleteRecord<InventoryRecord>('inventory', id)
}

// ─── Floor 3 work logs ───────────────────────────────────────────────────────

export function readFloor3WorkLogs() {
  return listRecords<Floor3WorkLog>('floor3WorkLogs')
}

export async function saveFloor3WorkLog(record: Floor3WorkLog) {
  await putRecord('floor3WorkLogs', record)
  return record
}

export function deleteFloor3WorkLog(id: string) {
  return deleteRecord<Floor3WorkLog>('floor3WorkLogs', id)
}

// ─── Process checks ──────────────────────────────────────────────────────────

export function readProcessChecks() {
  return listRecords<ProcessCheckRecord>('processChecks')
}

export function writeProcessChecks(records: ProcessCheckRecord[]) {
  return replaceRecords('processChecks', records)
}

export async function appendProcessCheck(record: ProcessCheckRecord) {
  await insertRecord('processChecks', record, 'first')
}

export function updateProcessCheck(id: string, updates: Partial<ProcessCheckRecord>) {
  return patchRecord<ProcessCheckRecord>('processChecks', id, { ...updates, id })
}

export async function deleteProcessChecksForLine(lineId: string) {
  await deleteRecordsWhere<ProcessCheckRecord>('processChecks', (record) => (record.lineId ?? 'busbar-mtm') === lineId)
}

export function deleteProcessCheck(id: string) {
  return deleteRecord<ProcessCheckRecord>('processChecks', id)
}

export function readProcessTemplates() {
  return listRecords<ProcessTemplate>('processTemplates')
}

export function writeProcessTemplates(templates: ProcessTemplate[]) {
  return replaceRecords('processTemplates', templates)
}

export async function readHiddenProcessLines(): Promise<string[]> {
  const parsed = await getSetting<unknown>('processHiddenLines', [])
  return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
}

export async function hideProcessLine(id: string) {
  const hidden = await readHiddenProcessLines()
  if (!hidden.includes(id)) hidden.push(id)
  await setSetting('processHiddenLines', hidden)
}

// ─── Nonconformities ─────────────────────────────────────────────────────────

export function readCustomerNonconformities() {
  return listRecords<CustomerNonconformity>('customerNonconformities')
}

export async function appendCustomerNonconformity(record: CustomerNonconformity) {
  await insertRecord('customerNonconformities', record, 'first')
}

export function updateCustomerNonconformity(id: string, updates: Partial<CustomerNonconformity>) {
  return patchRecord<CustomerNonconformity>('customerNonconformities', id, { ...updates, id })
}

export function deleteCustomerNonconformity(id: string) {
  return deleteRecord<CustomerNonconformity>('customerNonconformities', id)
}

export function readProcessNonconformities() {
  return listRecords<ProcessNonconformity>('processNonconformities')
}

export async function appendProcessNonconformity(record: ProcessNonconformity) {
  await insertRecord('processNonconformities', record, 'first')
}

export function updateProcessNonconformity(id: string, updates: Partial<ProcessNonconformity>) {
  return patchRecord<ProcessNonconformity>('processNonconformities', id, { ...updates, id })
}

export function deleteProcessNonconformity(id: string) {
  return deleteRecord<ProcessNonconformity>('processNonconformities', id)
}

// ─── Metadata ────────────────────────────────────────────────────────────────

export function readMetadata() {
  return listRecords<DocumentMetadata>('metadata')
}

export function writeMetadata(data: DocumentMetadata[]) {
  return replaceRecords('metadata', data)
}

export async function appendMetadata(doc: DocumentMetadata) {
  await insertRecord('metadata', doc)
}

export async function updateMetadata(id: string, updates: Partial<DocumentMetadata>) {
  return (await patchRecord<DocumentMetadata>('metadata', id, updates)) !== null
}

export function deleteMetadata(id: string) {
  return deleteRecord<DocumentMetadata>('metadata', id)
}

// ─── Config ──────────────────────────────────────────────────────────────────

export function readConfig(name: string) {
  return getSetting<string[]>(`config:${name}`, [])
}

export function writeConfig(name: string, data: string[]) {
  return setSetting(`config:${name}`, data)
}

// ─── File storage path ───────────────────────────────────────────────────────

export function getDocumentFilePath(relativePath: string) {
  return path.join(STORAGE_DIR, relativePath)
}

// ─── Audit log ───────────────────────────────────────────────────────────────

export function readAuditLogs() {
  return listRecords<AuditLogEntry>('auditLogs')
}

export async function appendAuditLog(entry: Omit<AuditLogEntry, 'id' | 'createdAt'>) {
  await insertRecord(
    'auditLogs',
    {
      ...entry,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
    },
    'first',
  )
}

export async function deleteAuditLog(id: string) {
  return (await deleteRecord('auditLogs', id)) !== null
}
