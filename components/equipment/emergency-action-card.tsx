'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { EmergencyFlowTable, EmergencyGuide, EmergencyHistory } from '@/components/equipment/emergency-flow-table'
import {
  createEquipmentEmergencyGuide,
  updateEquipmentEmergencyGuide,
  deleteEquipmentEmergencyGuide,
  createEquipmentEmergencyHistory,
  updateEquipmentEmergencyHistory,
  deleteEquipmentEmergencyHistory,
  updateEquipment,
} from '@/app/actions/equipment'

interface EmergencyActionCardProps {
  equipmentId: number
  equipment: { escalationNote?: string | null }
  guides: EmergencyGuide[]
  histories: EmergencyHistory[]
  canManage?: boolean
}

export function EmergencyActionCard({ equipmentId, equipment, guides, histories, canManage = false }: EmergencyActionCardProps) {
  const [escalationNote, setEscalationNote] = useState(equipment.escalationNote ?? '')

  async function handleAddGuide() {
    try {
      await createEquipmentEmergencyGuide(equipmentId, { sortOrder: guides.length })
    } catch (error) {
      console.error('[v0] add emergency guide error:', error)
      toast.error('추가에 실패했습니다.')
    }
  }

  async function handleUpdateGuide(id: number, fields: Record<string, string>) {
    await updateEquipmentEmergencyGuide(id, equipmentId, fields)
  }

  async function handleDeleteGuide(id: number) {
    await deleteEquipmentEmergencyGuide(id, equipmentId)
  }

  async function handleAddHistory() {
    try {
      await createEquipmentEmergencyHistory(equipmentId, { sortOrder: histories.length })
    } catch (error) {
      console.error('[v0] add emergency history error:', error)
      toast.error('추가에 실패했습니다.')
    }
  }

  async function handleUpdateHistory(id: number, fields: Record<string, string>) {
    await updateEquipmentEmergencyHistory(id, equipmentId, fields)
  }

  async function handleDeleteHistory(id: number) {
    await deleteEquipmentEmergencyHistory(id, equipmentId)
  }

  return (
    <EmergencyFlowTable
      guides={guides}
      histories={histories}
      onAddGuide={handleAddGuide}
      onUpdateGuide={handleUpdateGuide}
      onDeleteGuide={handleDeleteGuide}
      onAddHistory={handleAddHistory}
      onUpdateHistory={handleUpdateHistory}
      onDeleteHistory={handleDeleteHistory}
      escalationNote={escalationNote}
      onEscalationChange={setEscalationNote}
      onEscalationCommit={(value) => {
        if (canManage) updateEquipment(equipmentId, { escalationNote: value })
      }}
      editable={canManage}
    />
  )
}
