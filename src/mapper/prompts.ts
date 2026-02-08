import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { ParsedSpec, ParsedOperation, ParsedResponse, ParsedTag } from '../parser/types.js'
import type { HttpClientConfig } from '../http/client.js'
import { resolveServerUrl } from '../http/client.js'

export function registerPrompts(server: McpServer, spec: ParsedSpec, httpConfig: HttpClientConfig): void {
  server.prompt(
    'describe-api',
    'Get an overview of this API including endpoints, authentication, and capabilities',
    {},
    async () => {
      const endpoints = spec.operations.map((op) => {
        const prefix = op.deprecated ? '[DEPRECATED] ' : ''
        return `  ${prefix}${op.method.padEnd(7)} ${op.path} - ${op.summary ?? op.operationId}`
      })

      const authSchemes = Object.entries(spec.securitySchemes)
        .map(([name, scheme]) => `  ${name}: ${scheme.type}${('scheme' in scheme) ? ` (${scheme.scheme})` : ''}`)

      const text = [
        `# ${spec.title} v${spec.version}`,
        '',
        spec.description ?? '',
        '',
        formatServersSection(spec, httpConfig),
        '',
        formatExternalDocsSection(spec),
        '',
        `## Endpoints (${spec.operations.length})`,
        ...endpoints,
        '',
        `## Authentication`,
        authSchemes.length > 0 ? authSchemes.join('\n') : '  None required',
        '',
        `## Schemas`,
        Object.keys(spec.schemas).map((name) => `  - ${name}`).join('\n') || '  None defined',
        '',
        formatTagsSection(spec),
      ]
        .filter((line) => line !== undefined && line !== '')
        .join('\n')

      return {
        messages: [
          {
            role: 'user' as const,
            content: { type: 'text' as const, text },
          },
        ],
      }
    }
  )

  server.prompt(
    'explore-endpoint',
    'Get detailed information about a specific API endpoint',
    { operationId: z.string().describe('The operationId of the endpoint to explore') },
    async ({ operationId }) => {
      const operation = spec.operations.find((op) => op.operationId === operationId)

      if (!operation) {
        const available = spec.operations.map((op) => op.operationId).join(', ')
        return {
          messages: [
            {
              role: 'user' as const,
              content: {
                type: 'text' as const,
                text: `Operation "${operationId}" not found. Available operations: ${available}`,
              },
            },
          ],
        }
      }

      const text = buildEndpointPrompt(operation, spec.tags)

      return {
        messages: [
          {
            role: 'user' as const,
            content: { type: 'text' as const, text },
          },
        ],
      }
    }
  )
}

function formatServersSection(spec: ParsedSpec, httpConfig: HttpClientConfig): string {
  if (spec.servers.length === 0) return '## Servers\n  (not specified)'

  const lines = ['## Servers']
  for (let i = 0; i < spec.servers.length; i++) {
    const s = spec.servers[i]
    let resolved: string | null = null
    try { resolved = resolveServerUrl(s) } catch { /* skip */ }
    const active = resolved === httpConfig.baseUrl ? ' [active]' : ''
    const desc = s.description ? ` — ${s.description}` : ''
    lines.push(`  [${i}]${active} ${s.url}${desc}`)

    if (s.variables) {
      for (const [name, v] of Object.entries(s.variables)) {
        const enumStr = v.enum ? `=[${v.enum.join(',')}]` : ''
        lines.push(`       {${name}}: default="${v.default}"${enumStr}${v.description ? ` — ${v.description}` : ''}`)
      }
    }
  }

  if (spec.servers.length > 1) {
    lines.push('', '  Use the `set_environment` tool to switch servers.')
  }

  return lines.join('\n')
}

function formatTagsSection(spec: ParsedSpec): string {
  if (spec.tags.length === 0) return ''

  const lines = ['## Tags']
  for (const tag of spec.tags) {
    let line = `  - **${tag.name}**`
    if (tag.description) line += `: ${tag.description}`
    if (tag.externalDocs) line += ` (docs: ${tag.externalDocs.url})`
    lines.push(line)
  }
  return lines.join('\n')
}

function formatExternalDocsSection(spec: ParsedSpec): string {
  if (!spec.externalDocs) return ''
  const desc = spec.externalDocs.description ? `${spec.externalDocs.description}: ` : ''
  return `## External Documentation\n  ${desc}${spec.externalDocs.url}`
}

function buildEndpointPrompt(operation: ParsedOperation, globalTags: ParsedTag[]): string {
  const deprecatedTag = operation.deprecated ? ' [DEPRECATED]' : ''

  const params = operation.parameters.map((p) => {
    const parts = [
      `  - ${p.name} (${p.in}, ${p.required ? 'required' : 'optional'})`,
    ]
    if (p.deprecated) parts[0] += ' [DEPRECATED]'
    parts[0] += `: ${p.description ?? p.schema.type ?? 'any'}`
    if (p.schema.format) parts[0] += ` (format: ${p.schema.format})`
    if (p.example !== undefined) parts[0] += ` — example: ${formatExample(p.example)}`
    return parts[0]
  })

  const responses = formatResponses(operation.responses)
  const links = formatLinks(operation.responses)

  const sections = [
    `# ${operation.method} ${operation.path}${deprecatedTag}`,
    `operationId: ${operation.operationId}`,
    '',
    operation.summary ? `**Summary**: ${operation.summary}` : '',
    operation.description ? `**Description**: ${operation.description}` : '',
    '',
    `## Parameters`,
    params.length > 0 ? params.join('\n') : '  None',
    '',
    formatRequestBody(operation),
    '',
    `## Responses`,
    ...responses,
    '',
  ]

  if (links.length > 0) {
    sections.push(`## Links`, ...links, '')
  }

  sections.push(
    `## Security`,
    operation.security.length > 0
      ? operation.security.map((s) => `  ${Object.keys(s).join(', ')}`).join('\n')
      : '  None',
    '',
  )

  if (operation.tags.length > 0) {
    const tagLines = ['## Tags']
    for (const tagName of operation.tags) {
      const globalTag = globalTags.find((t) => t.name === tagName)
      let line = `  - **${tagName}**`
      if (globalTag?.description) line += `: ${globalTag.description}`
      if (globalTag?.externalDocs) line += ` (docs: ${globalTag.externalDocs.url})`
      tagLines.push(line)
    }
    sections.push(tagLines.join('\n'))
  }

  if (operation.externalDocs) {
    const desc = operation.externalDocs.description ? `${operation.externalDocs.description}: ` : ''
    sections.push('', `## External Documentation`, `  ${desc}${operation.externalDocs.url}`)
  }

  return sections
    .filter((line) => line !== undefined)
    .join('\n')
}

function formatRequestBody(operation: ParsedOperation): string {
  if (!operation.requestBody) return ''

  const lines = [
    `## Request Body ${operation.requestBody.required ? '(required)' : '(optional)'}`,
    operation.requestBody.description ?? '',
    '```json',
    safeStringify(
      Object.values(operation.requestBody.content)[0]?.schema ?? {},
      null,
      2
    ),
    '```',
  ]

  const jsonContent = operation.requestBody.content['application/json'] ??
    Object.values(operation.requestBody.content)[0]

  if (jsonContent?.example !== undefined) {
    lines.push('', '**Example:**', '```json', safeStringify(jsonContent.example, null, 2), '```')
  }

  return lines.join('\n')
}

function formatResponses(responses: Record<string, ParsedResponse>): string[] {
  const lines: string[] = []

  for (const [code, resp] of Object.entries(responses)) {
    lines.push(`  ${code}: ${resp.description || '(no description)'}`)

    if (resp.schema) {
      lines.push('  ```json', `  ${safeStringify(resp.schema, null, 2).split('\n').join('\n  ')}`, '  ```')
    }

    if (resp.example !== undefined) {
      lines.push(`  Example:`)
      lines.push('  ```json', `  ${safeStringify(resp.example, null, 2).split('\n').join('\n  ')}`, '  ```')
    }
  }

  return lines
}

function formatLinks(responses: Record<string, ParsedResponse>): string[] {
  const lines: string[] = []

  for (const [code, resp] of Object.entries(responses)) {
    if (!resp.links) continue
    for (const [, link] of Object.entries(resp.links)) {
      const target = link.operationId ?? link.operationRef ?? '(unknown)'
      const params = link.parameters
        ? Object.entries(link.parameters).map(([k, v]) => `${k}=${v}`).join(', ')
        : ''
      const desc = link.description ? ` — ${link.description}` : ''
      lines.push(`  After ${code} response, call \`${target}\`${params ? ` with {${params}}` : ''}${desc}`)
    }
  }

  return lines
}

function formatExample(value: unknown): string {
  if (typeof value === 'string') return value
  return safeStringify(value)
}

function safeStringify(value: unknown, _replacer?: unknown, indent?: number): string {
  try {
    return JSON.stringify(value, null, indent)
  } catch {
    return '(circular or non-serializable)'
  }
}
