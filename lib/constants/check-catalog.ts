export const CHECK_METHODS = ['육안', '동작', '시스템', '측정', '청각'] as const

export const ITEM_CYCLES = ['일', '주', '월'] as const

export const STAFF_CYCLES = ['1회/일', '2회/일', '1회/주', '2회/주', '1회/월'] as const

export type CheckMethod = (typeof CHECK_METHODS)[number]
export type ItemCycle = (typeof ITEM_CYCLES)[number]
export type StaffCycle = (typeof STAFF_CYCLES)[number]
