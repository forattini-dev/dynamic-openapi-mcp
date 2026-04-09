import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { DocsState } from './types.js'

export function registerDocsResources(server: McpServer, state: DocsState): void {
  server.resource(
    'docs-files',
    'docs://files',
    { description: 'List of all indexed documentation files', mimeType: 'application/json' },
    async () => ({
      contents: [
        {
          uri: 'docs://files',
          mimeType: 'application/json',
          text: JSON.stringify(
            state.index.files.map((f) => ({
              path: f.path,
              title: f.title,
              sections: f.sections.length,
              words: f.wordCount,
            })),
            null,
            2,
          ),
        },
      ],
    }),
  )

  const template = new ResourceTemplate('docs://file/{path}', {
    list: async () => ({
      resources: state.index.files.map((f) => ({
        uri: `docs://file/${f.path}`,
        name: f.title,
        description: `Documentation file: ${f.path}`,
        mimeType: 'text/markdown',
      })),
    }),
    complete: {
      path: async (value: string) =>
        state.index.files
          .map((f) => f.path)
          .filter((p) => p.startsWith(value)),
    },
  })

  server.resource(
    'docs-file',
    template,
    { description: 'Read a specific documentation file', mimeType: 'text/markdown' },
    async (uri, variables) => {
      const filePath = variables.path as string
      const file = state.index.files.find((f) => f.path === filePath)

      if (!file) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'text/plain',
              text: `File not found: ${filePath}`,
            },
          ],
        }
      }

      const text = file.sections
        .map((s) => {
          const prefix = s.level > 0 ? `${'#'.repeat(s.level)} ${s.heading}\n\n` : ''
          return prefix + s.content
        })
        .join('\n\n')

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'text/markdown',
            text,
          },
        ],
      }
    },
  )
}
