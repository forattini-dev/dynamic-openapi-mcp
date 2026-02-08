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
})
