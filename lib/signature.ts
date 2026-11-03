import sharp from 'sharp'

const MAX_BYTES = 2 * 1024 * 1024

export async function prepareSignature(input: Buffer) {
  if (!input.length || input.length > MAX_BYTES) return null
  try {
    const base = await sharp(input)
      .rotate()
      .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .png()
      .toBuffer()
    const { data, info } = await sharp(base).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const gray = await sharp(base).greyscale().raw().toBuffer()
    // Paper and shadows change slowly, so a wide blur estimates the local background under each stroke.
    const paper = await sharp(base).greyscale().blur(Math.max(8, Math.round(Math.max(info.width, info.height) / 40))).raw().toBuffer()
    const pixels = Buffer.from(data)
    for (let index = 0, pixel = 0; index < pixels.length; index += 4, pixel += 1) {
      const darkness = paper[pixel] - gray[pixel]
      pixels[index + 3] = darkness <= 24 ? 0 : Math.min(255, Math.round(((darkness - 24) / 36) * 255))
    }
    const trimmed = await sharp(pixels, { raw: { width: info.width, height: info.height, channels: 4 } })
      .trim({ threshold: 2 })
      .resize(560, 220, { fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer()
    return trimmed.length ? trimmed : null
  } catch {
    return null
  }
}

export async function signatureForBox(input: Buffer, width: number, height: number) {
  const prepared = await prepareSignature(input)
  if (!prepared || width < 8 || height < 8) return prepared
  const meta = await sharp(prepared).metadata()
  if (!meta.width || !meta.height) return prepared
  const aspect = width / height
  const canvasW = aspect >= 1 ? 480 : Math.max(8, Math.round(480 * aspect))
  const canvasH = aspect >= 1 ? Math.max(8, Math.round(480 / aspect)) : 480
  let drawW = canvasW
  let drawH = Math.round(drawW * (meta.height / meta.width))
  if (drawH > canvasH) {
    drawH = canvasH
    drawW = Math.max(1, Math.round(drawH * (meta.width / meta.height)))
  }
  const resized = await sharp(prepared).resize(drawW, drawH, { fit: 'fill' }).png().toBuffer()
  return sharp({
    create: { width: canvasW, height: canvasH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  }).composite([{ input: resized, left: Math.round((canvasW - drawW) / 2), top: Math.round((canvasH - drawH) / 2) }]).png().toBuffer()
}
