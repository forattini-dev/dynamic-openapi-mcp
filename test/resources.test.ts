import { describe, it, expect } from 'vitest'
import { resolve } from 'node:path'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { loadSpec } from '../src/parser/loader.js'
import { resolveSpec } from '../src/parser/resolver.js'
import { registerResources } from '../src/mapper/resources.js'

const FIXTURE = resolve(import.meta.dirname, 'fixtures/petstore.yaml')

async function getResourceContent(server: McpServer, resourceName: string): Promise<string> {
  const internals = server as any
  // Resources are keyed by URI, but the name is used to register.
  // We need to find the resource by name across all resources.
  let resource: any = null
  for (const [, res] of Object.entries(internals._registeredResources)) {
    if ((res as any).name === resourceName) {
      resource = res
      break
    }
  }

  if (!resource?.readCallback) {
    throw new Error(`Resource "${resourceName}" not found`)
  }

  const result = await resource.readCallback(new URL('openapi://dummy'))
  return result.contents[0].text
}

describe('registerResources', () => {
  it('registers openapi-spec resource', async () => {
    const doc = await loadSpec(FIXTURE)
    const spec = await resolveSpec(doc)
    const server = new McpServer({ name: 'test', version: '1.0.0' })
    registerResources(server, spec)

    const text = await getResourceContent(server, 'openapi-spec')
    const parsed = JSON.parse(text)
    expect(parsed.info.title).toBe('Petstore')
    expect(parsed.openapi).toBe('3.0.3')
  })

  it('registers individual schema resources', async () => {
    const doc = await loadSpec(FIXTURE)
    const spec = await resolveSpec(doc)
    const server = new McpServer({ name: 'test', version: '1.0.0' })
    registerResources(server, spec)

    const petText = await getResourceContent(server, 'schema-Pet')
    const pet = JSON.parse(petText)
    expect(pet.type).toBe('object')
    expect(pet.properties).toHaveProperty('name')

    const errorText = await getResourceContent(server, 'schema-Error')
    const error = JSON.parse(errorText)
    expect(error.required).toContain('code')
  })

  it('registers openapi-servers resource', async () => {
    const doc = await loadSpec(FIXTURE)
    const spec = await resolveSpec(doc)
    const server = new McpServer({ name: 'test', version: '1.0.0' })
    registerResources(server, spec)

    const text = await getResourceContent(server, 'openapi-servers')
    const servers = JSON.parse(text)
    expect(servers).toHaveLength(3)
    expect(servers[0].url).toBe('https://petstore.example.com/v1')
    expect(servers[0].description).toBe('Production')
    expect(servers[2].variables).toBeDefined()
  })

  it('does not register servers resource when no servers', async () => {
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
    registerResources(server, spec)

    const internals = server as any
    const resources = internals._registeredResources
    const hasServers = Object.values(resources).some((r: any) => r.name === 'openapi-servers')
    expect(hasServers).toBe(false)
  })
})
