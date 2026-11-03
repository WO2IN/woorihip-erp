import { type NextRequest, NextResponse } from "next/server"
import { putStoredFile } from "@/lib/stored-files"
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
    const buffer = Buffer.from(await file.arrayBuffer())
    const ext = fileName.includes(".") ? fileName.split(".").pop()! : "jpg"
    const stored = await putStoredFile({
      domain: "equipment",
      category: "photo",
      buffer,
      mime: file.type || "application/octet-stream",
      ext,
      originalName: file.name,
      storageFileName: fileName,
      uploadedBy: requestUser.id,
      uploadedByName: requestUser.displayName,
    })

    return NextResponse.json({ url: `/${stored.objectKey}`, fileId: stored.id })
  } catch (error) {
    console.error("[v0] Upload error:", error)
    return NextResponse.json({ error: "Upload failed" }, { status: 500 })
  }
}
