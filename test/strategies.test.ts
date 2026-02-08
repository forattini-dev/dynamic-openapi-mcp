import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  BearerAuth,
  ApiKeyAuth,
  BasicAuth,
  OAuth2ClientCredentials,
  CustomAuth,
  CompositeAuth,
  createAuthFromScheme,
} from '../src/auth/strategies.js'

describe('BearerAuth', () => {
  it('sets Authorization header', async () => {
    const auth = new BearerAuth('my-token')
    const result = await auth.apply(new URL('https://api.test.com'), { headers: new Headers() })
    const headers = new Headers(result.headers)
    expect(headers.get('Authorization')).toBe('Bearer my-token')
  })
})

describe('ApiKeyAuth', () => {
  it('sets header-based API key', async () => {
    const auth = new ApiKeyAuth('key123', 'X-API-Key', 'header')
    const result = await auth.apply(new URL('https://api.test.com'), { headers: new Headers() })
    const headers = new Headers(result.headers)
    expect(headers.get('X-API-Key')).toBe('key123')
  })

  it('sets query-based API key', async () => {
    const auth = new ApiKeyAuth('key123', 'api_key', 'query')
    const url = new URL('https://api.test.com/path')
    await auth.apply(url, { headers: new Headers() })
    expect(url.searchParams.get('api_key')).toBe('key123')
  })

  it('sets cookie-based API key', async () => {
    const auth = new ApiKeyAuth('key123', 'session', 'cookie')
    const result = await auth.apply(new URL('https://api.test.com'), { headers: new Headers() })
    const headers = new Headers(result.headers)
    expect(headers.get('Cookie')).toContain('session=key123')
  })

  it('appends to existing cookies', async () => {
    const auth = new ApiKeyAuth('key123', 'session', 'cookie')
    const existingHeaders = new Headers({ Cookie: 'existing=val' })
    const result = await auth.apply(new URL('https://api.test.com'), { headers: existingHeaders })
    const headers = new Headers(result.headers)
    expect(headers.get('Cookie')).toContain('existing=val')
    expect(headers.get('Cookie')).toContain('session=key123')
  })
})

describe('BasicAuth', () => {
  it('sets Authorization header with base64 encoding', async () => {
    const auth = new BasicAuth('user', 'pass')
    const result = await auth.apply(new URL('https://api.test.com'), { headers: new Headers() })
    const headers = new Headers(result.headers)
    const expected = `Basic ${Buffer.from('user:pass').toString('base64')}`
    expect(headers.get('Authorization')).toBe(expected)
  })
})

describe('OAuth2ClientCredentials', () => {
  const mockFetch = vi.fn()

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fetches token and sets Authorization header', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: 'oauth-token', expires_in: 3600 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )

    const auth = new OAuth2ClientCredentials('client-id', 'client-secret', 'https://auth.test.com/token')
    const result = await auth.apply(new URL('https://api.test.com'), { headers: new Headers() })

    const headers = new Headers(result.headers)
    expect(headers.get('Authorization')).toBe('Bearer oauth-token')
  })

  it('caches token on subsequent calls', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: 'cached-token', expires_in: 3600 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )

    const auth = new OAuth2ClientCredentials('id', 'secret', 'https://auth.test.com/token')
    await auth.apply(new URL('https://api.test.com'), { headers: new Headers() })
    const result = await auth.apply(new URL('https://api.test.com'), { headers: new Headers() })

    expect(mockFetch).toHaveBeenCalledOnce() // Only one fetch
    const headers = new Headers(result.headers)
    expect(headers.get('Authorization')).toBe('Bearer cached-token')
  })

  it('throws on failed token request', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('Unauthorized', { status: 401, statusText: 'Unauthorized' })
    )

    const auth = new OAuth2ClientCredentials('id', 'secret', 'https://auth.test.com/token')
    await expect(
      auth.apply(new URL('https://api.test.com'), { headers: new Headers() })
    ).rejects.toThrow('OAuth2 token request failed')
  })

  it('throws on invalid JSON response', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('not json', { status: 200, headers: { 'content-type': 'application/json' } })
    )

    const auth = new OAuth2ClientCredentials('id', 'secret', 'https://auth.test.com/token')
    await expect(
      auth.apply(new URL('https://api.test.com'), { headers: new Headers() })
    ).rejects.toThrow('not valid JSON')
  })

  it('throws on missing access_token', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ token_type: 'bearer' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )

    const auth = new OAuth2ClientCredentials('id', 'secret', 'https://auth.test.com/token')
    await expect(
      auth.apply(new URL('https://api.test.com'), { headers: new Headers() })
    ).rejects.toThrow('missing "access_token"')
  })

  it('sends scopes when provided', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: 'scoped-token', expires_in: 3600 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )

    const auth = new OAuth2ClientCredentials('id', 'secret', 'https://auth.test.com/token', ['read', 'write'])
    await auth.apply(new URL('https://api.test.com'), { headers: new Headers() })

    const [, init] = mockFetch.mock.calls[0]
    const body = init.body as URLSearchParams
    expect(body.get('scope')).toBe('read write')
  })
})

describe('CustomAuth', () => {
  it('calls custom handler', async () => {
    const auth = new CustomAuth((url, init) => {
      const headers = new Headers(init.headers)
      headers.set('X-Custom', 'custom-val')
      return { ...init, headers }
    })

    const result = await auth.apply(new URL('https://api.test.com'), { headers: new Headers() })
    const headers = new Headers(result.headers)
    expect(headers.get('X-Custom')).toBe('custom-val')
  })
})

describe('CompositeAuth', () => {
  it('applies multiple strategies in order', async () => {
    const bearer = new BearerAuth('token')
    const apiKey = new ApiKeyAuth('key', 'X-Key', 'header')
    const composite = new CompositeAuth([bearer, apiKey])

    const result = await composite.apply(new URL('https://api.test.com'), { headers: new Headers() })
    const headers = new Headers(result.headers)
    expect(headers.get('Authorization')).toBe('Bearer token')
    expect(headers.get('X-Key')).toBe('key')
  })
})

describe('createAuthFromScheme', () => {
  it('creates BearerAuth from http/bearer scheme', () => {
    const auth = createAuthFromScheme({ type: 'http', scheme: 'bearer' }, 'my-token')
    expect(auth).toBeInstanceOf(BearerAuth)
  })

  it('creates BasicAuth from http/basic scheme', () => {
    const auth = createAuthFromScheme({ type: 'http', scheme: 'basic' }, 'user:pass')
    expect(auth).toBeInstanceOf(BasicAuth)
  })

  it('creates BasicAuth with empty password when no colon', () => {
    const auth = createAuthFromScheme({ type: 'http', scheme: 'basic' }, 'justuser')
    expect(auth).toBeInstanceOf(BasicAuth)
  })

  it('creates ApiKeyAuth from apiKey scheme', () => {
    const auth = createAuthFromScheme(
      { type: 'apiKey', name: 'X-Key', in: 'header' },
      'key123'
    )
    expect(auth).toBeInstanceOf(ApiKeyAuth)
  })

  it('creates ApiKeyAuth with query location', () => {
    const auth = createAuthFromScheme(
      { type: 'apiKey', name: 'api_key', in: 'query' },
      'key123'
    )
    expect(auth).toBeInstanceOf(ApiKeyAuth)
  })

  it('defaults to header for unknown apiKey location', () => {
    const auth = createAuthFromScheme(
      { type: 'apiKey', name: 'key', in: 'unknown' as any },
      'key123'
    )
    expect(auth).toBeInstanceOf(ApiKeyAuth)
  })

  it('returns null for unsupported http scheme', () => {
    const auth = createAuthFromScheme({ type: 'http', scheme: 'digest' }, 'cred')
    expect(auth).toBeNull()
  })

  it('returns null for unsupported scheme type', () => {
    const auth = createAuthFromScheme({ type: 'openIdConnect', openIdConnectUrl: 'https://...' } as any, 'cred')
    expect(auth).toBeNull()
  })
})
