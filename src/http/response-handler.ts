type TextContent = { type: 'text'; text: string }
type ImageContent = { type: 'image'; data: string; mimeType: string }
type ContentBlock = TextContent | ImageContent

export async function handleResponse(response: Response): Promise<ContentBlock[]> {
  const contentType = response.headers.get('content-type') ?? ''
  const status = response.status

  if (status === 204) {
    return [{ type: 'text', text: 'No Content (204)' }]
  }

  if (contentType.includes('image/')) {
    const buffer = await response.arrayBuffer()
    const base64 = Buffer.from(buffer).toString('base64')
    return [
      {
        type: 'image',
        data: base64,
        mimeType: contentType.split(';')[0].trim(),
      },
    ]
  }

  const text = await response.text()

  if (contentType.includes('json')) {
    try {
      const parsed = JSON.parse(text)
      return [{ type: 'text', text: JSON.stringify(parsed, null, 2) }]
    } catch {
      // fallthrough to raw text
    }
  }

  return [{ type: 'text', text: text || `(empty response, status ${status})` }]
}
