type TextContent = { type: 'text'; text: string }
type ImageContent = { type: 'image'; data: string; mimeType: string }
type ContentBlock = TextContent | ImageContent

export async function handleResponse(response: Response): Promise<ContentBlock[]> {
  const contentType = response.headers.get('content-type') ?? ''
  const mimeType = getMimeType(contentType)
  const status = response.status

  if (status === 204) {
    return [{ type: 'text', text: 'No Content (204)' }]
  }

  if (mimeType.startsWith('image/')) {
    const buffer = await response.arrayBuffer()
    const base64 = Buffer.from(buffer).toString('base64')
    return [
      {
        type: 'image',
        data: base64,
        mimeType,
      },
    ]
  }

  if (isBinaryContentType(contentType)) {
    const buffer = await response.arrayBuffer()
    const bytes = Buffer.from(buffer)
    const lines = [`Binary response: ${mimeType || 'application/octet-stream'} (${bytes.byteLength} bytes)`]

    if (bytes.byteLength <= MAX_INLINE_BINARY_BYTES) {
      lines.push('', 'Base64:', bytes.toString('base64'))
    } else {
      lines.push('', `Binary payload omitted because it exceeds ${MAX_INLINE_BINARY_BYTES} bytes.`)
    }

    return [{ type: 'text', text: lines.join('\n') }]
  }

  const text = await response.text()

  if (mimeType.includes('json')) {
    try {
      const parsed = JSON.parse(text)
      return [{ type: 'text', text: JSON.stringify(parsed, null, 2) }]
    } catch {
      // fallthrough to raw text
    }
  }

  return [{ type: 'text', text: text || `(empty response, status ${status})` }]
}

const MAX_INLINE_BINARY_BYTES = 64 * 1024

function isBinaryContentType(contentType: string): boolean {
  const mimeType = getMimeType(contentType)
  if (!mimeType) return false
  if (mimeType.startsWith('text/')) return false
  if (mimeType.startsWith('image/')) return true
  if (mimeType.startsWith('audio/')) return true
  if (mimeType.startsWith('video/')) return true
  if (mimeType.includes('json')) return false
  if (mimeType.includes('xml')) return false
  if (mimeType.includes('yaml')) return false
  if (mimeType.includes('csv')) return false
  if (mimeType === 'application/javascript') return false
  if (mimeType === 'application/graphql') return false
  if (mimeType === 'application/x-www-form-urlencoded') return false
  return true
}

function getMimeType(contentType: string): string {
  return contentType.split(';')[0]?.trim().toLowerCase() ?? ''
}
