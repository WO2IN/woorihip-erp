export interface Floor3WorkLog {
  id: string
  company: string
  product: string
  floor: 3
  unit: string
  workDate: string
  workQuantity: number
  defectQuantity: number
  sampleQuantity: number
  totalQuantity: number
  createdAt: string
  createdBy?: string
  createdById?: string
  updatedAt?: string
}
