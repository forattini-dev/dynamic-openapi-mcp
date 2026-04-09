import { describe, it, expect, beforeAll } from 'vitest'
import { resolve } from 'node:path'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerDocsPrompts } from '../../src/docs/prompts.js'
import { buildIndex } from '../../src/docs/indexer.js'
import type { DocsState } from '../../src/docs/types.js'

const FIXTURES = resolve(import.meta.dirname, 'fixtures')

async function getPromptText(
  server: McpServer,
  promptName: string,
  args: Record<string, string> = {},
): Promise<string> {
  const internals = server as any
  const prompt = internals._registeredPrompts[promptName]
  if (!prompt?.callback) throw new Error(`Prompt "${promptName}" not found`)
  const result = await prompt.callback(args)
  return result.messages[0].content.text
}

describe('docs prompts', () => {
  let server: McpServer
  let state: DocsState

  beforeAll(async () => {
    const index = await buildIndex(FIXTURES, 'test-docs')
    state = { index }
    server = new McpServer({ name: 'test', version: '1.0.0' })
    registerDocsPrompts(server, state)
  })

  describe('explain-docs', () => {
    it('registers the prompt', () => {
      const internals = server as any
      expect(internals._registeredPrompts['explain-docs']).toBeDefined()
    })

    it('includes collection name', async () => {
      const text = await getPromptText(server, 'explain-docs')
      expect(text).toContain('test-docs')
    })

    it('includes file list', async () => {
      const text = await getPromptText(server, 'explain-docs')
      expect(text).toContain('getting-started.md')
      expect(text).toContain('api-reference.md')
    })

    it('includes stats', async () => {
      const text = await getPromptText(server, 'explain-docs')
      expect(text).toContain('Files:')
      expect(text).toContain('Sections:')
      expect(text).toContain('Words:')
    })

    it('includes key topics from headings', async () => {
      const text = await getPromptText(server, 'explain-docs')
      expect(text).toContain('Key Topics')
    })

    it('suggests tools to use', async () => {
      const text = await getPromptText(server, 'explain-docs')
      expect(text).toContain('search_docs')
      expect(text).toContain('read_file')
    })
  })

  describe('summarize-file', () => {
    it('registers the prompt', () => {
      const internals = server as any
      expect(internals._registeredPrompts['summarize-file']).toBeDefined()
    })

    it('returns file summary with outline', async () => {
      const text = await getPromptText(server, 'summarize-file', { path: 'getting-started.md' })
      expect(text).toContain('Getting Started')
      expect(text).toContain('Outline')
      expect(text).toContain('Installation')
      expect(text).toContain('Preview')
      expect(text).toContain('Words:')
    })

    it('includes section count and path', async () => {
      const text = await getPromptText(server, 'summarize-file', { path: 'api-reference.md' })
      expect(text).toContain('Path:')
      expect(text).toContain('api-reference.md')
      expect(text).toContain('Sections:')
    })

    it('shows available files for missing file', async () => {
      const text = await getPromptText(server, 'summarize-file', { path: 'nope.md' })
      expect(text).toContain('not found')
      expect(text).toContain('getting-started.md')
    })
  })
})
