import { describe, it, expect } from 'vitest'
import { resolve } from 'node:path'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { loadSpec } from '../src/parser/loader.js'
import { resolveSpec } from '../src/parser/resolver.js'
import { registerPrompts } from '../src/mapper/prompts.js'
import type { ParsedSpec } from '../src/parser/types.js'
import type { HttpClientConfig } from '../src/http/client.js'

const FIXTURE = resolve(import.meta.dirname, 'fixtures/petstore.yaml')

async function getPromptText(
  spec: ParsedSpec,
  httpConfig: HttpClientConfig,
  promptName: string,
  args: Record<string, string> = {}
): Promise<string> {
  // We'll build the prompt output by calling registerPrompts and extracting
  // the callback. Since McpServer doesn't expose prompts easily, we'll
  // test the formatting by checking the spec data structures that feed the prompts.
  // For full integration, we register and use the server internals.
  const server = new McpServer({ name: 'test', version: '1.0.0' })
  registerPrompts(server, spec, httpConfig)

  // Access internal prompt handlers via the server's internal map
  // McpServer stores prompts in _registeredPrompts
  const internals = server as any
  const prompt = internals._registeredPrompts[promptName]

  if (!prompt?.callback) {
    throw new Error(`Prompt "${promptName}" not found`)
  }

  const result = await prompt.callback(args)
  return result.messages[0].content.text
}

describe('describe-api prompt', () => {
  it('shows servers with active marker', async () => {
    const doc = await loadSpec(FIXTURE)
    const spec = await resolveSpec(doc)
    const httpConfig: HttpClientConfig = { baseUrl: 'https://petstore.example.com/v1', auth: null }

    const text = await getPromptText(spec, httpConfig, 'describe-api')

    expect(text).toContain('## Servers')
    expect(text).toContain('[active]')
    expect(text).toContain('Production')
    expect(text).toContain('Sandbox')
    expect(text).toContain('Custom environment')
    expect(text).toContain('set_environment')
  })

  it('shows server variables', async () => {
    const doc = await loadSpec(FIXTURE)
    const spec = await resolveSpec(doc)
    const httpConfig: HttpClientConfig = { baseUrl: 'https://petstore.example.com/v1', auth: null }

    const text = await getPromptText(spec, httpConfig, 'describe-api')

    expect(text).toContain('{environment}')
    expect(text).toContain('dev,staging,prod')
    expect(text).toContain('Target environment')
  })

  it('shows global tags with descriptions', async () => {
    const doc = await loadSpec(FIXTURE)
    const spec = await resolveSpec(doc)
    const httpConfig: HttpClientConfig = { baseUrl: 'https://petstore.example.com/v1', auth: null }

    const text = await getPromptText(spec, httpConfig, 'describe-api')

    expect(text).toContain('## Tags')
    expect(text).toContain('**pets**')
    expect(text).toContain('Everything about your Pets')
    expect(text).toContain('**store**')
    expect(text).toContain('Access to Petstore orders')
  })

  it('shows external docs', async () => {
    const doc = await loadSpec(FIXTURE)
    const spec = await resolveSpec(doc)
    const httpConfig: HttpClientConfig = { baseUrl: 'https://petstore.example.com/v1', auth: null }

    const text = await getPromptText(spec, httpConfig, 'describe-api')

    expect(text).toContain('## External Documentation')
    expect(text).toContain('https://docs.petstore.example.com')
    expect(text).toContain('Full Petstore documentation')
  })

  it('shows tag externalDocs links', async () => {
    const doc = await loadSpec(FIXTURE)
    const spec = await resolveSpec(doc)
    const httpConfig: HttpClientConfig = { baseUrl: 'https://petstore.example.com/v1', auth: null }

    const text = await getPromptText(spec, httpConfig, 'describe-api')

    expect(text).toContain('docs: https://docs.petstore.example.com/pets')
  })

  it('shows all endpoints', async () => {
    const doc = await loadSpec(FIXTURE)
    const spec = await resolveSpec(doc)
    const httpConfig: HttpClientConfig = { baseUrl: 'https://petstore.example.com/v1', auth: null }

    const text = await getPromptText(spec, httpConfig, 'describe-api')

    expect(text).toContain('## Endpoints (5)')
    expect(text).toContain('List all pets')
    expect(text).toContain('[DEPRECATED]')
  })

  it('shows auth schemes', async () => {
    const doc = await loadSpec(FIXTURE)
    const spec = await resolveSpec(doc)
    const httpConfig: HttpClientConfig = { baseUrl: 'https://petstore.example.com/v1', auth: null }

    const text = await getPromptText(spec, httpConfig, 'describe-api')

    expect(text).toContain('## Authentication')
    expect(text).toContain('bearerAuth')
  })

  it('handles no servers gracefully', async () => {
    const spec: ParsedSpec = {
      title: 'Test',
      version: '1.0.0',
      servers: [],
      operations: [],
      schemas: {},
      securitySchemes: {},
      tags: [],
      raw: { openapi: '3.0.3', info: { title: 'Test', version: '1.0.0' }, paths: {} },
    }
    const httpConfig: HttpClientConfig = { baseUrl: 'https://custom.com', auth: null }

    const text = await getPromptText(spec, httpConfig, 'describe-api')
    expect(text).toContain('(not specified)')
  })
})

describe('explore-endpoint prompt', () => {
  it('shows operation details', async () => {
    const doc = await loadSpec(FIXTURE)
    const spec = await resolveSpec(doc)
    const httpConfig: HttpClientConfig = { baseUrl: 'https://petstore.example.com/v1', auth: null }

    const text = await getPromptText(spec, httpConfig, 'explore-endpoint', { operationId: 'getPetById' })

    expect(text).toContain('# GET /pets/{petId}')
    expect(text).toContain('operationId: getPetById')
    expect(text).toContain('Get a pet by ID')
  })

  it('shows operation externalDocs', async () => {
    const doc = await loadSpec(FIXTURE)
    const spec = await resolveSpec(doc)
    const httpConfig: HttpClientConfig = { baseUrl: 'https://petstore.example.com/v1', auth: null }

    const text = await getPromptText(spec, httpConfig, 'explore-endpoint', { operationId: 'getPetById' })

    expect(text).toContain('## External Documentation')
    expect(text).toContain('https://docs.petstore.example.com/pets/get')
    expect(text).toContain('Detailed get pet docs')
  })

  it('shows tag descriptions from global tags', async () => {
    const doc = await loadSpec(FIXTURE)
    const spec = await resolveSpec(doc)
    const httpConfig: HttpClientConfig = { baseUrl: 'https://petstore.example.com/v1', auth: null }

    const text = await getPromptText(spec, httpConfig, 'explore-endpoint', { operationId: 'listPets' })

    expect(text).toContain('## Tags')
    expect(text).toContain('**pets**')
    expect(text).toContain('Everything about your Pets')
  })

  it('shows deprecated marker', async () => {
    const doc = await loadSpec(FIXTURE)
    const spec = await resolveSpec(doc)
    const httpConfig: HttpClientConfig = { baseUrl: 'https://petstore.example.com/v1', auth: null }

    const text = await getPromptText(spec, httpConfig, 'explore-endpoint', { operationId: 'deletePet' })

    expect(text).toContain('[DEPRECATED]')
  })

  it('shows parameters with details', async () => {
    const doc = await loadSpec(FIXTURE)
    const spec = await resolveSpec(doc)
    const httpConfig: HttpClientConfig = { baseUrl: 'https://petstore.example.com/v1', auth: null }

    const text = await getPromptText(spec, httpConfig, 'explore-endpoint', { operationId: 'listPets' })

    expect(text).toContain('limit (query, optional)')
    expect(text).toContain('format: int32')
    expect(text).toContain('example: 10')
    expect(text).toContain('offset')
    expect(text).toContain('[DEPRECATED]')
  })

  it('shows request body with example', async () => {
    const doc = await loadSpec(FIXTURE)
    const spec = await resolveSpec(doc)
    const httpConfig: HttpClientConfig = { baseUrl: 'https://petstore.example.com/v1', auth: null }

    const text = await getPromptText(spec, httpConfig, 'explore-endpoint', { operationId: 'createPet' })

    expect(text).toContain('## Request Body (required)')
    expect(text).toContain('**Example:**')
    expect(text).toContain('Buddy')
  })

  it('shows response schemas and links', async () => {
    const doc = await loadSpec(FIXTURE)
    const spec = await resolveSpec(doc)
    const httpConfig: HttpClientConfig = { baseUrl: 'https://petstore.example.com/v1', auth: null }

    const text = await getPromptText(spec, httpConfig, 'explore-endpoint', { operationId: 'createPet' })

    expect(text).toContain('## Responses')
    expect(text).toContain('201')
    expect(text).toContain('## Links')
    expect(text).toContain('getPetById')
  })

  it('returns error for unknown operationId', async () => {
    const doc = await loadSpec(FIXTURE)
    const spec = await resolveSpec(doc)
    const httpConfig: HttpClientConfig = { baseUrl: 'https://petstore.example.com/v1', auth: null }

    const text = await getPromptText(spec, httpConfig, 'explore-endpoint', { operationId: 'nonexistent' })

    expect(text).toContain('not found')
    expect(text).toContain('listPets')
  })

  it('shows security requirements', async () => {
    const doc = await loadSpec(FIXTURE)
    const spec = await resolveSpec(doc)
    const httpConfig: HttpClientConfig = { baseUrl: 'https://petstore.example.com/v1', auth: null }

    const text = await getPromptText(spec, httpConfig, 'explore-endpoint', { operationId: 'listPets' })

    expect(text).toContain('## Security')
    expect(text).toContain('bearerAuth')
  })
})
