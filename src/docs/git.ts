import { execFile as execFileCb } from 'node:child_process'
import { mkdtemp, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

const execFile = promisify(execFileCb)

export function isGitUrl(source: string): boolean {
  return (
    source.startsWith('https://') ||
    source.startsWith('git://') ||
    source.startsWith('git@') ||
    source.startsWith('ssh://') ||
    (source.startsWith('http://') && source.includes('.git'))
  )
}

export interface GitCloneOptions {
  url: string
  branch?: string
  path?: string
}

export async function cloneRepo(options: GitCloneOptions): Promise<string> {
  const tmpDir = await mkdtemp(join(tmpdir(), 'docs-mcp-'))

  const args = ['clone', '--depth', '1']
  if (options.branch) {
    args.push('--branch', options.branch)
  }
  args.push(options.url, tmpDir)

  try {
    await execFile('git', args, { timeout: 60_000 })
  } catch (err) {
    throw new Error(
      `Failed to clone ${options.url}: ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  const docsDir = options.path ? join(tmpDir, options.path) : tmpDir

  try {
    await access(docsDir)
  } catch {
    throw new Error(`Path "${options.path}" not found in cloned repository`)
  }

  return docsDir
}
