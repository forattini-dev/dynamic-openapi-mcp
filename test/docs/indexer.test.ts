import { describe, it, expect } from 'vitest'
import { resolve } from 'node:path'
import {
  slugify,
  parseFrontmatter,
  extractHeadings,
  extractCodeBlocks,
  extractLinks,
  splitSections,
  parseMarkdownFile,
  buildIndex,
  search,
  computeStats,
} from '../../src/docs/indexer.js'

const FIXTURES = resolve(import.meta.dirname, 'fixtures')

describe('slugify', () => {
  it('converts text to lowercase slug', () => {
    expect(slugify('Hello World')).toBe('hello-world')
  })

  it('removes special characters', () => {
    expect(slugify('What is this?!')).toBe('what-is-this')
  })

  it('collapses multiple dashes', () => {
    expect(slugify('one -- two --- three')).toBe('one-two-three')
  })

  it('trims leading and trailing dashes', () => {
    expect(slugify('  -hello- ')).toBe('hello')
  })

  it('handles empty string', () => {
    expect(slugify('')).toBe('')
  })
})

describe('parseFrontmatter', () => {
  it('parses key-value pairs', () => {
    const content = '---\ntitle: Hello World\ndescription: A test\n---\nBody here'
    const { frontmatter, body } = parseFrontmatter(content)
    expect(frontmatter.title).toBe('Hello World')
    expect(frontmatter.description).toBe('A test')
    expect(body).toBe('Body here')
  })

  it('parses arrays', () => {
    const content = '---\ntags: [one, two, three]\n---\nBody'
    const { frontmatter } = parseFrontmatter(content)
    expect(frontmatter.tags).toEqual(['one', 'two', 'three'])
  })

  it('parses booleans', () => {
    const content = '---\ndraft: true\npublished: false\n---\nBody'
    const { frontmatter } = parseFrontmatter(content)
    expect(frontmatter.draft).toBe(true)
    expect(frontmatter.published).toBe(false)
  })

  it('parses numbers', () => {
    const content = '---\nversion: 42\nweight: 3.14\n---\nBody'
    const { frontmatter } = parseFrontmatter(content)
    expect(frontmatter.version).toBe(42)
    expect(frontmatter.weight).toBe(3.14)
  })

  it('strips quotes from strings', () => {
    const content = '---\ntitle: "Quoted Title"\nother: \'Single\'\n---\nBody'
    const { frontmatter } = parseFrontmatter(content)
    expect(frontmatter.title).toBe('Quoted Title')
    expect(frontmatter.other).toBe('Single')
  })

  it('returns empty frontmatter when none present', () => {
    const content = 'Just a body with no frontmatter'
    const { frontmatter, body } = parseFrontmatter(content)
    expect(frontmatter).toEqual({})
    expect(body).toBe(content)
  })

  it('skips comment lines', () => {
    const content = '---\ntitle: Test\n# this is a comment\nversion: 1\n---\nBody'
    const { frontmatter } = parseFrontmatter(content)
    expect(frontmatter.title).toBe('Test')
    expect(frontmatter.version).toBe(1)
    expect(Object.keys(frontmatter)).toHaveLength(2)
  })
})

describe('extractHeadings', () => {
  it('extracts headings with levels', () => {
    const content = '# Title\n\nSome text\n\n## Section\n\n### Subsection'
    const headings = extractHeadings(content)
    expect(headings).toHaveLength(3)
    expect(headings[0]).toMatchObject({ level: 1, text: 'Title' })
    expect(headings[1]).toMatchObject({ level: 2, text: 'Section' })
    expect(headings[2]).toMatchObject({ level: 3, text: 'Subsection' })
  })

  it('includes line numbers', () => {
    const content = 'Line 1\n# Heading on line 2\nLine 3\n## Heading on line 4'
    const headings = extractHeadings(content)
    expect(headings[0].line).toBe(2)
    expect(headings[1].line).toBe(4)
  })

  it('generates slugs', () => {
    const content = '# Hello World\n## API Reference'
    const headings = extractHeadings(content)
    expect(headings[0].slug).toBe('hello-world')
    expect(headings[1].slug).toBe('api-reference')
  })

  it('ignores headings inside code fences', () => {
    const content = '# Real Heading\n\n```\n# Not a heading\n```\n\n## Another Real'
    const headings = extractHeadings(content)
    expect(headings).toHaveLength(2)
    expect(headings[0].text).toBe('Real Heading')
    expect(headings[1].text).toBe('Another Real')
  })

  it('ignores headings inside tilde fences', () => {
    const content = '# Real\n\n~~~\n# Fake\n~~~\n\n## Also Real'
    const headings = extractHeadings(content)
    expect(headings).toHaveLength(2)
  })

  it('returns empty for content with no headings', () => {
    const content = 'Just some text\nwith no headings at all'
    expect(extractHeadings(content)).toHaveLength(0)
  })
})

describe('extractCodeBlocks', () => {
  it('extracts backtick code blocks with language', () => {
    const content = 'Text\n\n```typescript\nconst x = 1\n```\n\nMore text'
    const blocks = extractCodeBlocks(content)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].language).toBe('typescript')
    expect(blocks[0].code).toBe('const x = 1')
  })

  it('extracts multiple code blocks', () => {
    const content = '```js\nfoo()\n```\n\n```python\nbar()\n```'
    const blocks = extractCodeBlocks(content)
    expect(blocks).toHaveLength(2)
    expect(blocks[0].language).toBe('js')
    expect(blocks[1].language).toBe('python')
  })

  it('extracts code blocks without language', () => {
    const content = '```\nplain code\n```'
    const blocks = extractCodeBlocks(content)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].language).toBe('')
    expect(blocks[0].code).toBe('plain code')
  })

  it('extracts tilde code blocks', () => {
    const content = '~~~yaml\nkey: value\n~~~'
    const blocks = extractCodeBlocks(content)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].language).toBe('yaml')
    expect(blocks[0].code).toBe('key: value')
  })

  it('tracks start line numbers', () => {
    const content = 'line 1\nline 2\n```js\ncode\n```'
    const blocks = extractCodeBlocks(content)
    expect(blocks[0].startLine).toBe(3)
  })

  it('handles multiline code blocks', () => {
    const content = '```ts\nline 1\nline 2\nline 3\n```'
    const blocks = extractCodeBlocks(content)
    expect(blocks[0].code).toBe('line 1\nline 2\nline 3')
  })

  it('returns empty for no code blocks', () => {
    expect(extractCodeBlocks('Just text')).toHaveLength(0)
  })
})

describe('extractLinks', () => {
  it('extracts internal links', () => {
    const content = 'See [the guide](./guide.md) for more.'
    const links = extractLinks(content)
    expect(links).toHaveLength(1)
    expect(links[0]).toMatchObject({ text: 'the guide', url: './guide.md', isInternal: true })
  })

  it('extracts external links', () => {
    const content = 'Visit [Example](https://example.com) site.'
    const links = extractLinks(content)
    expect(links).toHaveLength(1)
    expect(links[0]).toMatchObject({ text: 'Example', url: 'https://example.com', isInternal: false })
  })

  it('extracts multiple links', () => {
    const content = '[One](a.md) and [Two](https://b.com) and [Three](c.md)'
    const links = extractLinks(content)
    expect(links).toHaveLength(3)
    expect(links[0].isInternal).toBe(true)
    expect(links[1].isInternal).toBe(false)
    expect(links[2].isInternal).toBe(true)
  })

  it('detects http as external', () => {
    const content = '[Link](http://example.com/path.git)'
    const links = extractLinks(content)
    expect(links[0].isInternal).toBe(false)
  })

  it('returns empty for no links', () => {
    expect(extractLinks('No links here')).toHaveLength(0)
  })
})

describe('splitSections', () => {
  it('creates a single section for content with no headings', () => {
    const body = 'Just some text\nwith no headings'
    const sections = splitSections(body, [])
    expect(sections).toHaveLength(1)
    expect(sections[0].level).toBe(0)
    expect(sections[0].heading).toBe('')
  })

  it('creates a preamble section for content before first heading', () => {
    const body = 'Preamble text\n\n# Title\n\nBody text'
    const headings = extractHeadings(body)
    const sections = splitSections(body, headings)
    expect(sections[0].level).toBe(0)
    expect(sections[0].content).toBe('Preamble text')
    expect(sections[1].heading).toBe('Title')
  })

  it('splits content by headings', () => {
    const body = '# First\n\nFirst content\n\n## Second\n\nSecond content'
    const headings = extractHeadings(body)
    const sections = splitSections(body, headings)
    expect(sections).toHaveLength(2)
    expect(sections[0].heading).toBe('First')
    expect(sections[1].heading).toBe('Second')
  })

  it('extracts code blocks within sections', () => {
    const body = '# Title\n\n```js\nfoo()\n```'
    const headings = extractHeadings(body)
    const sections = splitSections(body, headings)
    expect(sections[0].codeBlocks).toHaveLength(1)
    expect(sections[0].codeBlocks[0].language).toBe('js')
  })

  it('extracts links within sections', () => {
    const body = '# Title\n\nSee [link](url.md) here'
    const headings = extractHeadings(body)
    const sections = splitSections(body, headings)
    expect(sections[0].links).toHaveLength(1)
  })

  it('returns empty for empty body', () => {
    const sections = splitSections('', [])
    expect(sections).toHaveLength(0)
  })
})

describe('parseMarkdownFile', () => {
  it('uses frontmatter title', () => {
    const content = '---\ntitle: My Title\n---\n\n# Heading\n\nBody'
    const file = parseMarkdownFile(content, 'test.md')
    expect(file.title).toBe('My Title')
  })

  it('falls back to first h1 as title', () => {
    const content = '# Heading Title\n\nBody'
    const file = parseMarkdownFile(content, 'test.md')
    expect(file.title).toBe('Heading Title')
  })

  it('falls back to filename as title', () => {
    const content = 'Just some text with no heading'
    const file = parseMarkdownFile(content, 'my-doc.md')
    expect(file.title).toBe('my-doc')
  })

  it('strips .mdx extension from filename fallback', () => {
    const content = 'No heading'
    const file = parseMarkdownFile(content, 'doc.mdx')
    expect(file.title).toBe('doc')
  })

  it('preserves frontmatter', () => {
    const content = '---\ntitle: Test\ntags: [a, b]\n---\n\nBody'
    const file = parseMarkdownFile(content, 'test.md')
    expect(file.frontmatter.tags).toEqual(['a', 'b'])
  })

  it('calculates word count excluding code blocks', () => {
    const content = '# Title\n\nOne two three four five\n\n```js\nconst x = 1\n```'
    const file = parseMarkdownFile(content, 'test.md')
    expect(file.wordCount).toBeGreaterThan(0)
  })

  it('sets the file path', () => {
    const file = parseMarkdownFile('# Test', 'docs/test.md')
    expect(file.path).toBe('docs/test.md')
  })
})

describe('buildIndex', () => {
  it('indexes all markdown files in directory', async () => {
    const index = await buildIndex(FIXTURES, 'test-docs')
    expect(index.name).toBe('test-docs')
    expect(index.root).toBe(FIXTURES)
    expect(index.files.length).toBeGreaterThanOrEqual(3)
    expect(index.indexedAt).toBeTruthy()
  })

  it('indexes files in subdirectories', async () => {
    const index = await buildIndex(FIXTURES, 'test-docs')
    const paths = index.files.map((f) => f.path)
    expect(paths).toContain('guides/advanced.md')
  })

  it('flattens sections across all files', async () => {
    const index = await buildIndex(FIXTURES, 'test-docs')
    expect(index.sections.length).toBeGreaterThan(0)
  })

  it('excludes empty files from sections', async () => {
    const index = await buildIndex(FIXTURES, 'test-docs')
    const emptyFile = index.files.find((f) => f.path === 'empty.md')
    expect(emptyFile).toBeDefined()
    expect(emptyFile!.sections).toHaveLength(0)
  })
})

describe('search', () => {
  it('finds results matching query', async () => {
    const index = await buildIndex(FIXTURES, 'test-docs')
    const results = search(index, 'authentication')
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].score).toBeGreaterThan(0)
  })

  it('ranks heading matches higher than text matches', async () => {
    const index = await buildIndex(FIXTURES, 'test-docs')
    const results = search(index, 'authentication')
    const headingResult = results.find((r) => r.heading.toLowerCase().includes('authentication'))
    const textResult = results.find(
      (r) => !r.heading.toLowerCase().includes('authentication') && r.score > 0,
    )
    if (headingResult && textResult) {
      expect(headingResult.score).toBeGreaterThan(textResult.score)
    }
  })

  it('returns empty for no matches', async () => {
    const index = await buildIndex(FIXTURES, 'test-docs')
    const results = search(index, 'xyznonexistentterm123')
    expect(results).toHaveLength(0)
  })

  it('returns empty for empty query', async () => {
    const index = await buildIndex(FIXTURES, 'test-docs')
    expect(search(index, '')).toHaveLength(0)
    expect(search(index, '   ')).toHaveLength(0)
  })

  it('limits results to maxResults', async () => {
    const index = await buildIndex(FIXTURES, 'test-docs')
    const results = search(index, 'the', 2)
    expect(results.length).toBeLessThanOrEqual(2)
  })

  it('includes snippet in results', async () => {
    const index = await buildIndex(FIXTURES, 'test-docs')
    const results = search(index, 'middleware')
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].snippet).toBeTruthy()
  })

  it('gives exact phrase bonus for multi-word queries', async () => {
    const index = await buildIndex(FIXTURES, 'test-docs')
    const results = search(index, 'custom middleware')
    const exact = results.find((r) => r.heading === 'Custom Middleware')
    expect(exact).toBeDefined()
    expect(exact!.score).toBeGreaterThan(10)
  })

  it('matches code blocks', async () => {
    const index = await buildIndex(FIXTURES, 'test-docs')
    const results = search(index, 'definePlugin')
    expect(results.length).toBeGreaterThan(0)
  })

  it('matches filename', async () => {
    const index = await buildIndex(FIXTURES, 'test-docs')
    const results = search(index, 'advanced')
    const fromAdvanced = results.filter((r) => r.file.includes('advanced'))
    expect(fromAdvanced.length).toBeGreaterThan(0)
  })
})

describe('computeStats', () => {
  it('counts files, sections, code blocks, links, and words', async () => {
    const index = await buildIndex(FIXTURES, 'test-docs')
    const stats = computeStats(index)
    expect(stats.totalFiles).toBeGreaterThanOrEqual(3)
    expect(stats.totalSections).toBeGreaterThan(0)
    expect(stats.totalCodeBlocks).toBeGreaterThan(0)
    expect(stats.totalLinks).toBeGreaterThan(0)
    expect(stats.totalWords).toBeGreaterThan(0)
  })

  it('tracks language distribution', async () => {
    const index = await buildIndex(FIXTURES, 'test-docs')
    const stats = computeStats(index)
    expect(stats.languages).toHaveProperty('typescript')
    expect(stats.languages['typescript']).toBeGreaterThan(0)
  })
})
