import { describe, it, expect, beforeAll } from 'vitest'
import { resolve } from 'node:path'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerDocsTools } from '../../src/docs/tools.js'
import { buildIndex } from '../../src/docs/indexer.js'
import type { DocsState } from '../../src/docs/types.js'

const FIXTURES = resolve(import.meta.dirname, 'fixtures')

async function callTool(
  server: McpServer,
  toolName: string,
  args: Record<string, unknown> = {},
): Promise<{ text: string; isError?: boolean }> {
  const internals = server as any
  const tool = internals._registeredTools[toolName]
  if (!tool?.handler) throw new Error(`Tool "${toolName}" not found`)
  const result = await tool.handler(args, {} as any)
  return { text: result.content[0].text, isError: result.isError }
}

describe('docs tools', () => {
  let server: McpServer
  let state: DocsState

  beforeAll(async () => {
    const index = await buildIndex(FIXTURES, 'test-docs')
    state = { index }
    server = new McpServer({ name: 'test', version: '1.0.0' })
    registerDocsTools(server, state)
  })

  describe('search_docs', () => {
    it('returns results for matching query', async () => {
      const { text } = await callTool(server, 'search_docs', { query: 'authentication' })
      expect(text).toContain('score:')
      expect(text).toContain('Authentication')
    })

    it('returns no results message for unmatched query', async () => {
      const { text } = await callTool(server, 'search_docs', { query: 'zzzznonexistent' })
      expect(text).toContain('No results')
    })

    it('respects max_results', async () => {
      const { text } = await callTool(server, 'search_docs', { query: 'the', max_results: 1 })
      const matches = text.match(/^\d+\./gm)
      expect(matches).toHaveLength(1)
    })
  })

  describe('list_files', () => {
    it('returns JSON list of all files', async () => {
      const { text } = await callTool(server, 'list_files')
      const files = JSON.parse(text)
      expect(files.length).toBeGreaterThanOrEqual(3)
      expect(files[0]).toHaveProperty('path')
      expect(files[0]).toHaveProperty('title')
      expect(files[0]).toHaveProperty('sections')
      expect(files[0]).toHaveProperty('words')
    })
  })

  describe('read_file', () => {
    it('returns file content', async () => {
      const { text } = await callTool(server, 'read_file', { path: 'getting-started.md' })
      expect(text).toContain('Installation')
      expect(text).toContain('npm install')
    })

    it('returns error for missing file', async () => {
      const result = await callTool(server, 'read_file', { path: 'nonexistent.md' })
      expect(result.text).toContain('File not found')
      expect(result.isError).toBe(true)
    })
  })

  describe('read_section', () => {
    it('reads section by heading text', async () => {
      const { text } = await callTool(server, 'read_section', {
        path: 'getting-started.md',
        heading: 'Configuration',
      })
      expect(text).toContain('## Configuration')
      expect(text).toContain('config file')
    })

    it('reads section by slug', async () => {
      const { text } = await callTool(server, 'read_section', {
        path: 'getting-started.md',
        heading: 'configuration',
      })
      expect(text).toContain('Configuration')
    })

    it('returns error for missing file', async () => {
      const result = await callTool(server, 'read_section', {
        path: 'nonexistent.md',
        heading: 'test',
      })
      expect(result.isError).toBe(true)
    })

    it('returns error with available sections for missing heading', async () => {
      const result = await callTool(server, 'read_section', {
        path: 'getting-started.md',
        heading: 'nonexistent-section',
      })
      expect(result.isError).toBe(true)
      expect(result.text).toContain('Available sections')
      expect(result.text).toContain('Installation')
    })
  })

  describe('list_headings', () => {
    it('lists headings from all files', async () => {
      const { text } = await callTool(server, 'list_headings')
      const headings = JSON.parse(text)
      expect(headings.length).toBeGreaterThan(0)
      expect(headings[0]).toHaveProperty('file')
      expect(headings[0]).toHaveProperty('level')
      expect(headings[0]).toHaveProperty('heading')
      expect(headings[0]).toHaveProperty('anchor')
    })

    it('filters by file path', async () => {
      const { text } = await callTool(server, 'list_headings', { path: 'api-reference.md' })
      const headings = JSON.parse(text)
      expect(headings.every((h: any) => h.file === 'api-reference.md')).toBe(true)
    })

    it('returns error for missing file', async () => {
      const result = await callTool(server, 'list_headings', { path: 'nope.md' })
      expect(result.isError).toBe(true)
    })
  })

  describe('code_examples', () => {
    it('returns code blocks from all files', async () => {
      const { text } = await callTool(server, 'code_examples')
      expect(text).toContain('```')
    })

    it('filters by language', async () => {
      const { text } = await callTool(server, 'code_examples', { language: 'yaml' })
      expect(text).toContain('```yaml')
      expect(text).not.toContain('```typescript')
    })

    it('filters by file path', async () => {
      const { text } = await callTool(server, 'code_examples', { path: 'api-reference.md' })
      expect(text).toContain('api-reference.md')
      expect(text).not.toContain('getting-started.md')
    })

    it('returns message when no examples match', async () => {
      const { text } = await callTool(server, 'code_examples', { language: 'rust' })
      expect(text).toContain('No code examples found')
    })
  })

  describe('file_outline', () => {
    it('returns outline with heading hierarchy', async () => {
      const { text } = await callTool(server, 'file_outline', { path: 'getting-started.md' })
      expect(text).toContain('# Getting Started')
      expect(text).toContain('Installation')
      expect(text).toContain('words')
      expect(text).toContain('code blocks')
    })

    it('returns error for missing file', async () => {
      const result = await callTool(server, 'file_outline', { path: 'nope.md' })
      expect(result.isError).toBe(true)
    })
  })

  describe('docs_stats', () => {
    it('returns JSON stats', async () => {
      const { text } = await callTool(server, 'docs_stats')
      const stats = JSON.parse(text)
      expect(stats).toHaveProperty('totalFiles')
      expect(stats).toHaveProperty('totalSections')
      expect(stats).toHaveProperty('totalCodeBlocks')
      expect(stats).toHaveProperty('totalLinks')
      expect(stats).toHaveProperty('totalWords')
      expect(stats).toHaveProperty('languages')
      expect(stats.totalFiles).toBeGreaterThanOrEqual(3)
    })
  })

  describe('reindex', () => {
    it('rebuilds the index and reports counts', async () => {
      const { text } = await callTool(server, 'reindex')
      expect(text).toContain('Reindexed')
      expect(text).toContain('files')
      expect(text).toContain('Indexed at')
    })
  })
})
