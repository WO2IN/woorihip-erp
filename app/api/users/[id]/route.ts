import { NextRequest, NextResponse } from 'next/server'
import { findUserById, updateUser, deleteUser, hashPassword, getUserFromHeaders, canManageUsers, type UserPatch } from '@/lib/auth'
import { appendAuditLog } from '@/lib/storage'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestUser = await getUserFromHeaders(req.headers)
  if (!requestUser || !canManageUsers(requestUser.role)) {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
  }

  const { id } = await params
  const body = await req.json()
  const { displayName, role, password, floor, approve } = body

  const targetUser = await findUserById(id)
  if (!targetUser) {
    return NextResponse.json({ error: '사용자를 찾을 수 없습니다.' }, { status: 404 })
  }

  const patch: UserPatch = {}
  const changes: string[] = []
  const roleLabels: Record<string, string> = { viewer: '뷰어', editor: '편집자', admin: '관리자' }

  if (displayName && displayName !== targetUser.displayName) {
    changes.push(`이름 ${targetUser.displayName} -> ${displayName}`)
    patch.displayName = displayName
  }
  if (role && ['viewer', 'editor', 'admin'].includes(role) && role !== targetUser.role) {
    changes.push(`권한 ${roleLabels[targetUser.role] ?? targetUser.role} -> ${roleLabels[role] ?? role}`)
    patch.role = role
  }
  if (floor !== undefined) {
    const nextFloor = floor === '' || floor === null ? null : Number(floor)
    if (nextFloor !== null && ![1, 2, 3].includes(nextFloor)) {
      return NextResponse.json({ error: '층은 1, 2, 3 또는 미지정만 가능합니다.' }, { status: 400 })
    }
    const currentFloor = targetUser.floor ?? null
    if (nextFloor !== currentFloor) {
      const label = (value: number | null) => value ? `${value}층` : '미지정'
      changes.push(`층 ${label(currentFloor)} -> ${label(nextFloor)}`)
      patch.floor = nextFloor as 1 | 2 | 3 | null
    }
  }
  if (password) {
    patch.passwordHash = await hashPassword(password)
    changes.push('비밀번호 변경')
  }
  if (approve === true && targetUser.status === 'pending') {
    patch.status = null
    changes.push('가입 승인')
  }

  const updated = (await updateUser(id, patch)) ?? targetUser
  await appendAuditLog({
    action: 'UPDATE',
    target: 'user',
    detail: changes.length > 0
      ? `${targetUser.displayName} 계정 수정: ${changes.join(', ')}`
      : `${targetUser.displayName} 계정 수정`,
    userId: requestUser.id,
    userName: requestUser.displayName,
  })

  return NextResponse.json({
    success: true,
    user: {
      id: updated.id,
      username: updated.username,
      displayName: updated.displayName,
      role: updated.role,
      floor: updated.floor,
      status: updated.status,
      createdAt: updated.createdAt,
    },
  })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestUser = await getUserFromHeaders(req.headers)
  if (!requestUser || !canManageUsers(requestUser.role)) {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
  }

  const { id } = await params

  // Prevent deleting yourself
  if (requestUser.id === id) {
    return NextResponse.json({ error: '자신의 계정은 삭제할 수 없습니다.' }, { status: 400 })
  }

  const removedUser = await findUserById(id)
  if (!removedUser) {
    return NextResponse.json({ error: '사용자를 찾을 수 없습니다.' }, { status: 404 })
  }

  await deleteUser(id)
  await appendAuditLog({ action: 'DELETE', target: 'user', detail: `${removedUser.displayName} 계정 삭제`, userId: requestUser.id, userName: requestUser.displayName })

  return NextResponse.json({ success: true })
}
