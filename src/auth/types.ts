export interface AuthConfig {
  bearerToken?: string
  apiKey?: string
  basicAuth?: { username: string; password: string }
  oauth2?: {
    clientId: string
    clientSecret: string
    tokenUrl: string
    scopes?: string[]
  }
  custom?: (url: string, init: RequestInit) => RequestInit | Promise<RequestInit>
}

export interface ResolvedAuth {
  apply(url: URL, init: RequestInit): Promise<RequestInit>
}
