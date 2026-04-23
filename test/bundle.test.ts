import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFile, mkdtemp, rm, stat } from 'node:fs/promises'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path, { join } from 'node:path'
import { buildBundle, runBundle } from '../src/cli/bundle.js'

const FIXTURE = path.join(import.meta.dirname, 'fixtures', 'petstore.yaml')

describe('buildBundle', () => {
  it('writes an executable bash shim with the embedded spec', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'mcp-bundle-'))
    try {
      const out = path.join(dir, 'my-mcp')
      await buildBundle({
        source: FIXTURE,
        name: 'my-mcp',
        out,
        appVersion: '2.3.4',
      })

      const content = await readFile(out, 'utf-8')
      expect(content.startsWith('#!/usr/bin/env bash\n')).toBe(true)
      expect(content).toMatch(/MCP_NAME='my-mcp'/)
      expect(content).toMatch(/MCP_VERSION='2.3.4'/)
      expect(content).toMatch(/SPEC_B64='[A-Za-z0-9+/=]+'/)
      expect(content).toMatch(/SPEC_MD5='[0-9a-f]{32}'/)
      expect(content).toMatch(/--show-spec/)
      expect(content).toMatch(/--spec-md5/)
      expect(content).toMatch(/\bupdate\b/)
      expect(content).toMatch(/"\$\{1:-\}" == "install"/)
      expect(content).toMatch(/"\$\{1:-\}" == "uninstall"/)
      expect(content).toMatch(/_default_install_dir/)
      expect(content).toMatch(/npx --yes dynamic-openapi-mcp/)
      expect(content).toMatch(/--source "\$SPEC_FILE"/)

      const stats = await stat(out)
      expect(stats.mode & 0o111).toBeGreaterThan(0)

      const b64Match = content.match(/SPEC_B64='([^']+)'/)
      expect(b64Match).not.toBeNull()
      const decoded = Buffer.from(b64Match![1]!, 'base64').toString('utf-8')
      const spec = JSON.parse(decoded) as { info: { title: string; version: string } }
      expect(spec.info.title).toBe('Petstore')
      expect(spec.info.version).toBe('1.0.0')

      const md5Match = content.match(/SPEC_MD5='([0-9a-f]{32})'/)
      expect(md5Match).not.toBeNull()
      const { createHash } = await import('node:crypto')
      const expectedMd5 = createHash('md5').update(decoded).digest('hex')
      expect(md5Match![1]).toBe(expectedMd5)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('records the absolute file path for local sources so update can re-fetch', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'mcp-bundle-'))
    try {
      const out = path.join(dir, 'local-mcp')
      await buildBundle({
        source: FIXTURE,
        name: 'local-mcp',
        out,
      })

      const content = await readFile(out, 'utf-8')
      expect(content).toMatch(/SPEC_SOURCE_KIND='file'/)
      expect(content).toContain(`SPEC_SOURCE='${path.resolve(FIXTURE)}'`)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('marks inline-spec bundles with an empty SPEC_SOURCE so update fails loud', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'mcp-bundle-'))
    try {
      const out = path.join(dir, 'inline-mcp')
      const specText = await readFile(FIXTURE, 'utf-8')
      await buildBundle({
        source: specText,
        name: 'inline-mcp',
        out,
      })

      const content = await readFile(out, 'utf-8')
      expect(content).toMatch(/SPEC_SOURCE_KIND='inline'/)
      expect(content).toContain(`SPEC_SOURCE=''`)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('escapes single quotes in name and description', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'mcp-bundle-'))
    try {
      const out = path.join(dir, 'tricky')
      await buildBundle({
        source: FIXTURE,
        name: "dangerous'name",
        out,
        description: "it's tricky",
      })

      const content = await readFile(out, 'utf-8')
      expect(content).toMatch(/MCP_NAME='dangerous'\\''name'/)
      expect(content).toMatch(/MCP_DESCRIPTION='it'\\''s tricky'/)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('defaults version and description from the spec', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'mcp-bundle-'))
    try {
      const out = path.join(dir, 'defaults-mcp')
      await buildBundle({ source: FIXTURE, name: 'defaults-mcp', out })
      const content = await readFile(out, 'utf-8')
      expect(content).toMatch(/MCP_VERSION='1.0.0'/)
      expect(content).toMatch(/MCP_DESCRIPTION='Petstore'/)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe('runBundle', () => {
  let tmp: string

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'mcp-run-bundle-'))
  })

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('prints help when invoked with no args or --help', async () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation((() => true) as never)
    await runBundle([])
    expect(stdout.mock.calls.map((c) => String(c[0])).join('')).toContain('package an OpenAPI spec')

    stdout.mockClear()
    await runBundle(['-h'])
    expect(stdout).toHaveBeenCalled()

    stdout.mockClear()
    await runBundle(['--help'])
    expect(stdout).toHaveBeenCalled()
  })

  it('exits 2 when required args are missing', async () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`)
    }) as never)
    vi.spyOn(process.stderr, 'write').mockImplementation((() => true) as never)
    await expect(runBundle(['--out', 'x'])).rejects.toThrow('exit:2')
    exit.mockRestore()
  })

  it('writes a shim when given valid args', async () => {
    const out = join(tmp, 'mymcp')
    vi.spyOn(process.stderr, 'write').mockImplementation((() => true) as never)
    await runBundle(['--source', FIXTURE, '--name', 'mymcp', '--out', out])
    expect(existsSync(out)).toBe(true)
  })

  it('accepts --flag=value form', async () => {
    const out = join(tmp, 'inline-flags')
    vi.spyOn(process.stderr, 'write').mockImplementation((() => true) as never)
    await runBundle([
      `--source=${FIXTURE}`,
      '--name=inline-flags',
      `--out=${out}`,
      '--app-version=9.9.9',
    ])
    const content = await readFile(out, 'utf-8')
    expect(content).toMatch(/MCP_VERSION='9.9.9'/)
  })

  it('exits 1 when buildBundle throws', async () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`)
    }) as never)
    vi.spyOn(process.stderr, 'write').mockImplementation((() => true) as never)
    await expect(
      runBundle(['--source', '/does/not/exist.yaml', '--name', 'x', '--out', join(tmp, 'out')])
    ).rejects.toThrow('exit:1')
    exit.mockRestore()
  })
})
