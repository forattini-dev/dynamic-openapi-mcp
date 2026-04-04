import { z } from 'zod'
import type { OpenAPIV3 } from 'openapi-types'
import type { ParsedOperation, ParsedParameter } from '../parser/types.js'

const binaryUploadSchema = z.object({
  dataBase64: z.string().describe('Base64-encoded file content'),
  filename: z.string().optional().describe('Optional filename for multipart uploads'),
  contentType: z.string().optional().describe('Optional MIME type for the uploaded content'),
})

export function buildToolInputSchema(operation: ParsedOperation): Record<string, z.ZodTypeAny> {
  const shape: Record<string, z.ZodTypeAny> = {}

  for (const param of operation.parameters) {
    let zodSchema = convertToZod(param.schema)
    zodSchema = zodSchema.describe(buildParamDescription(param))
    // Don't wrap in .optional() if schema has a default — ZodDefault already handles missing values
    if (!param.required && !hasDefault(zodSchema)) {
      zodSchema = zodSchema.optional()
    }
    shape[param.name] = zodSchema
  }

  if (operation.requestBody) {
    const [contentType, bodyContent] = pickRequestBodyContent(operation.requestBody.content)

    if (contentType && bodyContent?.schema) {
      let bodySchema = convertToZod(bodyContent.schema)
      const bodyParts: string[] = []
      if (operation.requestBody.description) bodyParts.push(operation.requestBody.description)
      bodyParts.push(`Content-Type: ${contentType}`)
      if (bodyContent.example !== undefined) {
        bodyParts.push(`Example: ${truncateExample(bodyContent.example)}`)
      }
      if (contentType === 'multipart/form-data') {
        bodyParts.push('Binary fields can use { dataBase64, filename?, contentType? }')
      }
      if (contentType === 'application/octet-stream') {
        bodyParts.push('Pass raw text/bytes or { dataBase64, filename?, contentType? } for binary content')
      }
      if (bodyParts.length > 0) {
        bodySchema = bodySchema.describe(bodyParts.join(' | '))
      }
      if (!operation.requestBody.required) {
        bodySchema = bodySchema.optional()
      }
      shape['body'] = bodySchema
    }
  }

  return shape
}

function pickRequestBodyContent(
  content: Record<string, { schema: OpenAPIV3.SchemaObject; example?: unknown; examples?: Record<string, unknown> }>
): [string | undefined, { schema: OpenAPIV3.SchemaObject; example?: unknown; examples?: Record<string, unknown> } | undefined] {
  const entries = Object.entries(content)
  if (entries.length === 0) return [undefined, undefined]

  const preferred = [
    'application/json',
    'application/x-www-form-urlencoded',
    'multipart/form-data',
    'application/octet-stream',
  ]

  for (const mediaType of preferred) {
    const match = entries.find(([name]) => name === mediaType)
    if (match) return match
  }

  const jsonLike = entries.find(([name]) => name.endsWith('+json'))
  return jsonLike ?? entries[0]
}

function buildParamDescription(param: ParsedParameter): string {
  const parts: string[] = []
  if (param.description) parts.push(param.description)
  if (param.deprecated) parts.push('[DEPRECATED]')
  if (param.schema.format) parts.push(`format: ${param.schema.format}`)
  if (param.schema.pattern) parts.push(`pattern: ${param.schema.pattern}`)
  if (param.example !== undefined) parts.push(`Example: ${truncateExample(param.example)}`)
  return parts.join(' | ') || param.schema.type || 'any'
}

function truncateExample(value: unknown, maxLen = 100): string {
  const str = typeof value === 'string' ? value : JSON.stringify(value)
  if (str.length <= maxLen) return str
  return str.slice(0, maxLen - 3) + '...'
}

function convertToZod(schema: OpenAPIV3.SchemaObject): z.ZodTypeAny {
  // Handle const (OpenAPI 3.1)
  if ('const' in schema && schema.const !== undefined) {
    return z.literal(schema.const as string | number | boolean)
  }

  if (schema.enum) {
    return applyDefault(convertEnum(schema.enum), schema)
  }

  if (schema.type === 'array') {
    const items = schema.items
      ? convertToZod(schema.items as OpenAPIV3.SchemaObject)
      : z.unknown()
    let arr = z.array(items)
    if (schema.minItems !== undefined) arr = arr.min(schema.minItems)
    if (schema.maxItems !== undefined) arr = arr.max(schema.maxItems)
    return applyDefault(arr, schema)
  }

  if (schema.type === 'object' || schema.properties) {
    const objShape: Record<string, z.ZodTypeAny> = {}

    if (schema.properties) {
      const requiredSet = new Set(schema.required ?? [])

      for (const [key, value] of Object.entries(schema.properties)) {
        const propSchema = value as OpenAPIV3.SchemaObject
        let zodProp = convertToZod(propSchema)
        if (propSchema.description) {
          zodProp = zodProp.describe(propSchema.description)
        }
        if (!requiredSet.has(key) && !hasDefault(zodProp)) {
          zodProp = zodProp.optional()
        }
        objShape[key] = zodProp
      }
    }

    if (schema.additionalProperties === true || (schema.additionalProperties && typeof schema.additionalProperties !== 'boolean')) {
      return applyDefault(z.object(objShape).passthrough(), schema)
    }

    return applyDefault(z.object(objShape), schema)
  }

  if (schema.allOf) {
    const schemas = (schema.allOf as OpenAPIV3.SchemaObject[]).map(convertToZod)
    if (schemas.length === 1) return schemas[0]
    let result = schemas[0]
    for (let i = 1; i < schemas.length; i++) {
      result = z.intersection(result, schemas[i])
    }
    return result
  }

  if (schema.oneOf) {
    const schemas = (schema.oneOf as OpenAPIV3.SchemaObject[]).map(convertToZod)
    if (schemas.length === 1) return schemas[0]
    const [a, b, ...rest] = schemas
    return z.union([a, b, ...rest])
  }

  if (schema.anyOf) {
    const schemas = (schema.anyOf as OpenAPIV3.SchemaObject[]).map(convertToZod)
    if (schemas.length === 1) return schemas[0]
    const [a, b, ...rest] = schemas
    return z.union([a, b, ...rest])
  }

  const base = convertBaseType(schema)
  return applyDefault(base, schema)
}

function convertBaseType(schema: OpenAPIV3.SchemaObject): z.ZodTypeAny {
  switch (schema.type) {
    case 'string':
      if (schema.format === 'binary') {
        return z.union([applyStringConstraints(z.string(), schema), binaryUploadSchema])
      }
      return applyStringConstraints(z.string(), schema)
    case 'number':
    case 'integer':
      return applyNumberConstraints(z.number(), schema)
    case 'boolean':
      return z.boolean()
    default:
      return z.unknown()
  }
}

const NATIVE_STRING_FORMATS: Record<string, (s: z.ZodString) => z.ZodString> = {
  email: (s) => s.email(),
  url: (s) => s.url(),
  uuid: (s) => s.uuid(),
  datetime: (s) => s.datetime(),
  'date-time': (s) => s.datetime(),
  date: (s) => s.date(),
}

function applyStringConstraints(zStr: z.ZodString, schema: OpenAPIV3.SchemaObject): z.ZodTypeAny {
  if (schema.minLength !== undefined) zStr = zStr.min(schema.minLength)
  if (schema.maxLength !== undefined) zStr = zStr.max(schema.maxLength)

  if (schema.pattern) {
    try {
      const re = new RegExp(schema.pattern)
      zStr = zStr.regex(re)
    } catch {
      // Invalid regex — skip validation, metadata surfaced via buildParamDescription
    }
  }

  if (schema.format) {
    const nativeFn = NATIVE_STRING_FORMATS[schema.format]
    if (nativeFn) {
      zStr = nativeFn(zStr)
    }
    // Non-native formats surfaced via buildParamDescription (format: X)
  }

  return zStr
}

function applyNumberConstraints(zNum: z.ZodNumber, schema: OpenAPIV3.SchemaObject): z.ZodTypeAny {
  if (schema.type === 'integer') zNum = zNum.int()

  if (schema.minimum !== undefined) {
    // In OpenAPI 3.0, exclusiveMinimum is a boolean; in 3.1 it's a number
    if (typeof schema.exclusiveMinimum === 'boolean' && schema.exclusiveMinimum) {
      zNum = zNum.gt(schema.minimum)
    } else {
      zNum = zNum.min(schema.minimum)
    }
  }

  if (schema.maximum !== undefined) {
    if (typeof schema.exclusiveMaximum === 'boolean' && schema.exclusiveMaximum) {
      zNum = zNum.lt(schema.maximum)
    } else {
      zNum = zNum.max(schema.maximum)
    }
  }

  // OpenAPI 3.1: exclusiveMinimum/Maximum as numbers
  if (typeof schema.exclusiveMinimum === 'number') {
    zNum = zNum.gt(schema.exclusiveMinimum)
  }
  if (typeof schema.exclusiveMaximum === 'number') {
    zNum = zNum.lt(schema.exclusiveMaximum)
  }

  return zNum
}

function applyDefault(zSchema: z.ZodTypeAny, schema: OpenAPIV3.SchemaObject): z.ZodTypeAny {
  if (schema.default !== undefined) {
    return zSchema.default(schema.default)
  }
  return zSchema
}

function hasDefault(schema: z.ZodTypeAny): boolean {
  return schema instanceof z.ZodDefault
}

function convertEnum(values: unknown[]): z.ZodTypeAny {
  const allStrings = values.every((v) => typeof v === 'string')

  if (allStrings && values.length >= 2) {
    const [first, second, ...rest] = values as string[]
    return z.enum([first, second, ...rest])
  }

  if (allStrings && values.length === 1) {
    return z.literal(values[0] as string)
  }

  if (values.length === 1) {
    return z.literal(values[0] as string | number | boolean)
  }

  const schemas = values.map((v) => z.literal(v as string | number | boolean))
  if (schemas.length >= 2) {
    const [a, b, ...rest] = schemas
    return z.union([a, b, ...rest])
  }

  return z.unknown()
}
