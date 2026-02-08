import { describe, it, expect } from 'vitest'
import { resolve } from 'node:path'
import { z } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { loadSpec } from '../src/parser/loader.js'
import { resolveSpec } from '../src/parser/resolver.js'
import { buildToolInputSchema } from '../src/mapper/schema-converter.js'

const FIXTURE = resolve(import.meta.dirname, 'fixtures/petstore.yaml')

describe('schema-converter', () => {
  it('builds Zod shape for GET with query params', async () => {
    const doc = await loadSpec(FIXTURE)
    const spec = await resolveSpec(doc)
    const listPets = spec.operations.find((op) => op.operationId === 'listPets')!

    const shape = buildToolInputSchema(listPets)

    expect(shape['limit']).toBeDefined()
    expect(shape['limit'] instanceof z.ZodType).toBe(true)
    expect(shape['status']).toBeDefined()

    // Verify limit is optional number
    const limitSchema = z.object({ limit: shape['limit'] })
    expect(limitSchema.safeParse({}).success).toBe(true)
    expect(limitSchema.safeParse({ limit: 10 }).success).toBe(true)

    // Verify status enum works
    const statusSchema = z.object({ status: shape['status'] })
    expect(statusSchema.safeParse({ status: 'available' }).success).toBe(true)
    expect(statusSchema.safeParse({ status: 'invalid' }).success).toBe(false)
  })

  it('builds Zod shape for POST with request body', async () => {
    const doc = await loadSpec(FIXTURE)
    const spec = await resolveSpec(doc)
    const createPet = spec.operations.find((op) => op.operationId === 'createPet')!

    const shape = buildToolInputSchema(createPet)

    expect(shape['body']).toBeDefined()

    // body should be required (not optional)
    const schema = z.object(shape)
    expect(schema.safeParse({}).success).toBe(false)

    // body should accept valid pet object
    expect(schema.safeParse({ body: { name: 'Rex' } }).success).toBe(true)
  })

  it('builds Zod shape for GET with path params', async () => {
    const doc = await loadSpec(FIXTURE)
    const spec = await resolveSpec(doc)
    const getPet = spec.operations.find((op) => op.operationId === 'getPetById')!

    const shape = buildToolInputSchema(getPet)

    expect(shape['petId']).toBeDefined()

    // petId should be required
    const schema = z.object(shape)
    expect(schema.safeParse({}).success).toBe(false)
    expect(schema.safeParse({ petId: 123 }).success).toBe(true)
  })

  it('applies numeric constraints (min, max, int)', async () => {
    const doc = await loadSpec(FIXTURE)
    const spec = await resolveSpec(doc)
    const listPets = spec.operations.find((op) => op.operationId === 'listPets')!
    const shape = buildToolInputSchema(listPets)
    const limitSchema = z.object({ limit: shape['limit'] })

    // limit has minimum: 1, maximum: 100, default: 20
    expect(limitSchema.safeParse({}).success).toBe(true) // default kicks in
    expect(limitSchema.parse({}).limit).toBe(20) // default value
    expect(limitSchema.safeParse({ limit: 0 }).success).toBe(false) // below min
    expect(limitSchema.safeParse({ limit: 1 }).success).toBe(true)
    expect(limitSchema.safeParse({ limit: 100 }).success).toBe(true)
    expect(limitSchema.safeParse({ limit: 101 }).success).toBe(false) // above max
    expect(limitSchema.safeParse({ limit: 1.5 }).success).toBe(false) // not integer
  })

  it('applies numeric constraints on path param (minimum)', async () => {
    const doc = await loadSpec(FIXTURE)
    const spec = await resolveSpec(doc)
    const getPet = spec.operations.find((op) => op.operationId === 'getPetById')!
    const shape = buildToolInputSchema(getPet)
    const schema = z.object({ petId: shape['petId'] })

    // petId has minimum: 1
    expect(schema.safeParse({ petId: 0 }).success).toBe(false)
    expect(schema.safeParse({ petId: 1 }).success).toBe(true)
    expect(schema.safeParse({ petId: 999 }).success).toBe(true)
  })

  it('applies string constraints (minLength, maxLength)', async () => {
    const doc = await loadSpec(FIXTURE)
    const spec = await resolveSpec(doc)
    const createPet = spec.operations.find((op) => op.operationId === 'createPet')!
    const shape = buildToolInputSchema(createPet)

    // NewPet.name has minLength: 1, maxLength: 100
    const bodySchema = shape['body'] as z.ZodType
    expect(bodySchema.safeParse({ name: '' }).success).toBe(false) // too short
    expect(bodySchema.safeParse({ name: 'A' }).success).toBe(true)
    expect(bodySchema.safeParse({ name: 'A'.repeat(100) }).success).toBe(true)
    expect(bodySchema.safeParse({ name: 'A'.repeat(101) }).success).toBe(false) // too long
  })

  it('applies default values', async () => {
    const doc = await loadSpec(FIXTURE)
    const spec = await resolveSpec(doc)
    const listPets = spec.operations.find((op) => op.operationId === 'listPets')!
    const shape = buildToolInputSchema(listPets)

    // limit has default: 20
    const schema = z.object(shape)
    const result = schema.parse({})
    expect(result.limit).toBe(20)
  })

  it('applies string format as native Zod validator (email, url, uuid)', () => {
    const op = {
      operationId: 'test',
      method: 'POST',
      path: '/test',
      parameters: [
        { name: 'email', in: 'query' as const, required: true, schema: { type: 'string', format: 'email' } },
        { name: 'site', in: 'query' as const, required: true, schema: { type: 'string', format: 'url' } },
      ],
      responses: {},
      security: [],
      tags: [],
    }
    const shape = buildToolInputSchema(op)
    const schema = z.object(shape)

    expect(schema.safeParse({ email: 'user@test.com', site: 'https://x.com' }).success).toBe(true)
    expect(schema.safeParse({ email: 'notanemail', site: 'https://x.com' }).success).toBe(false)
    expect(schema.safeParse({ email: 'user@test.com', site: 'notaurl' }).success).toBe(false)
  })

  it('applies regex pattern constraint', () => {
    const op = {
      operationId: 'test',
      method: 'GET',
      path: '/test',
      parameters: [
        { name: 'code', in: 'query' as const, required: true, schema: { type: 'string', pattern: '^[A-Z]{3}$' } },
      ],
      responses: {},
      security: [],
      tags: [],
    }
    const shape = buildToolInputSchema(op)
    const schema = z.object(shape)

    expect(schema.safeParse({ code: 'ABC' }).success).toBe(true)
    expect(schema.safeParse({ code: 'abc' }).success).toBe(false)
    expect(schema.safeParse({ code: 'ABCD' }).success).toBe(false)
  })

  it('handles invalid regex pattern gracefully', () => {
    const op = {
      operationId: 'test',
      method: 'GET',
      path: '/test',
      parameters: [
        { name: 'val', in: 'query' as const, required: true, schema: { type: 'string', pattern: '[invalid(' } },
      ],
      responses: {},
      security: [],
      tags: [],
    }
    // Should not throw
    const shape = buildToolInputSchema(op)
    expect(shape['val']).toBeDefined()
    // Still accepts strings (fallback to describe)
    const schema = z.object(shape)
    expect(schema.safeParse({ val: 'anything' }).success).toBe(true)
  })

  it('applies array constraints (minItems, maxItems)', () => {
    const op = {
      operationId: 'test',
      method: 'POST',
      path: '/test',
      parameters: [
        {
          name: 'tags',
          in: 'query' as const,
          required: true,
          schema: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 5 },
        },
      ],
      responses: {},
      security: [],
      tags: [],
    }
    const shape = buildToolInputSchema(op)
    const schema = z.object(shape)

    expect(schema.safeParse({ tags: [] }).success).toBe(false) // below minItems
    expect(schema.safeParse({ tags: ['a'] }).success).toBe(true)
    expect(schema.safeParse({ tags: ['a', 'b', 'c', 'd', 'e'] }).success).toBe(true)
    expect(schema.safeParse({ tags: ['a', 'b', 'c', 'd', 'e', 'f'] }).success).toBe(false) // above maxItems
  })

  it('enriches param descriptions with example and format', async () => {
    const doc = await loadSpec(FIXTURE)
    const spec = await resolveSpec(doc)
    const listPets = spec.operations.find((op) => op.operationId === 'listPets')!

    const shape = buildToolInputSchema(listPets)
    const limitDesc = shape['limit'].description
    expect(limitDesc).toContain('How many items to return')
    expect(limitDesc).toContain('format: int32')
    expect(limitDesc).toContain('Example: 10')
  })

  it('marks deprecated params in description', async () => {
    const doc = await loadSpec(FIXTURE)
    const spec = await resolveSpec(doc)
    const listPets = spec.operations.find((op) => op.operationId === 'listPets')!

    const shape = buildToolInputSchema(listPets)
    const offsetDesc = shape['offset'].description
    expect(offsetDesc).toContain('[DEPRECATED]')
  })

  it('enriches body description with example', async () => {
    const doc = await loadSpec(FIXTURE)
    const spec = await resolveSpec(doc)
    const createPet = spec.operations.find((op) => op.operationId === 'createPet')!

    const shape = buildToolInputSchema(createPet)
    const bodyDesc = shape['body'].description
    expect(bodyDesc).toContain('Example:')
    expect(bodyDesc).toContain('Buddy')
  })

  it('produces valid JSON Schema via zod-to-json-schema', async () => {
    const doc = await loadSpec(FIXTURE)
    const spec = await resolveSpec(doc)
    const listPets = spec.operations.find((op) => op.operationId === 'listPets')!

    const shape = buildToolInputSchema(listPets)
    const jsonSchema = zodToJsonSchema(z.object(shape))

    expect(jsonSchema.type).toBe('object')
    expect((jsonSchema as any).properties).toBeDefined()
  })

  it('handles const values', () => {
    const op = {
      operationId: 'test', method: 'GET', path: '/test',
      parameters: [
        { name: 'type', in: 'query' as const, required: true, schema: { const: 'fixed' } as any },
      ],
      responses: {}, security: [], tags: [],
    }
    const shape = buildToolInputSchema(op)
    const schema = z.object(shape)
    expect(schema.safeParse({ type: 'fixed' }).success).toBe(true)
    expect(schema.safeParse({ type: 'other' }).success).toBe(false)
  })

  it('handles allOf with single and multiple schemas', () => {
    const op = {
      operationId: 'test', method: 'POST', path: '/test',
      parameters: [],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              allOf: [
                { type: 'object', properties: { a: { type: 'string' } }, required: ['a'] },
                { type: 'object', properties: { b: { type: 'number' } }, required: ['b'] },
              ],
            } as any,
          },
        },
      },
      responses: {}, security: [], tags: [],
    }
    const shape = buildToolInputSchema(op)
    expect(shape['body']).toBeDefined()
    const schema = z.object(shape)
    expect(schema.safeParse({ body: { a: 'hello', b: 42 } }).success).toBe(true)
  })

  it('handles oneOf', () => {
    const op = {
      operationId: 'test', method: 'GET', path: '/test',
      parameters: [
        {
          name: 'val', in: 'query' as const, required: true,
          schema: { oneOf: [{ type: 'string' }, { type: 'number' }] } as any,
        },
      ],
      responses: {}, security: [], tags: [],
    }
    const shape = buildToolInputSchema(op)
    const schema = z.object(shape)
    expect(schema.safeParse({ val: 'text' }).success).toBe(true)
    expect(schema.safeParse({ val: 42 }).success).toBe(true)
  })

  it('handles anyOf', () => {
    const op = {
      operationId: 'test', method: 'GET', path: '/test',
      parameters: [
        {
          name: 'val', in: 'query' as const, required: true,
          schema: { anyOf: [{ type: 'string' }, { type: 'boolean' }] } as any,
        },
      ],
      responses: {}, security: [], tags: [],
    }
    const shape = buildToolInputSchema(op)
    const schema = z.object(shape)
    expect(schema.safeParse({ val: 'text' }).success).toBe(true)
    expect(schema.safeParse({ val: true }).success).toBe(true)
  })

  it('handles exclusiveMinimum/Maximum as booleans (OAS 3.0)', () => {
    const op = {
      operationId: 'test', method: 'GET', path: '/test',
      parameters: [
        {
          name: 'val', in: 'query' as const, required: true,
          schema: { type: 'number', minimum: 0, exclusiveMinimum: true, maximum: 100, exclusiveMaximum: true } as any,
        },
      ],
      responses: {}, security: [], tags: [],
    }
    const shape = buildToolInputSchema(op)
    const schema = z.object(shape)
    expect(schema.safeParse({ val: 0 }).success).toBe(false) // exclusive
    expect(schema.safeParse({ val: 0.01 }).success).toBe(true)
    expect(schema.safeParse({ val: 100 }).success).toBe(false) // exclusive
    expect(schema.safeParse({ val: 99.99 }).success).toBe(true)
  })

  it('handles exclusiveMinimum/Maximum as numbers (OAS 3.1)', () => {
    const op = {
      operationId: 'test', method: 'GET', path: '/test',
      parameters: [
        {
          name: 'val', in: 'query' as const, required: true,
          schema: { type: 'number', exclusiveMinimum: 5, exclusiveMaximum: 10 } as any,
        },
      ],
      responses: {}, security: [], tags: [],
    }
    const shape = buildToolInputSchema(op)
    const schema = z.object(shape)
    expect(schema.safeParse({ val: 5 }).success).toBe(false)
    expect(schema.safeParse({ val: 5.01 }).success).toBe(true)
    expect(schema.safeParse({ val: 10 }).success).toBe(false)
    expect(schema.safeParse({ val: 9.99 }).success).toBe(true)
  })

  it('handles object with additionalProperties', () => {
    const op = {
      operationId: 'test', method: 'POST', path: '/test',
      parameters: [],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: { name: { type: 'string' } },
              additionalProperties: true,
            } as any,
          },
        },
      },
      responses: {}, security: [], tags: [],
    }
    const shape = buildToolInputSchema(op)
    const schema = z.object(shape)
    expect(schema.safeParse({ body: { name: 'test', extra: 123 } }).success).toBe(true)
  })

  it('handles single-value enum with string', () => {
    const op = {
      operationId: 'test', method: 'GET', path: '/test',
      parameters: [
        { name: 'type', in: 'query' as const, required: true, schema: { type: 'string', enum: ['only'] } },
      ],
      responses: {}, security: [], tags: [],
    }
    const shape = buildToolInputSchema(op)
    const schema = z.object(shape)
    expect(schema.safeParse({ type: 'only' }).success).toBe(true)
    expect(schema.safeParse({ type: 'other' }).success).toBe(false)
  })

  it('handles mixed-type enums', () => {
    const op = {
      operationId: 'test', method: 'GET', path: '/test',
      parameters: [
        { name: 'val', in: 'query' as const, required: true, schema: { enum: [1, 'two', true] } as any },
      ],
      responses: {}, security: [], tags: [],
    }
    const shape = buildToolInputSchema(op)
    const schema = z.object(shape)
    expect(schema.safeParse({ val: 1 }).success).toBe(true)
    expect(schema.safeParse({ val: 'two' }).success).toBe(true)
    expect(schema.safeParse({ val: true }).success).toBe(true)
    expect(schema.safeParse({ val: 'other' }).success).toBe(false)
  })

  it('handles single-value non-string enum', () => {
    const op = {
      operationId: 'test', method: 'GET', path: '/test',
      parameters: [
        { name: 'val', in: 'query' as const, required: true, schema: { enum: [42] } as any },
      ],
      responses: {}, security: [], tags: [],
    }
    const shape = buildToolInputSchema(op)
    const schema = z.object(shape)
    expect(schema.safeParse({ val: 42 }).success).toBe(true)
    expect(schema.safeParse({ val: 43 }).success).toBe(false)
  })

  it('handles boolean type', () => {
    const op = {
      operationId: 'test', method: 'GET', path: '/test',
      parameters: [
        { name: 'active', in: 'query' as const, required: true, schema: { type: 'boolean' } },
      ],
      responses: {}, security: [], tags: [],
    }
    const shape = buildToolInputSchema(op)
    const schema = z.object(shape)
    expect(schema.safeParse({ active: true }).success).toBe(true)
    expect(schema.safeParse({ active: 'yes' }).success).toBe(false)
  })

  it('handles unknown type', () => {
    const op = {
      operationId: 'test', method: 'GET', path: '/test',
      parameters: [
        { name: 'data', in: 'query' as const, required: true, schema: {} as any },
      ],
      responses: {}, security: [], tags: [],
    }
    const shape = buildToolInputSchema(op)
    const schema = z.object(shape)
    expect(schema.safeParse({ data: 'anything' }).success).toBe(true)
    expect(schema.safeParse({ data: 42 }).success).toBe(true)
  })

  it('handles optional request body', () => {
    const op = {
      operationId: 'test', method: 'POST', path: '/test',
      parameters: [],
      requestBody: {
        required: false,
        description: 'Optional body',
        content: {
          'application/json': {
            schema: { type: 'object', properties: { name: { type: 'string' } } } as any,
          },
        },
      },
      responses: {}, security: [], tags: [],
    }
    const shape = buildToolInputSchema(op)
    const schema = z.object(shape)
    expect(schema.safeParse({}).success).toBe(true) // body is optional
    expect(schema.safeParse({ body: { name: 'test' } }).success).toBe(true)
  })

  it('handles array without items schema', () => {
    const op = {
      operationId: 'test', method: 'GET', path: '/test',
      parameters: [
        { name: 'ids', in: 'query' as const, required: true, schema: { type: 'array' } as any },
      ],
      responses: {}, security: [], tags: [],
    }
    const shape = buildToolInputSchema(op)
    const schema = z.object(shape)
    expect(schema.safeParse({ ids: [1, 'two', true] }).success).toBe(true)
  })

  it('param description falls back to type when no description', () => {
    const op = {
      operationId: 'test', method: 'GET', path: '/test',
      parameters: [
        { name: 'id', in: 'query' as const, required: true, schema: { type: 'integer' } },
      ],
      responses: {}, security: [], tags: [],
    }
    const shape = buildToolInputSchema(op)
    expect(shape['id'].description).toBe('integer')
  })

  it('param description falls back to "any" when no type', () => {
    const op = {
      operationId: 'test', method: 'GET', path: '/test',
      parameters: [
        { name: 'data', in: 'query' as const, required: true, schema: {} as any },
      ],
      responses: {}, security: [], tags: [],
    }
    const shape = buildToolInputSchema(op)
    expect(shape['data'].description).toBe('any')
  })

  it('truncates long examples', () => {
    const longValue = 'A'.repeat(200)
    const op = {
      operationId: 'test', method: 'GET', path: '/test',
      parameters: [
        { name: 'val', in: 'query' as const, required: true, schema: { type: 'string' }, example: longValue },
      ],
      responses: {}, security: [], tags: [],
    }
    const shape = buildToolInputSchema(op)
    expect(shape['val'].description).toContain('...')
  })

  it('handles oneOf with single schema', () => {
    const op = {
      operationId: 'test', method: 'GET', path: '/test',
      parameters: [
        {
          name: 'val', in: 'query' as const, required: true,
          schema: { oneOf: [{ type: 'string' }] } as any,
        },
      ],
      responses: {}, security: [], tags: [],
    }
    const shape = buildToolInputSchema(op)
    const schema = z.object(shape)
    expect(schema.safeParse({ val: 'text' }).success).toBe(true)
  })

  it('handles allOf with single schema', () => {
    const op = {
      operationId: 'test', method: 'GET', path: '/test',
      parameters: [
        {
          name: 'val', in: 'query' as const, required: true,
          schema: { allOf: [{ type: 'string' }] } as any,
        },
      ],
      responses: {}, security: [], tags: [],
    }
    const shape = buildToolInputSchema(op)
    const schema = z.object(shape)
    expect(schema.safeParse({ val: 'text' }).success).toBe(true)
  })

  it('handles anyOf with single schema', () => {
    const op = {
      operationId: 'test', method: 'GET', path: '/test',
      parameters: [
        {
          name: 'val', in: 'query' as const, required: true,
          schema: { anyOf: [{ type: 'number' }] } as any,
        },
      ],
      responses: {}, security: [], tags: [],
    }
    const shape = buildToolInputSchema(op)
    const schema = z.object(shape)
    expect(schema.safeParse({ val: 42 }).success).toBe(true)
  })
})
