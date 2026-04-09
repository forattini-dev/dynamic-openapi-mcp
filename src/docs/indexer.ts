import { readdir, readFile } from 'node:fs/promises'
import { join, relative, extname } from 'node:path'
import type {
  DocsIndex,
  DocFile,
  Section,
  Heading,
  CodeBlock,
  DocLink,
  Frontmatter,
  SearchResult,
  DocsStats,
} from './types.js'

const EXTENSIONS = new Set(['.md', '.mdx'])
const EXCLUDED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  '.next',
  '.nuxt',
  'build',
  'coverage',
])

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export function parseFrontmatter(content: string): { frontmatter: Frontmatter; body: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return { frontmatter: {}, body: content }

  const raw = match[1]
  const body = content.slice(match[0].length).replace(/^\r?\n/, '')
  const frontmatter: Frontmatter = {}

  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const colonIdx = trimmed.indexOf(':')
    if (colonIdx < 1) continue

    const key = trimmed.slice(0, colonIdx).trim()
    let value: unknown = trimmed.slice(colonIdx + 1).trim()

    if (typeof value === 'string') {
      const str = value as string
      if (str.startsWith('[') && str.endsWith(']')) {
        value = str
          .slice(1, -1)
          .split(',')
          .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
          .filter(Boolean)
      } else if (str === 'true') {
        value = true
      } else if (str === 'false') {
        value = false
      } else if (/^-?\d+(\.\d+)?$/.test(str)) {
        value = Number(str)
      } else {
        value = str.replace(/^['"]|['"]$/g, '')
      }
    }

    frontmatter[key] = value
  }

  return { frontmatter, body }
}

export function extractHeadings(content: string): Heading[] {
  const headings: Heading[] = []
  const lines = content.split('\n')
  let inCodeFence = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.match(/^(`{3,}|~{3,})/)) {
      inCodeFence = !inCodeFence
      continue
    }
    if (inCodeFence) continue

    const match = line.match(/^(#{1,6})\s+(.+)$/)
    if (match) {
      headings.push({
        level: match[1].length,
        text: match[2].trim(),
        line: i + 1,
        slug: slugify(match[2].trim()),
      })
    }
  }

  return headings
}

export function extractCodeBlocks(content: string): CodeBlock[] {
  const blocks: CodeBlock[] = []
  const lines = content.split('\n')
  let inBlock = false
  let language = ''
  let code: string[] = []
  let startLine = 0
  let fencePattern = ''

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (!inBlock) {
      const openMatch = line.match(/^(`{3,}|~{3,})(\w*)/)
      if (openMatch) {
        inBlock = true
        fencePattern = openMatch[1][0]
        language = openMatch[2] || ''
        code = []
        startLine = i + 1
      }
    } else {
      const closeMatch = line.match(new RegExp(`^${fencePattern}{3,}\\s*$`))
      if (closeMatch) {
        blocks.push({ language, code: code.join('\n'), startLine })
        inBlock = false
      } else {
        code.push(line)
      }
    }
  }

  return blocks
}

export function extractLinks(content: string): DocLink[] {
  const links: DocLink[] = []
  const regex = /\[([^\]]+)\]\(([^)]+)\)/g
  let match: RegExpExecArray | null

  while ((match = regex.exec(content)) !== null) {
    const url = match[2]
    links.push({
      text: match[1],
      url,
      isInternal: !url.startsWith('http://') && !url.startsWith('https://'),
    })
  }

  return links
}

export function splitSections(body: string, headings: Heading[]): Section[] {
  const lines = body.split('\n')
  const sections: Section[] = []

  if (headings.length === 0) {
    const content = body.trim()
    if (content) {
      sections.push({
        heading: '',
        level: 0,
        content,
        codeBlocks: extractCodeBlocks(content),
        links: extractLinks(content),
        line: 1,
        anchor: '',
      })
    }
    return sections
  }

  // Preamble (content before first heading)
  const firstHeadingLine = headings[0].line
  if (firstHeadingLine > 1) {
    const preamble = lines.slice(0, firstHeadingLine - 1).join('\n').trim()
    if (preamble) {
      sections.push({
        heading: '',
        level: 0,
        content: preamble,
        codeBlocks: extractCodeBlocks(preamble),
        links: extractLinks(preamble),
        line: 1,
        anchor: '',
      })
    }
  }

  for (let i = 0; i < headings.length; i++) {
    const h = headings[i]
    const startLine = h.line
    const endLine = i + 1 < headings.length ? headings[i + 1].line - 1 : lines.length
    const content = lines.slice(startLine, endLine).join('\n').trim()

    sections.push({
      heading: h.text,
      level: h.level,
      content,
      codeBlocks: extractCodeBlocks(content),
      links: extractLinks(content),
      line: h.line,
      anchor: h.slug,
    })
  }

  return sections
}

export function parseMarkdownFile(content: string, filePath: string): DocFile {
  const { frontmatter, body } = parseFrontmatter(content)
  const headings = extractHeadings(body)
  const sections = splitSections(body, headings)

  const title =
    (frontmatter.title as string) ??
    headings.find((h) => h.level === 1)?.text ??
    filePath.replace(/\.(md|mdx)$/, '')

  const wordCount = body
    .replace(/```[\s\S]*?```/g, '')
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length

  return { path: filePath, title, frontmatter, sections, wordCount }
}

async function walkDir(dir: string, root: string, maxDepth = 10, depth = 0): Promise<string[]> {
  if (depth > maxDepth) return []

  const entries = await readdir(dir, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue

    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue
      const sub = await walkDir(join(dir, entry.name), root, maxDepth, depth + 1)
      files.push(...sub)
    } else if (EXTENSIONS.has(extname(entry.name).toLowerCase())) {
      files.push(relative(root, join(dir, entry.name)))
    }
  }

  return files.sort()
}

export async function buildIndex(rootDir: string, name: string): Promise<DocsIndex> {
  const filePaths = await walkDir(rootDir, rootDir)
  const files: DocFile[] = []
  const allSections: Section[] = []

  for (const fp of filePaths) {
    const content = await readFile(join(rootDir, fp), 'utf-8')
    const doc = parseMarkdownFile(content, fp)
    files.push(doc)

    for (const section of doc.sections) {
      allSections.push({ ...section, anchor: `${fp}#${section.anchor}` })
    }
  }

  return {
    root: rootDir,
    name,
    files,
    sections: allSections,
    indexedAt: new Date().toISOString(),
  }
}

export function search(
  index: DocsIndex,
  query: string,
  maxResults = 20,
): SearchResult[] {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)

  if (terms.length === 0) return []

  const queryLower = query.toLowerCase()
  const results: SearchResult[] = []

  for (const file of index.files) {
    const filenameLower = file.path.toLowerCase()

    for (const section of file.sections) {
      let score = 0
      const headingLower = section.heading.toLowerCase()
      const contentLower = section.content.toLowerCase()

      for (const term of terms) {
        if (headingLower.includes(term)) score += 10
        if (filenameLower.includes(term)) score += 5
        if (contentLower.includes(term)) score += 3
        for (const cb of section.codeBlocks) {
          if (cb.code.toLowerCase().includes(term)) {
            score += 2
            break
          }
        }
      }

      // Exact phrase bonus
      if (terms.length > 1 && contentLower.includes(queryLower)) {
        score += 5
      }

      if (score > 0) {
        const snippet = buildSnippet(section.content, terms)
        results.push({
          file: file.path,
          heading: section.heading || '(preamble)',
          anchor: section.anchor,
          level: section.level,
          score,
          snippet,
        })
      }
    }
  }

  results.sort((a, b) => b.score - a.score)
  return results.slice(0, maxResults)
}

function buildSnippet(content: string, terms: string[]): string {
  const lower = content.toLowerCase()
  let bestPos = 0

  for (const term of terms) {
    const idx = lower.indexOf(term)
    if (idx !== -1) {
      bestPos = idx
      break
    }
  }

  const start = Math.max(0, bestPos - 80)
  const end = Math.min(content.length, bestPos + 120)
  let snippet = content.slice(start, end).replace(/\n/g, ' ').trim()

  if (start > 0) snippet = '...' + snippet
  if (end < content.length) snippet = snippet + '...'

  return snippet
}

export function computeStats(index: DocsIndex): DocsStats {
  const languages: Record<string, number> = {}
  let totalCodeBlocks = 0
  let totalLinks = 0
  let totalWords = 0

  for (const file of index.files) {
    totalWords += file.wordCount
    for (const section of file.sections) {
      totalLinks += section.links.length
      for (const cb of section.codeBlocks) {
        totalCodeBlocks++
        const lang = cb.language || 'unknown'
        languages[lang] = (languages[lang] ?? 0) + 1
      }
    }
  }

  return {
    totalFiles: index.files.length,
    totalSections: index.sections.length,
    totalCodeBlocks,
    totalLinks,
    totalWords,
    languages,
  }
}
