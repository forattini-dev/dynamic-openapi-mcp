import { describe, it, expect } from 'vitest'
import type { ParsedOperation } from 'dynamic-openapi-tools/parser'
import { selectOperations, MCP_MAX_TOOLS_ENV } from '../src/mapper/budget.js'

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

describe('selectOperations — x-mcp-hidden filter', () => {
  it('removes operations carrying x-mcp-hidden: true', () => {
    const selection = selectOperations([
      op({ operationId: 'public' }),
      op({ operationId: 'secret', 'x-mcp-hidden': true }),
    ], {})
    expect(selection.registered.map((o) => o.operationId)).toEqual(['public'])
    expect(selection.hidden.map((o) => o.operationId)).toEqual(['secret'])
  })

  it('reads x-mcp-hidden from the nested extensions bag', () => {
    const selection = selectOperations([
      op({ operationId: 'public' }),
      op({ operationId: 'secret', extensions: { 'x-mcp-hidden': true } }),
    ], {})
    expect(selection.hidden.map((o) => o.operationId)).toEqual(['secret'])
  })

  it('does NOT hide on any value other than the boolean true', () => {
    const selection = selectOperations([
      op({ operationId: 'a', 'x-mcp-hidden': false }),
      op({ operationId: 'b', 'x-mcp-hidden': 'yes' }),
      op({ operationId: 'c', 'x-mcp-hidden': 1 }),
    ], {})
    expect(selection.hidden).toHaveLength(0)
    expect(selection.registered).toHaveLength(3)
  })
})

describe('selectOperations — MCP_MAX_TOOLS budget', () => {
  it('returns all operations when env var is unset', () => {
    const ops = Array.from({ length: 20 }, (_, i) => op({ operationId: `op${i}` }))
    const selection = selectOperations(ops, {})
    expect(selection.registered).toHaveLength(20)
    expect(selection.budgeted).toHaveLength(0)
  })

  it('trims to the budget when exceeded', () => {
    const ops = Array.from({ length: 20 }, (_, i) => op({ operationId: `op${String(i).padStart(2, '0')}`, tags: ['pets'] }))
    const selection = selectOperations(ops, { [MCP_MAX_TOOLS_ENV]: '5' })
    expect(selection.registered).toHaveLength(5)
    expect(selection.budgeted).toHaveLength(15)
    expect(selection.registered.map((o) => o.operationId)).toEqual(['op00', 'op01', 'op02', 'op03', 'op04'])
  })

  it('prioritises non-deprecated and tagged operations into the budget', () => {
    const selection = selectOperations([
      op({ operationId: 'aaa-untagged', tags: [] }),
      op({ operationId: 'bbb-deprecated', tags: ['pets'], deprecated: true }),
      op({ operationId: 'ccc-good', tags: ['pets'] }),
      op({ operationId: 'ddd-good', tags: ['pets'] }),
    ], { [MCP_MAX_TOOLS_ENV]: '2' })
    // Top of the rank: non-deprecated + tagged, alphabetical.
    expect(selection.registered.map((o) => o.operationId)).toEqual(['ccc-good', 'ddd-good'])
    expect(selection.budgeted.map((o) => o.operationId)).toEqual(['aaa-untagged', 'bbb-deprecated'])
  })

  it('ignores zero, negative, and non-numeric MCP_MAX_TOOLS', () => {
    const ops = [op({ operationId: 'a' }), op({ operationId: 'b' })]
    expect(selectOperations(ops, { [MCP_MAX_TOOLS_ENV]: '0' }).registered).toHaveLength(2)
    expect(selectOperations(ops, { [MCP_MAX_TOOLS_ENV]: '-5' }).registered).toHaveLength(2)
    expect(selectOperations(ops, { [MCP_MAX_TOOLS_ENV]: 'banana' }).registered).toHaveLength(2)
    expect(selectOperations(ops, { [MCP_MAX_TOOLS_ENV]: '' }).registered).toHaveLength(2)
  })

  it('hidden ops never count against the budget', () => {
    const selection = selectOperations([
      op({ operationId: 'visible1', tags: ['pets'] }),
      op({ operationId: 'visible2', tags: ['pets'] }),
      op({ operationId: 'hidden', 'x-mcp-hidden': true }),
    ], { [MCP_MAX_TOOLS_ENV]: '2' })
    expect(selection.registered.map((o) => o.operationId)).toEqual(['visible1', 'visible2'])
    expect(selection.budgeted).toHaveLength(0)
    expect(selection.hidden.map((o) => o.operationId)).toEqual(['hidden'])
  })
})
