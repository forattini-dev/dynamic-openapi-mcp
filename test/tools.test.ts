import { describe, it, expect } from 'vitest'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { resolve } from 'node:path'
import { loadSpec, resolveSpec } from 'dynamic-openapi-tools/parser'
import { registerTools } from '../src/mapper/tools.js'
import type { HttpClientConfig } from '../src/http/client.js'

const FIXTURE = resolve(import.meta.dirname, 'fixtures/petstore.yaml')

async function callTool(server: McpServer, toolName: string, args: Record<string, unknown> = {}): Promise<string> {
  const internals = server as any
  const tool = internals._registeredTools[toolName]

  if (!tool?.handler) {
    throw new Error(`Tool "${toolName}" not found`)
  }

  const result = await tool.handler(args, {} as any)
  return result.content[0].text
}

describe('set_environment tool', () => {
  it('lists servers when called without args', async () => {
    const doc = await loadSpec(FIXTURE)
    const spec = await resolveSpec(doc)
    const server = new McpServer({ name: 'test', version: '1.0.0' })
    const httpConfig: HttpClientConfig = { baseUrl: 'https://petstore.example.com/v1', auth: null }
    registerTools(server, spec, httpConfig)

    const text = await callTool(server, 'set_environment')

    expect(text).toContain('Current active server: https://petstore.example.com/v1')
    expect(text).toContain('Available servers:')
    expect(text).toContain('[0]')
    expect(text).toContain('[1]')
    expect(text).toContain('[2]')
    expect(text).toContain('Production')
    expect(text).toContain('Sandbox')
    expect(text).toContain('[active]')
  })

  it('switches server by index', async () => {
    const doc = await loadSpec(FIXTURE)
    const spec = await resolveSpec(doc)
    const server = new McpServer({ name: 'test', version: '1.0.0' })
    const httpConfig: HttpClientConfig = { baseUrl: 'https://petstore.example.com/v1', auth: null }
    registerTools(server, spec, httpConfig)

    const text = await callTool(server, 'set_environment', { server_index: 1 })

    expect(text).toContain('Active server set to: https://sandbox.petstore.example.com/v1')
    expect(httpConfig.baseUrl).toBe('https://sandbox.petstore.example.com/v1')
  })

  it('switches server by direct URL', async () => {
    const doc = await loadSpec(FIXTURE)
    const spec = await resolveSpec(doc)
    const server = new McpServer({ name: 'test', version: '1.0.0' })
    const httpConfig: HttpClientConfig = { baseUrl: 'https://petstore.example.com/v1', auth: null }
    registerTools(server, spec, httpConfig)

    const text = await callTool(server, 'set_environment', { server_url: 'https://custom.api.com/v2/' })

    expect(text).toContain('Active server set to: https://custom.api.com/v2')
    expect(httpConfig.baseUrl).toBe('https://custom.api.com/v2')
  })

  it('resolves server variables with overrides', async () => {
    const doc = await loadSpec(FIXTURE)
    const spec = await resolveSpec(doc)
    const server = new McpServer({ name: 'test', version: '1.0.0' })
    const httpConfig: HttpClientConfig = { baseUrl: 'https://petstore.example.com/v1', auth: null }
    registerTools(server, spec, httpConfig)

    const text = await callTool(server, 'set_environment', {
      server_index: 2,
      variables: { environment: 'staging', version: 'v2' },
    })

    expect(text).toContain('Active server set to: https://staging.petstore.example.com/v2')
    expect(httpConfig.baseUrl).toBe('https://staging.petstore.example.com/v2')
  })

  it('returns error for invalid server_index', async () => {
    const doc = await loadSpec(FIXTURE)
    const spec = await resolveSpec(doc)
    const server = new McpServer({ name: 'test', version: '1.0.0' })
    const httpConfig: HttpClientConfig = { baseUrl: 'https://petstore.example.com/v1', auth: null }
    registerTools(server, spec, httpConfig)

    const text = await callTool(server, 'set_environment', { server_index: 99 })

    expect(text).toContain('Invalid server_index 99')
    expect(httpConfig.baseUrl).toBe('https://petstore.example.com/v1')
  })

  it('re-resolves current server with new variables', async () => {
    const doc = await loadSpec(FIXTURE)
    const spec = await resolveSpec(doc)
    const server = new McpServer({ name: 'test', version: '1.0.0' })
    const httpConfig: HttpClientConfig = { baseUrl: 'https://prod.petstore.example.com/v1', auth: null }
    registerTools(server, spec, httpConfig)

    const text = await callTool(server, 'set_environment', {
      variables: { environment: 'dev' },
    })

    expect(text).toContain('re-resolved')
    expect(httpConfig.baseUrl).toBe('https://dev.petstore.example.com/v1')
  })

  it('returns error when variables cannot match current server', async () => {
    const doc = await loadSpec(FIXTURE)
    const spec = await resolveSpec(doc)
    const server = new McpServer({ name: 'test', version: '1.0.0' })
    const httpConfig: HttpClientConfig = { baseUrl: 'https://unknown.server.com', auth: null }
    registerTools(server, spec, httpConfig)

    const text = await callTool(server, 'set_environment', {
      variables: { environment: 'staging' },
    })

    expect(text).toContain('Cannot apply variables')
  })

  it('shows server variable details in listing', async () => {
    const doc = await loadSpec(FIXTURE)
    const spec = await resolveSpec(doc)
    const server = new McpServer({ name: 'test', version: '1.0.0' })
    const httpConfig: HttpClientConfig = { baseUrl: 'https://petstore.example.com/v1', auth: null }
    registerTools(server, spec, httpConfig)

    const text = await callTool(server, 'set_environment')

    expect(text).toContain('{environment}')
    expect(text).toContain('enum=[dev,staging,prod]')
    expect(text).toContain('Target environment')
  })

  it('does not register set_environment when no servers', async () => {
    const spec = {
      title: 'Empty',
      version: '1.0.0',
      servers: [],
      operations: [],
      schemas: {},
      securitySchemes: {},
      tags: [],
      raw: { openapi: '3.0.3', info: { title: 'Empty', version: '1.0.0' }, paths: {} } as any,
    }
    const server = new McpServer({ name: 'test', version: '1.0.0' })
    const httpConfig: HttpClientConfig = { baseUrl: 'https://custom.com', auth: null }
    registerTools(server, spec, httpConfig)

    const internals = server as any
    expect(internals._registeredTools['set_environment']).toBeUndefined()
  })
})
