import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { ParsedSpec } from 'dynamic-openapi-tools/parser'
import { sanitizeToolName, truncateDescription } from 'dynamic-openapi-tools/utils'
import type { HttpClientConfig } from '../http/client.js'
import { executeOperation, resolveServerUrl } from '../http/client.js'
import { buildToolInputSchema } from './schema-converter.js'

export function registerTools(server: McpServer, spec: ParsedSpec, httpConfig: HttpClientConfig): void {
  for (const operation of spec.operations) {
    const toolName = sanitizeToolName(operation.operationId)
    const rawDescription = (operation.summary ?? operation.description ?? '').trim().replace(/\s+/g, ' ')
    const prefix = operation.deprecated ? '[DEPRECATED] ' : ''
    const description = truncateDescription(`${prefix}${rawDescription}`) || `${operation.method} ${operation.path}`
    const shape = buildToolInputSchema(operation)

    server.tool(
      toolName,
      description,
      shape,
      async (args: Record<string, unknown>) => {
        const content = await executeOperation(operation, args, httpConfig)
        return { content }
      }
    )
  }

  if (spec.servers.length > 0) {
    registerSetEnvironmentTool(server, spec, httpConfig)
  }
}

function registerSetEnvironmentTool(server: McpServer, spec: ParsedSpec, httpConfig: HttpClientConfig): void {
  const shape = {
    server_index: z.number().int().min(0).optional().describe('Index of the server to use (0-based)'),
    server_url: z.string().optional().describe('Direct URL override (takes precedence over server_index)'),
    variables: z.record(z.string()).optional().describe('Server variable overrides (e.g. {"environment": "staging"})'),
  }

  server.tool(
    'set_environment',
    'Switch the active API server/environment. Lists available servers when called without arguments.',
    shape,
    async (args: { server_index?: number; server_url?: string; variables?: Record<string, string> }) => {
      const lines: string[] = []

      if (args.server_url) {
        httpConfig.baseUrl = args.server_url.replace(/\/$/, '')
        lines.push(`Active server set to: ${httpConfig.baseUrl}`)
      } else if (args.server_index !== undefined) {
        const server = spec.servers[args.server_index]
        if (!server) {
          return {
            content: [{ type: 'text' as const, text: `Invalid server_index ${args.server_index}. Available: 0-${spec.servers.length - 1}` }],
          }
        }
        httpConfig.baseUrl = resolveServerUrl(server, args.variables)
        lines.push(`Active server set to: ${httpConfig.baseUrl}`)
        if (server.description) lines.push(`  (${server.description})`)
      } else if (args.variables) {
        // Find current active server to re-resolve with new variables
        const current = spec.servers.find((s) => {
          try { return resolveServerUrl(s) === httpConfig.baseUrl } catch { return false }
        })
        if (current) {
          httpConfig.baseUrl = resolveServerUrl(current, args.variables)
          lines.push(`Active server re-resolved to: ${httpConfig.baseUrl}`)
        } else {
          return {
            content: [{ type: 'text' as const, text: 'Cannot apply variables: current baseUrl does not match any known server. Use server_index or server_url instead.' }],
          }
        }
      } else {
        lines.push(`Current active server: ${httpConfig.baseUrl}`)
      }

      lines.push('', 'Available servers:')
      for (let i = 0; i < spec.servers.length; i++) {
        const s = spec.servers[i]
        const resolved = tryResolveUrl(s)
        const active = resolved === httpConfig.baseUrl ? ' [active]' : ''
        const desc = s.description ? ` — ${s.description}` : ''
        lines.push(`  [${i}] ${s.url}${desc}${active}`)

        if (s.variables) {
          for (const [name, v] of Object.entries(s.variables)) {
            const enumStr = v.enum ? ` enum=[${v.enum.join(',')}]` : ''
            lines.push(`       {${name}}: default="${v.default}"${enumStr}${v.description ? ` — ${v.description}` : ''}`)
          }
        }
      }

      return {
        content: [{ type: 'text' as const, text: lines.join('\n') }],
      }
    }
  )
}

function tryResolveUrl(server: import('dynamic-openapi-tools/parser').ParsedServer): string | null {
  try {
    return resolveServerUrl(server)
  } catch {
    return null
  }
}
