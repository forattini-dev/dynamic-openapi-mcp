import { describe, it, expect } from 'vitest'
import type { ParsedOperation } from 'dynamic-openapi-tools/parser'
import { buildToolDescription } from '../src/mapper/descriptions.js'

function op(overrides: Partial<ParsedOperation> & Record<string, unknown> = {}): ParsedOperation {
  return {
    operationId: 'doThing',
    path: '/things',
    method: 'GET',
    tags: [],
    parameters: [],
    responses: {},
    security: [],
    ...overrides,
  } as ParsedOperation
}

describe('buildToolDescription — headline', () => {
  it('uses summary when present', () => {
    const out = buildToolDescription(op({ summary: 'List all things' }))
    expect(out.startsWith('List all things')).toBe(true)
  })

  it('falls back to description if summary is empty', () => {
    const out = buildToolDescription(op({ summary: undefined, description: 'Long form description' }))
    expect(out.startsWith('Long form description')).toBe(true)
  })

  it('falls back to METHOD path when both are absent', () => {
    const out = buildToolDescription(op({ method: 'POST', path: '/pets' }))
    expect(out.startsWith('POST /pets')).toBe(true)
  })

  it('prepends [DEPRECATED] when operation.deprecated is true', () => {
    const out = buildToolDescription(op({ summary: 'Old thing', deprecated: true }))
    expect(out.startsWith('[DEPRECATED] Old thing')).toBe(true)
  })

  it('collapses internal whitespace in the headline', () => {
    const out = buildToolDescription(op({ summary: 'List   all\n  things' }))
    expect(out.split('\n')[0]).toBe('List all things')
  })
})

describe('buildToolDescription — parameters', () => {
  it('lists path/query/header params with type, enum, required, deprecated', () => {
    const out = buildToolDescription(op({
      summary: 'Fetch pet by id',
      parameters: [
        { name: 'petId', in: 'path', required: true, schema: { type: 'integer', format: 'int64' } },
        { name: 'status', in: 'query', required: false, schema: { type: 'string', enum: ['available', 'pending', 'sold'] } },
        { name: 'X-Trace', in: 'header', required: false, schema: { type: 'string' }, deprecated: true },
      ],
    }))
    expect(out).toContain('Parameters:')
    expect(out).toContain('petId(path, integer<int64>, required)')
    expect(out).toContain('status(query, enum: "available"|"pending"|"sold", optional)')
    expect(out).toContain('X-Trace(header, string, optional), deprecated')
  })

  it('shows array<inner> for array params', () => {
    const out = buildToolDescription(op({
      parameters: [
        { name: 'tags', in: 'query', required: false, schema: { type: 'array', items: { type: 'string' } } },
      ],
    }))
    expect(out).toContain('tags(query, array<string>, optional)')
  })

  it('truncates parameter list past 8 entries with a "more" marker', () => {
    const params = Array.from({ length: 12 }, (_, i) => ({
      name: `p${i}`, in: 'query' as const, required: false, schema: { type: 'string' as const },
    }))
    const out = buildToolDescription(op({ parameters: params }))
    expect(out).toContain('p0(query')
    expect(out).toContain('p7(query')
    expect(out).not.toContain('p8(query')
    expect(out).toContain('… (4 more)')
  })

  it('skips the Parameters section when there are none', () => {
    const out = buildToolDescription(op({ summary: 'Health check' }))
    expect(out).not.toContain('Parameters:')
  })
})

describe('buildToolDescription — request body', () => {
  it('surfaces required body with content-type and description', () => {
    const out = buildToolDescription(op({
      method: 'POST',
      requestBody: {
        required: true,
        description: 'A pet to create',
        content: { 'application/json': { schema: { type: 'object' } } },
      },
    }))
    expect(out).toContain('Body (required, application/json):')
    expect(out).toContain('A pet to create')
  })

  it('marks optional body', () => {
    const out = buildToolDescription(op({
      method: 'POST',
      requestBody: {
        required: false,
        content: { 'application/json': { schema: { type: 'object' } } },
      },
    }))
    expect(out).toContain('Body (optional, application/json):')
  })
})

describe('buildToolDescription — returns', () => {
  it('prefers 2xx response for the Returns line', () => {
    const out = buildToolDescription(op({
      responses: {
        '200': { description: 'OK', schema: { type: 'array', items: { type: 'object' } } },
        '404': { description: 'Not found' },
      },
    }))
    expect(out).toContain('Returns: 200')
    expect(out).toContain('array<object>')
    expect(out).toContain('OK')
  })

  it('falls back to first declared response when no 2xx exists', () => {
    const out = buildToolDescription(op({
      responses: {
        '400': { description: 'Bad request' },
      },
    }))
    expect(out).toContain('Returns: 400')
    expect(out).toContain('Bad request')
  })

  it('resolves $ref schema name as the type hint', () => {
    const out = buildToolDescription(op({
      responses: {
        '200': { description: 'OK', schema: { $ref: '#/components/schemas/Pet' } as never },
      },
    }))
    expect(out).toContain('Returns: 200 — Pet')
  })
})

describe('buildToolDescription — x-description-override', () => {
  it('takes precedence over synthesised description', () => {
    const out = buildToolDescription(op({
      summary: 'List pets',
      parameters: [{ name: 'limit', in: 'query', required: false, schema: { type: 'integer' } }],
      'x-description-override': 'Curated description: returns up to N pets.',
    }))
    expect(out).toBe('Curated description: returns up to N pets.')
  })

  it('reads from the nested extensions bag', () => {
    const out = buildToolDescription(op({
      summary: 'List pets',
      extensions: { 'x-description-override': 'Curated via extensions bag.' },
    }))
    expect(out).toBe('Curated via extensions bag.')
  })

  it('ignores empty/whitespace-only override and falls through to synthesis', () => {
    const out = buildToolDescription(op({
      summary: 'List pets',
      'x-description-override': '   ',
    }))
    expect(out.startsWith('List pets')).toBe(true)
  })
})

describe('buildToolDescription — truncation', () => {
  it('caps the final output at the MCP host-friendly limit', () => {
    const out = buildToolDescription(op({
      summary: 'a'.repeat(2000),
    }))
    expect(out.length).toBeLessThanOrEqual(1024)
    expect(out.endsWith('…')).toBe(true)
  })
})
