import type { OpenAPIV3 } from 'openapi-types'
import type { ResolvedAuth } from './types.js'
import { fetchWithRetry } from '../utils/fetch.js'

export class BearerAuth implements ResolvedAuth {
  constructor(private token: string) {}

  async apply(_url: URL, init: RequestInit): Promise<RequestInit> {
    const headers = new Headers(init.headers)
    headers.set('Authorization', `Bearer ${this.token}`)
    return { ...init, headers }
  }
}

export class ApiKeyAuth implements ResolvedAuth {
  constructor(
    private key: string,
    private paramName: string,
    private location: 'header' | 'query' | 'cookie'
  ) {}

  async apply(url: URL, init: RequestInit): Promise<RequestInit> {
    switch (this.location) {
      case 'header': {
        const headers = new Headers(init.headers)
        headers.set(this.paramName, this.key)
        return { ...init, headers }
      }
      case 'query': {
        url.searchParams.set(this.paramName, this.key)
        return init
      }
      case 'cookie': {
        const headers = new Headers(init.headers)
        const existing = headers.get('Cookie') ?? ''
        const encodedKey = encodeURIComponent(this.paramName)
        const encodedValue = encodeURIComponent(this.key)
        const cookie = existing
          ? `${existing}; ${encodedKey}=${encodedValue}`
          : `${encodedKey}=${encodedValue}`
        headers.set('Cookie', cookie)
        return { ...init, headers }
      }
    }
  }
}

export class BasicAuth implements ResolvedAuth {
  constructor(
    private username: string,
    private password: string
  ) {}

  async apply(_url: URL, init: RequestInit): Promise<RequestInit> {
    const credentials = `${this.username}:${this.password}`
    const encoded = Buffer.from(credentials, 'utf-8').toString('base64')
    const headers = new Headers(init.headers)
    headers.set('Authorization', `Basic ${encoded}`)
    return { ...init, headers }
  }
}

export class OAuth2ClientCredentials implements ResolvedAuth {
  private tokenCache: { token: string; expiresAt: number } | null = null
  private pendingRefresh: Promise<string> | null = null

  constructor(
    private clientId: string,
    private clientSecret: string,
    private tokenUrl: string,
    private scopes: string[] = []
  ) {}

  async apply(_url: URL, init: RequestInit): Promise<RequestInit> {
    const token = await this.getToken()
    const headers = new Headers(init.headers)
    headers.set('Authorization', `Bearer ${token}`)
    return { ...init, headers }
  }

  private async getToken(): Promise<string> {
    if (this.tokenCache && Date.now() < this.tokenCache.expiresAt) {
      return this.tokenCache.token
    }

    if (this.pendingRefresh) {
      return this.pendingRefresh
    }

    this.pendingRefresh = this.fetchToken()

    try {
      return await this.pendingRefresh
    } finally {
      this.pendingRefresh = null
    }
  }

  private async fetchToken(): Promise<string> {
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.clientId,
      client_secret: this.clientSecret,
    })

    if (this.scopes.length > 0) {
      body.set('scope', this.scopes.join(' '))
    }

    const res = await fetchWithRetry(this.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    }, { retries: 2, timeout: 15_000 })

    if (!res.ok) {
      const errorBody = await res.text().catch(() => '')
      throw new Error(
        `OAuth2 token request failed: ${res.status} ${res.statusText}${errorBody ? ` - ${errorBody}` : ''}`
      )
    }

    let data: Record<string, unknown>
    try {
      data = await res.json() as Record<string, unknown>
    } catch {
      throw new Error('OAuth2 token response is not valid JSON')
    }

    if (typeof data.access_token !== 'string' || !data.access_token) {
      throw new Error('OAuth2 token response missing "access_token" field')
    }

    const expiresIn = typeof data.expires_in === 'number' ? data.expires_in : 3600
    const bufferSeconds = Math.min(60, expiresIn * 0.1)

    this.tokenCache = {
      token: data.access_token,
      expiresAt: Date.now() + (expiresIn - bufferSeconds) * 1000,
    }

    return data.access_token
  }
}

export class CustomAuth implements ResolvedAuth {
  constructor(private handler: (url: string, init: RequestInit) => RequestInit | Promise<RequestInit>) {}

  async apply(url: URL, init: RequestInit): Promise<RequestInit> {
    return this.handler(url.toString(), init)
  }
}

export class CompositeAuth implements ResolvedAuth {
  constructor(private strategies: ResolvedAuth[]) {}

  async apply(url: URL, init: RequestInit): Promise<RequestInit> {
    let result = init
    for (const strategy of this.strategies) {
      result = await strategy.apply(url, result)
    }
    return result
  }
}

export function createAuthFromScheme(
  scheme: OpenAPIV3.SecuritySchemeObject,
  credential: string
): ResolvedAuth | null {
  switch (scheme.type) {
    case 'http': {
      if (scheme.scheme === 'bearer') {
        return new BearerAuth(credential)
      }
      if (scheme.scheme === 'basic') {
        const colonIndex = credential.indexOf(':')
        if (colonIndex === -1) {
          return new BasicAuth(credential, '')
        }
        return new BasicAuth(credential.slice(0, colonIndex), credential.slice(colonIndex + 1))
      }
      return null
    }
    case 'apiKey': {
      const location = scheme.in as 'header' | 'query' | 'cookie'
      if (!['header', 'query', 'cookie'].includes(location)) {
        return new ApiKeyAuth(credential, scheme.name, 'header')
      }
      return new ApiKeyAuth(credential, scheme.name, location)
    }
    default:
      return null
  }
}
