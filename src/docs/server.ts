import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { basename, join, resolve } from 'node:path'
import type { DocsMcpOptions, DocsMcp, DocsState } from './types.js'
import { buildIndex } from './indexer.js'
import { isGitUrl, cloneRepo } from './git.js'
import { registerDocsTools } from './tools.js'
import { registerDocsResources } from './resources.js'
import { registerDocsPrompts } from './prompts.js'

export async function createDocsMcp(options: DocsMcpOptions): Promise<DocsMcp> {
  let docsDir: string

  if (isGitUrl(options.source)) {
    docsDir = await cloneRepo({
      url: options.source,
      branch: options.branch,
      path: options.path,
    })
  } else {
    const base = resolve(options.source)
    docsDir = options.path ? join(base, options.path) : base
  }

  const name = options.name ?? basename(docsDir)
  const index = await buildIndex(docsDir, name)

  const server = new McpServer({
    name: `${name}-docs`,
    version: '1.0.0',
  })

  const state: DocsState = { index }

  registerDocsTools(server, state)
  registerDocsResources(server, state)
  registerDocsPrompts(server, state)

  return {
    server,
    index,
    async serve() {
      const transport = new StdioServerTransport()
      await server.connect(transport)
    },
  }
}
