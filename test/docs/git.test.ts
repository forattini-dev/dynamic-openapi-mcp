import { describe, it, expect } from 'vitest'
import { isGitUrl } from '../../src/docs/git.js'

describe('isGitUrl', () => {
  it('detects https URLs', () => {
    expect(isGitUrl('https://github.com/org/repo')).toBe(true)
    expect(isGitUrl('https://gitlab.com/org/repo.git')).toBe(true)
  })

  it('detects git:// URLs', () => {
    expect(isGitUrl('git://github.com/org/repo')).toBe(true)
  })

  it('detects git@ SSH URLs', () => {
    expect(isGitUrl('git@github.com:org/repo.git')).toBe(true)
  })

  it('detects ssh:// URLs', () => {
    expect(isGitUrl('ssh://git@github.com/org/repo')).toBe(true)
  })

  it('detects http URLs with .git', () => {
    expect(isGitUrl('http://example.com/repo.git')).toBe(true)
  })

  it('rejects plain http without .git', () => {
    expect(isGitUrl('http://example.com/repo')).toBe(false)
  })

  it('rejects local paths', () => {
    expect(isGitUrl('./docs')).toBe(false)
    expect(isGitUrl('/home/user/docs')).toBe(false)
    expect(isGitUrl('docs')).toBe(false)
  })

  it('rejects relative paths that look like URLs', () => {
    expect(isGitUrl('file://local/path')).toBe(false)
  })
})
