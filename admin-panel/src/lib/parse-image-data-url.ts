const RE = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\s]+)$/

const MAX_BYTES = 400_000

export function parseImageDataUrl(dataUrl: string): { mime: string; buffer: Buffer } | null {
  const m = RE.exec(dataUrl.trim().replace(/\s/g, ''))
  if (!m) return null
  const mime = m[1]
  const buf = Buffer.from(m[2], 'base64')
  if (!buf.length || buf.length > MAX_BYTES) return null
  return { mime, buffer: buf }
}
