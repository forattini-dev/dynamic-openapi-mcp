import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import type { OpenAPIV3 } from 'openapi-types'
import type { AuthConfig } from './auth/types.js'
import { resolveAuth } from './auth/resolver.js'
import { loadSpec } from './parser/loader.js'
import { resolveSpec } from './parser/resolver.js'
import type { ParsedSpec } from './parser/types.js'
import { resolveBaseUrl, type HttpClientConfig } from './http/client.js'
import type { FetchWithRetryOptions } from './utils/fetch.js'
import { registerTools } from './mapper/tools.js'
import { registerResources } from './mapper/resources.js'
import { registerPrompts } from './mapper/prompts.js'

export interface OpenApiMcpOptions {
  source: string | OpenAPIV3.Document
  name?: string
  version?: string
  baseUrl?: string
  serverIndex?: number
  auth?: AuthConfig
  headers?: Record<string, string>
  fetchOptions?: FetchWithRetryOptions
}

export interface OpenApiMcp {
  server: McpServer
  spec: ParsedSpec
  serve(): Promise<void>
}

export async function createOpenApiMcp(options: OpenApiMcpOptions): Promise<OpenApiMcp> {
  const doc = await loadSpec(options.source)
  const spec = await resolveSpec(doc)

  const serverName = options.name ?? spec.title ?? 'openapi-mcp'
  const serverVersion = options.version ?? spec.version ?? '1.0.0'

  const server = new McpServer({
    name: serverName,
    version: serverVersion,
  })

  const auth = resolveAuth(options.auth, spec.securitySchemes)
  const baseUrl = resolveBaseUrl(spec, options.baseUrl, options.serverIndex)

  const httpConfig: HttpClientConfig = {
    baseUrl,
    auth,
    defaultHeaders: options.headers,
    fetchOptions: options.fetchOptions,
  }

  registerTools(server, spec, httpConfig)
  registerResources(server, spec)
  registerPrompts(server, spec, httpConfig)

  return {
    server,
    spec,
    async serve() {
      const transport = new StdioServerTransport()
      await server.connect(transport)
    },
  }
}
