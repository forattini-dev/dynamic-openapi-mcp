import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { executeOperation, resolveBaseUrl, resolveServerUrl, type HttpClientConfig } from '../src/http/client.js'
import type { ParsedOperation, ParsedSpec } from '../src/parser/types.js'

// Mock global fetch
const mockFetch = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch)
})

afterEach(() => {
  vi.restoreAllMocks()
})

function createMockResponse(body: string, init: { status?: number; headers?: Record<string, string> } = {}): Response {
  const { status = 200, headers = {} } = init
  return new Response(body, { status, headers: { 'content-type': 'application/json', ...headers } })
}

const baseConfig: HttpClientConfig = {
  baseUrl: 'https://api.test.com',
  auth: null,
}

function makeOp(overrides: Partial<ParsedOperation> = {}): ParsedOperation {
  return {
    operationId: 'testOp',
    method: 'GET',
    path: '/test',
    parameters: [],
    responses: {},
    security: [],
    tags: [],
    ...overrides,
  }
}

describe('executeOperation', () => {
  it('makes a simple GET request', async () => {
    mockFetch.mockResolvedValueOnce(createMockResponse('{"ok":true}'))

    const op = makeOp()
    const result = await executeOperation(op, {}, baseConfig)

    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('text')
    expect(mockFetch).toHaveBeenCalledOnce()

    const [url] = mockFetch.mock.calls[0]
    expect(url).toBe('https://api.test.com/test')
  })

  it('substitutes path parameters', async () => {
    mockFetch.mockResolvedValueOnce(createMockResponse('{}'))

    const op = makeOp({
      path: '/pets/{petId}',
      parameters: [
        { name: 'petId', in: 'path', required: true, schema: { type: 'integer' } },
      ],
    })
    await executeOperation(op, { petId: 42 }, baseConfig)

    const [url] = mockFetch.mock.calls[0]
    expect(url).toBe('https://api.test.com/pets/42')
  })

  it('adds query parameters', async () => {
    mockFetch.mockResolvedValueOnce(createMockResponse('{}'))

    const op = makeOp({
      parameters: [
        { name: 'limit', in: 'query', required: false, schema: { type: 'integer' } },
        { name: 'status', in: 'query', required: false, schema: { type: 'string' } },
      ],
    })
    await executeOperation(op, { limit: 10, status: 'active' }, baseConfig)

    const [url] = mockFetch.mock.calls[0]
    expect(url).toContain('limit=10')
    expect(url).toContain('status=active')
  })

  it('handles array query parameters', async () => {
    mockFetch.mockResolvedValueOnce(createMockResponse('{}'))

    const op = makeOp({
      parameters: [
        { name: 'tags', in: 'query', required: false, schema: { type: 'array', items: { type: 'string' } } },
      ],
    })
    await executeOperation(op, { tags: ['a', 'b'] }, baseConfig)

    const [url] = mockFetch.mock.calls[0]
    expect(url).toContain('tags=a')
    expect(url).toContain('tags=b')
  })

  it('sets custom headers from parameters', async () => {
    mockFetch.mockResolvedValueOnce(createMockResponse('{}'))

    const op = makeOp({
      parameters: [
        { name: 'X-Custom', in: 'header', required: false, schema: { type: 'string' } },
      ],
    })
    await executeOperation(op, { 'X-Custom': 'val' }, baseConfig)

    const [, init] = mockFetch.mock.calls[0]
    const headers = new Headers(init.headers)
    expect(headers.get('X-Custom')).toBe('val')
  })

  it('sends JSON body for POST requests', async () => {
    mockFetch.mockResolvedValueOnce(createMockResponse('{}', { status: 201 }))

    const op = makeOp({
      method: 'POST',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { type: 'object', properties: { name: { type: 'string' } } },
          },
        },
      },
    })
    await executeOperation(op, { body: { name: 'Rex' } }, baseConfig)

    const [, init] = mockFetch.mock.calls[0]
    expect(init.method).toBe('POST')
    expect(init.body).toBe('{"name":"Rex"}')
    const headers = new Headers(init.headers)
    expect(headers.get('Content-Type')).toBe('application/json')
  })

  it('returns validation errors for missing required params', async () => {
    const op = makeOp({
      parameters: [
        { name: 'petId', in: 'path', required: true, schema: { type: 'integer' } },
      ],
    })
    const result = await executeOperation(op, {}, baseConfig)

    expect(result).toHaveLength(1)
    if (result[0].type === 'text') {
      expect(result[0].text).toContain('Missing required path parameter: "petId"')
    }
  })

  it('returns validation error for missing required body', async () => {
    const op = makeOp({
      method: 'POST',
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { type: 'object' } } },
      },
    })
    const result = await executeOperation(op, {}, baseConfig)

    expect(result).toHaveLength(1)
    if (result[0].type === 'text') {
      expect(result[0].text).toContain('Missing required request body')
    }
  })

  it('prepends HTTP status to response', async () => {
    mockFetch.mockResolvedValueOnce(createMockResponse('{"id":1}'))

    const op = makeOp()
    const result = await executeOperation(op, {}, baseConfig)

    if (result[0].type === 'text') {
      expect(result[0].text).toContain('HTTP 200')
    }
  })

  it('handles fetch errors gracefully', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'))

    const op = makeOp()
    const config = { ...baseConfig, fetchOptions: { retries: 0, timeout: 1000 } }
    const result = await executeOperation(op, {}, config)

    expect(result).toHaveLength(1)
    if (result[0].type === 'text') {
      expect(result[0].text).toContain('Request failed')
    }
  })

  it('applies authentication', async () => {
    mockFetch.mockResolvedValueOnce(createMockResponse('{}'))

    const config: HttpClientConfig = {
      ...baseConfig,
      auth: {
        async apply(_url, init) {
          const headers = new Headers(init.headers)
          headers.set('Authorization', 'Bearer test-token')
          return { ...init, headers }
        },
      },
    }

    const op = makeOp()
    await executeOperation(op, {}, config)

    const [, init] = mockFetch.mock.calls[0]
    const headers = new Headers(init.headers)
    expect(headers.get('Authorization')).toBe('Bearer test-token')
  })

  it('handles auth failure gracefully', async () => {
    const config: HttpClientConfig = {
      ...baseConfig,
      auth: {
        async apply() {
          throw new Error('Token expired')
        },
      },
    }

    const op = makeOp()
    const result = await executeOperation(op, {}, config)

    if (result[0].type === 'text') {
      expect(result[0].text).toContain('Authentication failed: Token expired')
    }
  })

  it('refreshes authentication once after a 401 response', async () => {
    mockFetch
      .mockResolvedValueOnce(new Response('Unauthorized', { status: 401, statusText: 'Unauthorized' }))
      .mockResolvedValueOnce(createMockResponse('{"ok":true}'))

    const config: HttpClientConfig = {
      ...baseConfig,
      auth: {
        async apply(_url, init) {
          const headers = new Headers(init.headers)
          headers.set('Authorization', 'Bearer stale-token')
          return { ...init, headers }
        },
        async refresh(_url, init) {
          const headers = new Headers(init.headers)
          headers.set('Authorization', 'Bearer fresh-token')
          return { ...init, headers }
        },
      },
    }

    const op = makeOp()
    const result = await executeOperation(op, {}, config)

    expect(mockFetch).toHaveBeenCalledTimes(2)
    const firstHeaders = new Headers(mockFetch.mock.calls[0][1].headers)
    const secondHeaders = new Headers(mockFetch.mock.calls[1][1].headers)
    expect(firstHeaders.get('Authorization')).toBe('Bearer stale-token')
    expect(secondHeaders.get('Authorization')).toBe('Bearer fresh-token')
    if (result[0].type === 'text') {
      expect(result[0].text).toContain('HTTP 200')
    }
  })

  it('surfaces refresh failures after a 401 response', async () => {
    mockFetch.mockResolvedValueOnce(new Response('Unauthorized', { status: 401, statusText: 'Unauthorized' }))

    const config: HttpClientConfig = {
      ...baseConfig,
      auth: {
        async apply(_url, init) {
          const headers = new Headers(init.headers)
          headers.set('Authorization', 'Bearer stale-token')
          return { ...init, headers }
        },
        async refresh() {
          throw new Error('refresh failed')
        },
      },
    }

    const op = makeOp()
    const result = await executeOperation(op, {}, config)

    if (result[0].type === 'text') {
      expect(result[0].text).toContain('Authentication refresh failed: refresh failed')
    }
  })

  it('uses default headers from config', async () => {
    mockFetch.mockResolvedValueOnce(createMockResponse('{}'))

    const config: HttpClientConfig = {
      ...baseConfig,
      defaultHeaders: { 'X-Tenant': 'acme' },
    }

    const op = makeOp()
    await executeOperation(op, {}, config)

    const [, init] = mockFetch.mock.calls[0]
    const headers = new Headers(init.headers)
    expect(headers.get('X-Tenant')).toBe('acme')
  })

  it('handles non-serializable body', async () => {
    const op = makeOp({
      method: 'POST',
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { type: 'object' } } },
      },
    })

    // Create circular reference
    const circular: Record<string, unknown> = {}
    circular.self = circular

    const result = await executeOperation(op, { body: circular }, baseConfig)
    if (result[0].type === 'text') {
      expect(result[0].text).toContain('could not be serialized')
    }
  })
})

describe('resolveBaseUrl', () => {
  it('uses override when provided', () => {
    const spec = { servers: [{ url: 'https://api.example.com' }] } as ParsedSpec
    expect(resolveBaseUrl(spec, 'https://override.com/')).toBe('https://override.com')
  })

  it('uses first server by default', () => {
    const spec = {
      servers: [
        { url: 'https://api.example.com/v1' },
        { url: 'https://sandbox.example.com/v1' },
      ],
    } as ParsedSpec
    expect(resolveBaseUrl(spec)).toBe('https://api.example.com/v1')
  })

  it('uses specified serverIndex', () => {
    const spec = {
      servers: [
        { url: 'https://api.example.com/v1' },
        { url: 'https://sandbox.example.com/v1' },
      ],
    } as ParsedSpec
    expect(resolveBaseUrl(spec, undefined, 1)).toBe('https://sandbox.example.com/v1')
  })

  it('throws when no servers and no override', () => {
    const spec = { servers: [] } as unknown as ParsedSpec
    expect(() => resolveBaseUrl(spec)).toThrow('No server URL found')
  })

  it('resolves server variables with defaults', () => {
    const spec = {
      servers: [
        {
          url: 'https://{env}.api.com/{ver}',
          variables: {
            env: { default: 'prod', enum: ['dev', 'prod'] },
            ver: { default: 'v1' },
          },
        },
      ],
    } as ParsedSpec
    expect(resolveBaseUrl(spec)).toBe('https://prod.api.com/v1')
  })
})

describe('resolveServerUrl', () => {
  it('preserves http:// protocol', () => {
    const url = resolveServerUrl({ url: 'http://localhost:3000' })
    expect(url).toBe('http://localhost:3000')
  })

  it('replaces all occurrences of a variable', () => {
    const url = resolveServerUrl({
      url: 'https://{region}.api.com/{region}/data',
      variables: { region: { default: 'us' } },
    })
    expect(url).toBe('https://us.api.com/us/data')
  })
})
