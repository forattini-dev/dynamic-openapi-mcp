import { describe, it, expect, beforeAll } from 'vitest'
import { resolve } from 'node:path'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerDocsResources } from '../../src/docs/resources.js'
import { buildIndex } from '../../src/docs/indexer.js'
import type { DocsState } from '../../src/docs/types.js'

const FIXTURES = resolve(import.meta.dirname, 'fixtures')

describe('docs resources', () => {
  let server: McpServer
  let state: DocsState

  beforeAll(async () => {
    const index = await buildIndex(FIXTURES, 'test-docs')
    state = { index }
    server = new McpServer({ name: 'test', version: '1.0.0' })
    registerDocsResources(server, state)
  })

  describe('docs-files', () => {
    it('registers docs-files resource', () => {
      const internals = server as any
      const resource = internals._registeredResources['docs://files']
      expect(resource).toBeDefined()
    })

    it('returns JSON list of files', async () => {
      const internals = server as any
      const resource = internals._registeredResources['docs://files']
      const result = await resource.readCallback(new URL('docs://files'))
      const text = result.contents[0].text
      const files = JSON.parse(text)
      expect(files.length).toBeGreaterThanOrEqual(3)
      expect(files[0]).toHaveProperty('path')
      expect(files[0]).toHaveProperty('title')
      expect(result.contents[0].mimeType).toBe('application/json')
    })
  })

  describe('docs-file template', () => {
    it('registers docs-file resource template', () => {
      const internals = server as any
      const template = internals._registeredResourceTemplates['docs-file']
      expect(template).toBeDefined()
    })

    it('reads a specific file', async () => {
      const internals = server as any
      const template = internals._registeredResourceTemplates['docs-file']
      const result = await template.readCallback(
        new URL('docs://file/getting-started.md'),
        { path: 'getting-started.md' },
      )
      expect(result.contents[0].text).toContain('Installation')
      expect(result.contents[0].mimeType).toBe('text/markdown')
    })

    it('returns error for missing file', async () => {
      const internals = server as any
      const template = internals._registeredResourceTemplates['docs-file']
      const result = await template.readCallback(
        new URL('docs://file/nonexistent.md'),
        { path: 'nonexistent.md' },
      )
      expect(result.contents[0].text).toContain('File not found')
    })

    it('lists available files', async () => {
      const internals = server as any
      const template = internals._registeredResourceTemplates['docs-file']
      const result = await template.resourceTemplate.listCallback()
      expect(result.resources.length).toBeGreaterThanOrEqual(3)
      expect(result.resources[0]).toHaveProperty('uri')
      expect(result.resources[0]).toHaveProperty('name')
    })

    it('completes path', async () => {
      const internals = server as any
      const template = internals._registeredResourceTemplates['docs-file']
      const completeFn = template.resourceTemplate.completeCallback('path')
      const results = await completeFn('get')
      expect(results).toContain('getting-started.md')
    })
  })
})
