import { describe, it, expect, vi, afterEach } from 'vitest'
import { parseArgs, buildFilters } from '../src/cli.js'
import * as pkg from '../src/index.js'

describe('parseArgs', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('parses OpenAPI-mode flags', () => {
    const args = parseArgs([
      'node',
      'cli',
      '-s',
      './spec.yaml',
      '-b',
      'https://api.example.com',
      '--server-index',
      '1',
    ])
    expect(args.source).toBe('./spec.yaml')
    expect(args.baseUrl).toBe('https://api.example.com')
    expect(args.serverIndex).toBe(1)
  })

  it('parses docs-mode flags', () => {
    const args = parseArgs([
      'node',
      'cli',
      '--docs',
      './docs',
      '--path',
      'sub',
      '--branch',
      'main',
      '--name',
      'mydocs',
    ])
    expect(args.docs).toBe('./docs')
    expect(args.docsPath).toBe('sub')
    expect(args.docsBranch).toBe('main')
    expect(args.name).toBe('mydocs')
  })

  it('parses filter flags with CSV + repetition', () => {
    const args = parseArgs([
      'node',
      'cli',
      '--include-tag',
      'pets,store',
      '--exclude-tag',
      'admin',
      '--include-operation',
      'listPets',
      '--exclude-operation',
      'deletePet',
    ])
    expect(args.includeTags).toEqual(['pets', 'store'])
    expect(args.excludeTags).toEqual(['admin'])
    expect(args.includeOperations).toEqual(['listPets'])
    expect(args.excludeOperations).toEqual(['deletePet'])
  })

  it('accepts a positional source when -s is absent', () => {
    const args = parseArgs(['node', 'cli', './spec.yaml'])
    expect(args.source).toBe('./spec.yaml')
  })

  it('exits when --server-index is non-numeric', () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`)
    }) as never)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => parseArgs(['node', 'cli', '--server-index', 'bad'])).toThrow('exit:1')
    exit.mockRestore()
  })

  it('prints help and exits with 0 on --help', () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`)
    }) as never)
    vi.spyOn(console, 'log').mockImplementation(() => {})
    expect(() => parseArgs(['node', 'cli', '--help'])).toThrow('exit:0')
    exit.mockRestore()
  })
})

describe('buildFilters', () => {
  it('returns undefined when no filter flags are set', () => {
    const args = parseArgs(['node', 'cli'])
    expect(buildFilters(args)).toBeUndefined()
  })

  it('builds tag-only and operation-only filters', () => {
    expect(buildFilters(parseArgs(['node', 'cli', '--include-tag', 'pets']))).toEqual({
      tags: { include: ['pets'] },
    })
    expect(buildFilters(parseArgs(['node', 'cli', '--exclude-operation', 'del']))).toEqual({
      operations: { exclude: ['del'] },
    })
  })

  it('combines tag and operation filters', () => {
    expect(
      buildFilters(
        parseArgs([
          'node',
          'cli',
          '--include-tag',
          'pets',
          '--exclude-tag',
          'admin',
          '--include-operation',
          'listPets',
          '--exclude-operation',
          'del',
        ])
      )
    ).toEqual({
      tags: { include: ['pets'], exclude: ['admin'] },
      operations: { include: ['listPets'], exclude: ['del'] },
    })
  })
})

describe('public entry points', () => {
  it('re-exports createOpenApiMcp, createDocsMcp, and helpers', () => {
    expect(typeof pkg.createOpenApiMcp).toBe('function')
    expect(typeof pkg.createDocsMcp).toBe('function')
    expect(typeof pkg.filterOperations).toBe('function')
    expect(typeof pkg.buildIndex).toBe('function')
    expect(typeof pkg.search).toBe('function')
    expect(typeof pkg.computeStats).toBe('function')
  })
})
