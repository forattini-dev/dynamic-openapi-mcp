import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { DocsState } from './types.js'
import { computeStats } from './indexer.js'

export function registerDocsPrompts(server: McpServer, state: DocsState): void {
  server.prompt(
    'explain-docs',
    'Overview of the documentation collection',
    {},
    async () => {
      const stats = computeStats(state.index)
      const fileList = state.index.files
        .map((f) => `- **${f.title}** (${f.path}) — ${f.sections.length} sections, ${f.wordCount} words`)
        .join('\n')

      const topHeadings = state.index.files
        .flatMap((f) => f.sections.filter((s) => s.level <= 2 && s.level > 0))
        .map((s) => s.heading)
        .slice(0, 20)
        .join(', ')

      const text = [
        `# Documentation: ${state.index.name}`,
        '',
        `**Files:** ${stats.totalFiles} | **Sections:** ${stats.totalSections} | **Words:** ${stats.totalWords} | **Code blocks:** ${stats.totalCodeBlocks}`,
        '',
        '## Files',
        fileList,
        '',
        '## Key Topics',
        topHeadings,
        '',
        'Use the `search_docs` tool to find specific information, `read_file` to read a full document, or `list_headings` to explore the structure.',
      ].join('\n')

      return {
        messages: [{ role: 'user' as const, content: { type: 'text' as const, text } }],
      }
    },
  )

  server.prompt(
    'summarize-file',
    'Summarize a specific documentation file',
    {
      path: z.string().describe('Path to the markdown file to summarize'),
    },
    async (args) => {
      const file = state.index.files.find((f) => f.path === args.path)

      if (!file) {
        const available = state.index.files.map((f) => f.path).join(', ')
        return {
          messages: [
            {
              role: 'user' as const,
              content: {
                type: 'text' as const,
                text: `File "${args.path}" not found. Available files: ${available}`,
              },
            },
          ],
        }
      }

      const outline = file.sections
        .filter((s) => s.level > 0)
        .map((s) => `${'  '.repeat(s.level - 1)}- ${s.heading}`)
        .join('\n')

      const preview = file.sections
        .map((s) => s.content)
        .join('\n')
        .slice(0, 500)

      const text = [
        `# ${file.title}`,
        '',
        `**Path:** ${file.path}`,
        `**Words:** ${file.wordCount}`,
        `**Sections:** ${file.sections.length}`,
        '',
        '## Outline',
        outline || '(no headings)',
        '',
        '## Preview',
        preview + (preview.length >= 500 ? '...' : ''),
        '',
        'Please provide a comprehensive summary of this document.',
      ].join('\n')

      return {
        messages: [{ role: 'user' as const, content: { type: 'text' as const, text } }],
      }
    },
  )
}
