import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ParsedSpec } from '../parser/types.js'

export function registerResources(server: McpServer, spec: ParsedSpec): void {
  server.resource(
    'openapi-spec',
    'openapi://spec',
    {
      description: `Full OpenAPI spec for ${spec.title} v${spec.version}`,
      mimeType: 'application/json',
    },
    async () => ({
      contents: [
        {
          uri: 'openapi://spec',
          mimeType: 'application/json',
          text: JSON.stringify(spec.raw, null, 2),
        },
      ],
    })
  )

  for (const [name, schema] of Object.entries(spec.schemas)) {
    const safeName = encodeURIComponent(name)
    const uri = `openapi://schemas/${safeName}`

    server.resource(
      `schema-${safeName}`,
      uri,
      {
        description: (schema.description ?? `Schema: ${name}`).slice(0, 200),
        mimeType: 'application/json',
      },
      async () => ({
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(schema, null, 2),
          },
        ],
      })
    )
  }

  if (spec.servers.length > 0) {
    server.resource(
      'openapi-servers',
      'openapi://servers',
      {
        description: `Available API servers/environments for ${spec.title}`,
        mimeType: 'application/json',
      },
      async () => ({
        contents: [
          {
            uri: 'openapi://servers',
            mimeType: 'application/json',
            text: JSON.stringify(spec.servers, null, 2),
          },
        ],
      })
    )
  }
}
