import { deleteRecordsWhere, insertRecord, listRecords, patchRecord } from '@/lib/records'
import { getSetting, setSetting } from '@/lib/records'
import { buildSeed, type RiskAssessment, type RiskSettings } from '@/lib/risk/model'

const COLLECTION = 'risk-assessments'
const SETTING = 'config:risk'

export async function readRisk() {
  const settings = await getSetting<RiskSettings | null>(SETTING, null)
  const assessments = await listRecords<RiskAssessment>(COLLECTION)
  if (settings) return { settings, assessments }
  const seeded = buildSeed()
  await setSetting(SETTING, seeded.settings)
  if (assessments.length === 0) {
    for (const item of seeded.assessments) await insertRecord(COLLECTION, item)
    return seeded
  }
  return { settings: seeded.settings, assessments }
}

export async function saveRiskAssessment(assessment: RiskAssessment) {
  const updated = await patchRecord<RiskAssessment>(COLLECTION, assessment.id, assessment)
  if (updated) return updated
  return insertRecord(COLLECTION, assessment)
}

export async function deleteRiskAssessment(id: string) {
  const removed = await deleteRecordsWhere<RiskAssessment>(COLLECTION, (row) => row.id === id)
  return removed[0] ?? null
}

export async function saveRiskSettings(settings: RiskSettings) {
  await setSetting(SETTING, settings)
  return settings
}

export async function replaceRisk(settings: RiskSettings, assessments: RiskAssessment[]) {
  await deleteRecordsWhere<RiskAssessment>(COLLECTION, () => true)
  for (const item of assessments) await insertRecord(COLLECTION, item)
  await setSetting(SETTING, settings)
  return { settings, assessments }
}
