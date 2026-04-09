import { describe, it, expect } from 'vitest'
import { resolve } from 'node:path'
import { createDocsMcp } from '../../src/docs/server.js'

const FIXTURES = resolve(import.meta.dirname, 'fixtures')

describe('createDocsMcp', () => {
  it('creates an MCP server from a fixtures directory', async () => {
    const mcp = await createDocsMcp({ source: FIXTURES })
    expect(mcp.server).toBeDefined()
    expect(mcp.index).toBeDefined()
    expect(mcp.index.files.length).toBeGreaterThanOrEqual(3)
    expect(typeof mcp.serve).toBe('function')
  })

  it('uses directory name when no custom name given', async () => {
    const mcp = await createDocsMcp({ source: FIXTURES })
    expect(mcp.index.name).toBe('fixtures')
  })

  it('uses custom name', async () => {
    const mcp = await createDocsMcp({ source: FIXTURES, name: 'my-docs' })
    expect(mcp.index.name).toBe('my-docs')
  })

  it('registers all 9 tools', async () => {
    const mcp = await createDocsMcp({ source: FIXTURES })
    const internals = mcp.server as any
    const toolNames = Object.keys(internals._registeredTools)
    expect(toolNames).toContain('search_docs')
    expect(toolNames).toContain('list_files')
    expect(toolNames).toContain('read_file')
    expect(toolNames).toContain('read_section')
    expect(toolNames).toContain('list_headings')
    expect(toolNames).toContain('code_examples')
    expect(toolNames).toContain('file_outline')
    expect(toolNames).toContain('docs_stats')
    expect(toolNames).toContain('reindex')
    expect(toolNames).toHaveLength(9)
  })

  it('registers resources', async () => {
    const mcp = await createDocsMcp({ source: FIXTURES })
    const internals = mcp.server as any
    expect(internals._registeredResources['docs://files']).toBeDefined()
    expect(internals._registeredResourceTemplates['docs-file']).toBeDefined()
  })

  it('registers prompts', async () => {
    const mcp = await createDocsMcp({ source: FIXTURES })
    const internals = mcp.server as any
    expect(internals._registeredPrompts['explain-docs']).toBeDefined()
    expect(internals._registeredPrompts['summarize-file']).toBeDefined()
  })

  it('resolves subpath within source', async () => {
    const mcp = await createDocsMcp({
      source: resolve(FIXTURES, '..'),
      path: 'fixtures',
    })
    expect(mcp.index.files.length).toBeGreaterThanOrEqual(3)
  })
})
