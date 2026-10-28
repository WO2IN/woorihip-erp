import { type NextRequest, NextResponse } from "next/server"
import { saveDocumentFile } from "@/lib/object-storage"
import { canEdit, getUserFromHeaders } from "@/lib/auth"

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_")
}

export async function POST(request: NextRequest) {
  const requestUser = await getUserFromHeaders(request.headers)
  if (!requestUser || !canEdit(requestUser.role)) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 })
  }
  try {
    const formData = await request.formData()
    const file = formData.get("file") as File | null

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    const fileName = `${Date.now()}-${sanitizeFileName(file.name)}`
    const key = `uploads/equipment-photos/${fileName}`
    const buffer = Buffer.from(await file.arrayBuffer())
    await saveDocumentFile(key, buffer, file.type || "application/octet-stream")

    return NextResponse.json({ url: `/${key}` })
  } catch (error) {
    console.error("[v0] Upload error:", error)
    return NextResponse.json({ error: "Upload failed" }, { status: 500 })
  }
}
