import type { ResolvedAuth } from '../auth/types.js'
import type { ParsedOperation, ParsedServer, ParsedSpec } from '../parser/types.js'
import { fetchWithRetry, type FetchWithRetryOptions } from '../utils/fetch.js'
import { handleResponse } from './response-handler.js'

type TextContent = { type: 'text'; text: string }
type ImageContent = { type: 'image'; data: string; mimeType: string }
type ContentBlock = TextContent | ImageContent

export interface HttpClientConfig {
  baseUrl: string
  auth: ResolvedAuth | null
  defaultHeaders?: Record<string, string>
  fetchOptions?: FetchWithRetryOptions
}

export function resolveServerUrl(server: ParsedServer, variableOverrides?: Record<string, string>): string {
  let url = server.url

  if (server.variables) {
    for (const [name, variable] of Object.entries(server.variables)) {
      const value = variableOverrides?.[name] ?? variable.default
      if (variable.enum && !variable.enum.includes(value)) {
        throw new Error(`Invalid value "${value}" for server variable "${name}". Allowed: ${variable.enum.join(', ')}`)
      }
      url = url.replaceAll(`{${name}}`, value)
    }
  }

  return normalizeUrl(url)
}

function normalizeUrl(url: string): string {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `https://${url}`
  }
  return url.replace(/\/$/, '')
}

export function resolveBaseUrl(spec: ParsedSpec, overrideBaseUrl?: string, serverIndex?: number): string {
  if (overrideBaseUrl) return overrideBaseUrl.replace(/\/$/, '')

  const index = serverIndex ?? 0
  const server = spec.servers[index]
  if (server) {
    return resolveServerUrl(server)
  }

  throw new Error('No server URL found in spec and no baseUrl provided')
}

export async function executeOperation(
  operation: ParsedOperation,
  args: Record<string, unknown>,
  config: HttpClientConfig
): Promise<ContentBlock[]> {
  const validationErrors = validateRequiredParams(operation, args)
  if (validationErrors.length > 0) {
    return [{ type: 'text' as const, text: `Validation errors:\n${validationErrors.join('\n')}` }]
  }

  let path = operation.path

  for (const param of operation.parameters) {
    if (param.in === 'path' && args[param.name] !== undefined) {
      const value = encodeURIComponent(String(args[param.name]))
      path = path.replaceAll(`{${param.name}}`, value)
    }
  }

  const url = new URL(`${config.baseUrl}${path}`)

  for (const param of operation.parameters) {
    if (param.in === 'query' && args[param.name] !== undefined) {
      const val = args[param.name]
      if (Array.isArray(val)) {
        for (const item of val) {
          url.searchParams.append(param.name, String(item))
        }
      } else {
        url.searchParams.set(param.name, String(val))
      }
    }
  }

  const headers = new Headers(config.defaultHeaders)

  const produces = getResponseMediaTypes(operation)
  headers.set('Accept', produces.length > 0 ? produces.join(', ') : 'application/json')

  for (const param of operation.parameters) {
    if (param.in === 'header' && args[param.name] !== undefined) {
      headers.set(param.name, String(args[param.name]))
    }
  }

  let body: string | undefined
  if (args['body'] !== undefined && operation.requestBody) {
    const contentType = getRequestContentType(operation)
    headers.set('Content-Type', contentType)

    try {
      body = JSON.stringify(args['body'])
    } catch {
      return [{ type: 'text' as const, text: 'Error: request body could not be serialized to JSON' }]
    }
  }

  let init: RequestInit = {
    method: operation.method,
    headers,
    body,
  }

  if (config.auth) {
    try {
      init = await config.auth.apply(url, init)
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      return [{ type: 'text' as const, text: `Authentication failed: ${msg}` }]
    }
  }

  try {
    const response = await fetchWithRetry(url.toString(), init, config.fetchOptions)
    const statusPrefix = `HTTP ${response.status} ${response.statusText}\n\n`
    const content = await handleResponse(response)

    if (content.length > 0 && content[0].type === 'text') {
      content[0] = { type: 'text', text: statusPrefix + content[0].text }
    }

    return content
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return [{ type: 'text' as const, text: `Request failed: ${msg}` }]
  }
}

function validateRequiredParams(
  operation: ParsedOperation,
  args: Record<string, unknown>
): string[] {
  const errors: string[] = []

  for (const param of operation.parameters) {
    if (param.required && args[param.name] === undefined) {
      errors.push(`- Missing required ${param.in} parameter: "${param.name}"`)
    }
  }

  if (operation.requestBody?.required && args['body'] === undefined) {
    errors.push('- Missing required request body')
  }

  return errors
}

function getResponseMediaTypes(operation: ParsedOperation): string[] {
  const types = new Set<string>()

  for (const resp of Object.values(operation.responses)) {
    if (resp.content) {
      for (const mediaType of Object.keys(resp.content)) {
        types.add(mediaType)
      }
    }
  }

  return Array.from(types)
}

function getRequestContentType(operation: ParsedOperation): string {
  if (!operation.requestBody?.content) return 'application/json'

  const mediaTypes = Object.keys(operation.requestBody.content)
  if (mediaTypes.includes('application/json')) return 'application/json'

  return mediaTypes[0] ?? 'application/json'
}
