import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { listUsers, insertUser, hashPassword, getUserFromHeaders, canManageUsers } from '@/lib/auth'
import type { User } from '@/lib/types'
import { isAllowedJobTitle, parseJobTitle } from '@/lib/user-job-titles'

export async function GET(req: NextRequest) {
  const requestUser = await getUserFromHeaders(req.headers)
  if (!requestUser || !canManageUsers(requestUser.role)) {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
  }

  const users = (await listUsers()).map(u => ({
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    role: u.role,
    floor: u.floor,
    status: u.status,
    hasSignature: Boolean(u.hasSignature),
    lastSeenAt: u.lastSeenAt ?? null,
    jobTitle: u.jobTitle ?? null,
    createdAt: u.createdAt,
  }))

  return NextResponse.json({ data: users })
}

export async function POST(req: NextRequest) {
  const requestUser = await getUserFromHeaders(req.headers)
  if (!requestUser || !canManageUsers(requestUser.role)) {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
  }

  const body = await req.json()
  const { username, displayName, password, role, floor, jobTitle } = body

  if (!username || !displayName || !password || !role) {
    return NextResponse.json({ error: '모든 필드를 입력해주세요.' }, { status: 400 })
  }

  if (floor !== undefined && floor !== '' && ![1, 2, 3].includes(Number(floor))) {
    return NextResponse.json({ error: '유효하지 않은 층입니다.' }, { status: 400 })
  }

  if (!['viewer', 'editor', 'admin'].includes(role)) {
    return NextResponse.json({ error: '유효하지 않은 권한입니다.' }, { status: 400 })
  }

  if (!isAllowedJobTitle(jobTitle)) {
    return NextResponse.json({ error: '유효하지 않은 직급입니다.' }, { status: 400 })
  }
  const parsedJobTitle = parseJobTitle(jobTitle)

  const newUser: User = {
    id: uuidv4(),
    username,
    displayName,
    passwordHash: await hashPassword(password),
    role,
    floor: floor ? Number(floor) as 1 | 2 | 3 : undefined,
    ...(parsedJobTitle ? { jobTitle: parsedJobTitle } : {}),
    createdAt: new Date().toISOString(),
  }

  if (!(await insertUser(newUser))) {
    return NextResponse.json({ error: '이미 사용 중인 아이디입니다.' }, { status: 409 })
  }

  return NextResponse.json({
    success: true,
    user: {
      id: newUser.id,
      username,
      displayName,
      role,
      floor: newUser.floor,
      hasSignature: false,
      jobTitle: newUser.jobTitle ?? null,
      createdAt: newUser.createdAt,
    },
  })
}
