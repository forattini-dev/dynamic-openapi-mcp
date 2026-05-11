import type { OpenAPIV3, ParsedOperation, ParsedParameter, ParsedResponse } from 'dynamic-openapi-tools/parser'

const MAX_DESCRIPTION_CHARS = 1024
const MAX_PARAMETERS_LISTED = 8

/**
 * Build a richer MCP tool description by synthesising structured context from
 * the OpenAPI operation. The raw `summary`/`description` from most specs is
 * thin or empty ("POST /pets"), which forces agents to guess intent or fetch
 * the spec on every call. Surfacing the parameter signature and response
 * shape up-front trades a one-time token cost for accurate dispatch.
 *
 * The `x-description-override` vendor extension wins outright when present —
 * teams who curate descriptions for agent consumption can drop the synthesis.
 */
export function buildToolDescription(operation: ParsedOperation): string {
  const override = readDescriptionOverride(operation)
  if (override) return truncate(override, MAX_DESCRIPTION_CHARS)

  const lines: string[] = []
  lines.push(headline(operation))

  const paramSummary = describeParameters(operation.parameters)
  if (paramSummary) lines.push('', paramSummary)

  const bodySummary = describeRequestBody(operation)
  if (bodySummary) lines.push('', bodySummary)

  const returnsSummary = describeReturns(operation.responses)
  if (returnsSummary) lines.push('', returnsSummary)

  return truncate(lines.join('\n'), MAX_DESCRIPTION_CHARS)
}

function readDescriptionOverride(operation: ParsedOperation): string | null {
  const bag = operation as unknown as Record<string, unknown>
  const direct = bag['x-description-override']
  if (typeof direct === 'string' && direct.trim()) return direct.trim()

  const extensions = bag['extensions']
  if (extensions && typeof extensions === 'object') {
    const fromBag = (extensions as Record<string, unknown>)['x-description-override']
    if (typeof fromBag === 'string' && fromBag.trim()) return fromBag.trim()
  }

  return null
}

function headline(operation: ParsedOperation): string {
  const raw = (operation.summary ?? operation.description ?? '').trim().replace(/\s+/g, ' ')
  const fallback = `${operation.method.toUpperCase()} ${operation.path}`
  const prefix = operation.deprecated ? '[DEPRECATED] ' : ''
  return prefix + (raw || fallback)
}

function describeParameters(parameters: ParsedParameter[]): string | null {
  if (parameters.length === 0) return null

  const lines: string[] = ['Parameters:']
  const listed = parameters.slice(0, MAX_PARAMETERS_LISTED)
  for (const param of listed) {
    lines.push(`  - ${formatParameter(param)}`)
  }
  if (parameters.length > listed.length) {
    lines.push(`  - … (${parameters.length - listed.length} more)`)
  }
  return lines.join('\n')
}

function formatParameter(param: ParsedParameter): string {
  const parts: string[] = [param.name, `(${param.in}`]
  const typeHint = describeSchemaInline(param.schema)
  if (typeHint) parts.push(`, ${typeHint}`)
  parts.push(param.required ? ', required' : ', optional')
  const deprecated = param.deprecated ? ', deprecated' : ''
  return `${parts.join('')})${deprecated}`
}

function describeRequestBody(operation: ParsedOperation): string | null {
  const body = operation.requestBody
  if (!body) return null

  const contentTypes = Object.keys(body.content)
  const primary = contentTypes[0]
  const required = body.required ? 'required' : 'optional'
  const description = body.description?.trim()

  const parts: string[] = []
  parts.push(`Body (${required}, ${primary ?? 'application/json'}):`)
  if (description) parts.push(`  ${truncateOneLine(description, 200)}`)
  return parts.join('\n')
}

function describeReturns(responses: Record<string, ParsedResponse>): string | null {
  const entries = Object.entries(responses)
  if (entries.length === 0) return null

  // Prefer 2xx responses; otherwise the first declared.
  const success = entries.find(([code]) => code.startsWith('2'))
  const target = success ?? entries[0]
  if (!target) return null
  const [code, response] = target

  const typeHint = response.schema ? describeSchemaInline(response.schema) : null
  const desc = response.description?.trim()
  const parts = [`Returns: ${code}`]
  if (typeHint) parts.push(typeHint)
  if (desc) parts.push(truncateOneLine(desc, 120))
  return parts.join(' — ')
}

function describeSchemaInline(schema: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject | undefined): string | null {
  if (!schema) return null
  if ('$ref' in schema) {
    const ref = schema.$ref
    const name = ref.split('/').pop() ?? ref
    return name
  }

  if (schema.enum && schema.enum.length > 0) {
    const formatted = schema.enum.slice(0, 5).map((v) => JSON.stringify(v)).join('|')
    const more = schema.enum.length > 5 ? `|…` : ''
    return `enum: ${formatted}${more}`
  }

  if (schema.type === 'array') {
    const inner = describeSchemaInline(schema.items as OpenAPIV3.SchemaObject | undefined)
    return inner ? `array<${inner}>` : 'array'
  }

  if (schema.type === 'object' || (!schema.type && schema.properties)) {
    return 'object'
  }

  if (schema.type) {
    const format = schema.format ? `<${schema.format}>` : ''
    return `${schema.type}${format}`
  }

  return null
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  return text.slice(0, maxChars - 1).trimEnd() + '…'
}

function truncateOneLine(text: string, maxChars: number): string {
  const single = text.replace(/\s+/g, ' ').trim()
  return truncate(single, maxChars)
}
