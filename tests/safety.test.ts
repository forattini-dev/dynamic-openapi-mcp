import { describe, it, expect } from 'vitest'
import type { ParsedOperation } from 'dynamic-openapi-tools/parser'
import { classifySideEffect, toolAnnotationsFor } from '../src/mapper/safety.js'

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

describe('classifySideEffect — HTTP method baseline', () => {
  it.each([
    ['GET', 'read-only'],
    ['HEAD', 'read-only'],
    ['OPTIONS', 'read-only'],
    ['TRACE', 'read-only'],
    ['POST', 'write'],
    ['PUT', 'write'],
    ['PATCH', 'write'],
    ['DELETE', 'destructive'],
  ] as const)('classifies %s as %s', (method, expected) => {
    expect(classifySideEffect(op({ method }))).toBe(expected)
  })
})

describe('classifySideEffect — vendor extensions override', () => {
  it('x-side-effect: destructive escalates a GET', () => {
    expect(classifySideEffect(op({ method: 'GET', 'x-side-effect': 'destructive' }))).toBe('destructive')
  })

  it('x-side-effect: read-only de-escalates a POST', () => {
    expect(classifySideEffect(op({ method: 'POST', 'x-side-effect': 'read-only' }))).toBe('read-only')
  })

  it('x-destructive: true is sugar for destructive', () => {
    expect(classifySideEffect(op({ method: 'GET', 'x-destructive': true }))).toBe('destructive')
  })

  it('reads the same extensions from a nested extensions bag', () => {
    expect(
      classifySideEffect(op({ method: 'GET', extensions: { 'x-side-effect': 'destructive' } }))
    ).toBe('destructive')
  })

  it('ignores an unknown x-side-effect value', () => {
    expect(classifySideEffect(op({ method: 'POST', 'x-side-effect': 'banana' }))).toBe('write')
  })
})

describe('toolAnnotationsFor — MCP ToolAnnotations shape', () => {
  it('GET → read-only, idempotent, open-world', () => {
    expect(toolAnnotationsFor(op({ method: 'GET' }))).toEqual({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    })
  })

  it('POST → write, NOT idempotent, NOT destructive, open-world', () => {
    expect(toolAnnotationsFor(op({ method: 'POST' }))).toEqual({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    })
  })

  it('PUT → write, idempotent (per RFC 7231), open-world', () => {
    expect(toolAnnotationsFor(op({ method: 'PUT' }))).toEqual({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    })
  })

  it('PATCH → write, NOT idempotent, open-world', () => {
    expect(toolAnnotationsFor(op({ method: 'PATCH' }))).toEqual({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    })
  })

  it('DELETE → destructive, idempotent, open-world', () => {
    expect(toolAnnotationsFor(op({ method: 'DELETE' }))).toEqual({
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    })
  })

  it('x-side-effect: read-only on POST yields read-only annotations', () => {
    expect(toolAnnotationsFor(op({ method: 'POST', 'x-side-effect': 'read-only' }))).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
    })
  })

  it('x-destructive: true on GET escalates to destructive annotations', () => {
    expect(toolAnnotationsFor(op({ method: 'GET', 'x-destructive': true }))).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
    })
  })
})
