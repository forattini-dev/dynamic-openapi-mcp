import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import type { AuthConfig, ResolvedAuth } from 'dynamic-openapi-tools/auth'
import {
  resolveAuth,
  createOAuth2AuthCodeAuth,
  detectOAuth2AuthCode,
} from 'dynamic-openapi-tools/auth'
import { loadSpec, resolveSpec, filterOperations } from 'dynamic-openapi-tools/parser'
import type { OpenAPIV3 } from 'dynamic-openapi-tools/parser'
import type { ParsedSpec, OperationFilters } from 'dynamic-openapi-tools/parser'
import type { FetchWithRetryOptions } from 'dynamic-openapi-tools/utils'
import { resolveBaseUrl, type HttpClientConfig } from './http/client.js'
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
  /** Filter which operations become MCP tools. `x-hidden: true` on the operation is always honored. */
  filters?: OperationFilters
}

export interface OpenApiMcp {
  server: McpServer
  spec: ParsedSpec
  serve(): Promise<void>
}

export async function createOpenApiMcp(options: OpenApiMcpOptions): Promise<OpenApiMcp> {
  const doc = await loadSpec(options.source)
  const spec = await resolveSpec(doc)
  spec.operations = filterOperations(spec.operations, options.filters)

  const serverName = options.name ?? spec.title ?? 'dynamic-openapi-mcp'
  const serverVersion = options.version ?? spec.version ?? '1.0.0'

  const server = new McpServer({
    name: serverName,
    version: serverVersion,
  })

  const auth = resolveAuthWithOAuth2(spec, options.auth, serverName)
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

/**
 * Use the tools' resolveAuth first (bearer, basic, apiKey, client-credentials);
 * if nothing matched AND the spec declares an OAuth2 authorization-code flow
 * with OPENAPI_OAUTH2_CLIENT_ID in the env, fall back to the interactive flow.
 * The serverName scopes the encrypted token cache so multiple MCPs on the
 * same host do not collide.
 */
function resolveAuthWithOAuth2(
  spec: ParsedSpec,
  authConfig: AuthConfig | undefined,
  serverName: string
): ResolvedAuth | null {
  const resolved = resolveAuth(authConfig, spec.securitySchemes)
  if (resolved) return resolved
  const detected = detectOAuth2AuthCode(spec.securitySchemes, { appName: serverName })
  if (detected) return createOAuth2AuthCodeAuth(detected.config)
  return null
}
