import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

export interface Frontmatter {
  title?: string
  description?: string
  tags?: string[]
  [key: string]: unknown
}

export interface CodeBlock {
  language: string
  code: string
  startLine: number
}

export interface DocLink {
  text: string
  url: string
  isInternal: boolean
}

export interface Heading {
  level: number
  text: string
  line: number
  slug: string
}

export interface Section {
  heading: string
  level: number
  content: string
  codeBlocks: CodeBlock[]
  links: DocLink[]
  line: number
  anchor: string
}

export interface DocFile {
  path: string
  title: string
  frontmatter: Frontmatter
  sections: Section[]
  wordCount: number
}

export interface DocsIndex {
  root: string
  name: string
  files: DocFile[]
  sections: Section[]
  indexedAt: string
}

export interface SearchResult {
  file: string
  heading: string
  anchor: string
  level: number
  score: number
  snippet: string
}

export interface DocsStats {
  totalFiles: number
  totalSections: number
  totalCodeBlocks: number
  totalLinks: number
  totalWords: number
  languages: Record<string, number>
}

export interface DocsMcpOptions {
  source: string
  name?: string
  path?: string
  branch?: string
}

export interface DocsMcp {
  server: McpServer
  index: DocsIndex
  serve(): Promise<void>
}

export interface DocsState {
  index: DocsIndex
}
