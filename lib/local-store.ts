import {
  bulkWrite,
  deleteRecordsWhere,
  findRecords,
  listRecords,
  patchRecord,
  patchRecordsWhere,
} from "./records"

// 체크시트·설비 데이터. DB 전환 전 data/db.json 의 테이블 하나가 records 컬렉션 하나에 대응하고,
// 숫자 id 는 sequences 테이블에서 발급한다.

export type TableName =
  | "equipment"
  | "equipmentPhotos"
  | "fiveSTargets"
  | "fiveSCheckItems"
  | "fiveSSheets"
  | "fiveSEntries"
  | "dailyCheckItems"
  | "dailyCheckSheets"
  | "dailyCheckEntries"
  | "dailyCheckIssues"
  | "equipmentEmergencyGuides"
  | "equipmentEmergencyHistories"
  | "tempHumidityTargets"
  | "tempHumiditySheets"
  | "tempHumidityEntries"
  | "tempHumidityIssues"

export function selectAll<T = any>(table: TableName): Promise<T[]> {
  return listRecords<T>(table)
}

export function selectWhere<T = any>(table: TableName, predicate: (row: T) => boolean): Promise<T[]> {
  return findRecords<T>(table, predicate)
}

export async function findOne<T = any>(table: TableName, predicate: (row: T) => boolean): Promise<T | null> {
  return (await findRecords<T>(table, predicate, 1))[0] ?? null
}

export async function insertRow<T extends Record<string, any>>(table: TableName, data: T): Promise<{ id: number } & T> {
  const [row] = await bulkWrite(table, { insert: [data], sequence: table })
  return row
}

/** 여러 행 추가·수정을 한 번에 저장한다. 반복문에서는 insertRow/updateById 대신 이것을 쓴다. */
export function writeRows<T extends Record<string, any>>(
  table: TableName,
  changes: { insert?: T[]; patch?: { id: number; patch: Record<string, any> }[] },
): Promise<({ id: number } & T)[]> {
  return bulkWrite(table, { ...changes, sequence: table })
}

export function updateById(table: TableName, id: number, patch: Record<string, any>) {
  return patchRecord<any>(table, id, patch)
}

export async function updateWhere(table: TableName, predicate: (row: any) => boolean, patch: Record<string, any>) {
  const updated = await patchRecordsWhere<any>(table, predicate, patch)
  return updated.at(-1) ?? null
}

export async function removeWhere(table: TableName, predicate: (row: any) => boolean) {
  return (await deleteRecordsWhere<any>(table, predicate)).length
}
