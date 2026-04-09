import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { DocsState } from './types.js'
import { search, computeStats, buildIndex } from './indexer.js'

export function registerDocsTools(server: McpServer, state: DocsState): void {
  server.tool(
    'search_docs',
    'Full-text search across all documentation files',
    {
      query: z.string().describe('Search query'),
      max_results: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe('Maximum results to return (default: 20)'),
    },
    async (args) => {
      const results = search(state.index, args.query, args.max_results)

      if (results.length === 0) {
        return { content: [{ type: 'text' as const, text: `No results for "${args.query}"` }] }
      }

      const text = results
        .map(
          (r, i) =>
            `${i + 1}. **${r.heading}** (${r.file}) — score: ${r.score}\n   ${r.snippet}`,
        )
        .join('\n\n')

      return { content: [{ type: 'text' as const, text }] }
    },
  )

  server.tool(
    'list_files',
    'List all indexed documentation files',
    {},
    async () => {
      const files = state.index.files.map((f) => ({
        path: f.path,
        title: f.title,
        sections: f.sections.length,
        words: f.wordCount,
      }))

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(files, null, 2) }],
      }
    },
  )

  server.tool(
    'read_file',
    'Read the full content of a documentation file',
    {
      path: z.string().describe('Relative path to the markdown file'),
    },
    async (args) => {
      const file = state.index.files.find((f) => f.path === args.path)
      if (!file) {
        return {
          content: [{ type: 'text' as const, text: `File not found: ${args.path}` }],
          isError: true,
        }
      }

      const text = file.sections
        .map((s) => {
          const prefix = s.level > 0 ? `${'#'.repeat(s.level)} ${s.heading}\n\n` : ''
          return prefix + s.content
        })
        .join('\n\n')

      return { content: [{ type: 'text' as const, text }] }
    },
  )

  server.tool(
    'read_section',
    'Read a specific section of a documentation file by heading',
    {
      path: z.string().describe('Relative path to the markdown file'),
      heading: z.string().describe('Heading text or slug to find'),
    },
    async (args) => {
      const file = state.index.files.find((f) => f.path === args.path)
      if (!file) {
        return {
          content: [{ type: 'text' as const, text: `File not found: ${args.path}` }],
          isError: true,
        }
      }

      const headingLower = args.heading.toLowerCase()
      const section = file.sections.find(
        (s) =>
          s.heading.toLowerCase() === headingLower ||
          s.anchor === headingLower ||
          s.anchor === args.heading,
      )

      if (!section) {
        const available = file.sections
          .filter((s) => s.heading)
          .map((s) => `  - ${s.heading} (${s.anchor})`)
          .join('\n')
        return {
          content: [
            {
              type: 'text' as const,
              text: `Section "${args.heading}" not found in ${args.path}.\n\nAvailable sections:\n${available}`,
            },
          ],
          isError: true,
        }
      }

      let text = ''
      if (section.level > 0) {
        text += `${'#'.repeat(section.level)} ${section.heading}\n\n`
      }
      text += section.content

      return { content: [{ type: 'text' as const, text }] }
    },
  )

  server.tool(
    'list_headings',
    'List all headings across documentation files, optionally filtered by file',
    {
      path: z.string().optional().describe('Filter by file path'),
    },
    async (args) => {
      const files = args.path
        ? state.index.files.filter((f) => f.path === args.path)
        : state.index.files

      if (args.path && files.length === 0) {
        return {
          content: [{ type: 'text' as const, text: `File not found: ${args.path}` }],
          isError: true,
        }
      }

      const headings = files.flatMap((f) =>
        f.sections
          .filter((s) => s.level > 0)
          .map((s) => ({
            file: f.path,
            level: s.level,
            heading: s.heading,
            anchor: s.anchor,
          })),
      )

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(headings, null, 2) }],
      }
    },
  )

  server.tool(
    'code_examples',
    'Find code blocks in documentation, optionally filtered by language or file',
    {
      language: z.string().optional().describe('Filter by programming language'),
      path: z.string().optional().describe('Filter by file path'),
    },
    async (args) => {
      const files = args.path
        ? state.index.files.filter((f) => f.path === args.path)
        : state.index.files

      const examples: Array<{
        file: string
        section: string
        language: string
        code: string
      }> = []

      for (const file of files) {
        for (const section of file.sections) {
          for (const cb of section.codeBlocks) {
            if (args.language && cb.language !== args.language) continue
            examples.push({
              file: file.path,
              section: section.heading || '(preamble)',
              language: cb.language || 'unknown',
              code: cb.code,
            })
          }
        }
      }

      if (examples.length === 0) {
        return {
          content: [{ type: 'text' as const, text: 'No code examples found matching the criteria.' }],
        }
      }

      const text = examples
        .map(
          (e) =>
            `### ${e.file} > ${e.section}\n\`\`\`${e.language}\n${e.code}\n\`\`\``,
        )
        .join('\n\n')

      return { content: [{ type: 'text' as const, text }] }
    },
  )

  server.tool(
    'file_outline',
    'Get the structural outline (table of contents) of a documentation file',
    {
      path: z.string().describe('Relative path to the markdown file'),
    },
    async (args) => {
      const file = state.index.files.find((f) => f.path === args.path)
      if (!file) {
        return {
          content: [{ type: 'text' as const, text: `File not found: ${args.path}` }],
          isError: true,
        }
      }

      const outline = file.sections
        .filter((s) => s.level > 0)
        .map((s) => {
          const indent = '  '.repeat(s.level - 1)
          const words = s.content.split(/\s+/).filter(Boolean).length
          return `${indent}- ${s.heading} (${words} words, ${s.codeBlocks.length} code blocks)`
        })
        .join('\n')

      const header = `# ${file.title}\n\n`
      return { content: [{ type: 'text' as const, text: header + (outline || '(no headings)') }] }
    },
  )

  server.tool(
    'docs_stats',
    'Get statistics about the documentation collection',
    {},
    async () => {
      const stats = computeStats(state.index)
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(stats, null, 2) }],
      }
    },
  )

  server.tool(
    'reindex',
    'Re-scan the documentation directory and rebuild the index',
    {},
    async () => {
      const oldCount = state.index.files.length
      state.index = await buildIndex(state.index.root, state.index.name)
      const newCount = state.index.files.length

      return {
        content: [
          {
            type: 'text' as const,
            text: `Reindexed: ${newCount} files (was ${oldCount}). Indexed at ${state.index.indexedAt}`,
          },
        ],
      }
    },
  )
}
