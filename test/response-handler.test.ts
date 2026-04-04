import { describe, it, expect } from 'vitest'
import { handleResponse } from '../src/http/response-handler.js'

function createResponse(body: string | ArrayBuffer, init: { status?: number; headers?: Record<string, string> } = {}): Response {
  const { status = 200, headers = {} } = init
  return new Response(body, { status, headers })
}

describe('handleResponse', () => {
  it('returns "No Content" for 204 status', async () => {
    const res = new Response(null, { status: 204 })
    const blocks = await handleResponse(res)
    expect(blocks).toEqual([{ type: 'text', text: 'No Content (204)' }])
  })

  it('returns image content for image content-type', async () => {
    const buffer = new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer
    const res = new Response(buffer, {
      status: 200,
      headers: { 'content-type': 'image/png' },
    })
    const blocks = await handleResponse(res)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].type).toBe('image')
    if (blocks[0].type === 'image') {
      expect(blocks[0].mimeType).toBe('image/png')
      expect(blocks[0].data).toBeTruthy()
    }
  })

  it('returns pretty-printed JSON for json content-type', async () => {
    const res = createResponse('{"id":1,"name":"Fido"}', {
      headers: { 'content-type': 'application/json' },
    })
    const blocks = await handleResponse(res)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].type).toBe('text')
    if (blocks[0].type === 'text') {
      expect(blocks[0].text).toContain('"id": 1')
      expect(blocks[0].text).toContain('"name": "Fido"')
    }
  })

  it('falls through to raw text on invalid JSON', async () => {
    const res = createResponse('not valid json', {
      headers: { 'content-type': 'application/json' },
    })
    const blocks = await handleResponse(res)
    expect(blocks).toHaveLength(1)
    if (blocks[0].type === 'text') {
      expect(blocks[0].text).toBe('not valid json')
    }
  })

  it('returns raw text for non-JSON content', async () => {
    const res = createResponse('<html>hello</html>', {
      headers: { 'content-type': 'text/html' },
    })
    const blocks = await handleResponse(res)
    expect(blocks).toHaveLength(1)
    if (blocks[0].type === 'text') {
      expect(blocks[0].text).toBe('<html>hello</html>')
    }
  })

  it('returns generic binary responses as base64 text', async () => {
    const buffer = new Uint8Array([0x25, 0x50, 0x44, 0x46]).buffer
    const res = new Response(buffer, {
      status: 200,
      headers: { 'content-type': 'application/pdf' },
    })

    const blocks = await handleResponse(res)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].type).toBe('text')
    if (blocks[0].type === 'text') {
      expect(blocks[0].text).toContain('Binary response: application/pdf')
      expect(blocks[0].text).toContain('Base64:')
      expect(blocks[0].text).toContain(Buffer.from(buffer).toString('base64'))
    }
  })

  it('omits oversized binary payloads from inline output', async () => {
    const buffer = new Uint8Array(70 * 1024).buffer
    const res = new Response(buffer, {
      status: 200,
      headers: { 'content-type': 'application/octet-stream' },
    })

    const blocks = await handleResponse(res)
    expect(blocks).toHaveLength(1)
    if (blocks[0].type === 'text') {
      expect(blocks[0].text).toContain('Binary payload omitted')
    }
  })

  it('returns empty response message when body is empty', async () => {
    const res = createResponse('', {
      status: 200,
      headers: { 'content-type': 'text/plain' },
    })
    const blocks = await handleResponse(res)
    expect(blocks).toHaveLength(1)
    if (blocks[0].type === 'text') {
      expect(blocks[0].text).toContain('(empty response, status 200)')
    }
  })

  it('handles image/jpeg with charset', async () => {
    const buffer = new Uint8Array([0xff, 0xd8, 0xff]).buffer
    const res = new Response(buffer, {
      status: 200,
      headers: { 'content-type': 'image/jpeg; charset=utf-8' },
    })
    const blocks = await handleResponse(res)
    expect(blocks).toHaveLength(1)
    if (blocks[0].type === 'image') {
      expect(blocks[0].mimeType).toBe('image/jpeg')
    }
  })
})
