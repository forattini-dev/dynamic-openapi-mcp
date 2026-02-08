<div align="center">

# dynamic-openapi-mcp

### Any OpenAPI spec. Instant AI tools.

Point it at a spec — your AI agent can call the API.
<br>
**OpenAPI v3** • **JSON & YAML** • **Auto-auth** • **Zero config**
<br>
Every endpoint becomes a tool. Every schema becomes a resource.

[![npm version](https://img.shields.io/npm/v/dynamic-openapi-mcp.svg?style=flat-square&color=F5A623)](https://www.npmjs.com/package/dynamic-openapi-mcp)
[![npm downloads](https://img.shields.io/npm/dm/dynamic-openapi-mcp.svg?style=flat-square&color=34C759)](https://www.npmjs.com/package/dynamic-openapi-mcp)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![License](https://img.shields.io/npm/l/dynamic-openapi-mcp.svg?style=flat-square&color=007AFF)](https://github.com/forattini-dev/dynamic-openapi-mcp/blob/main/LICENSE)

[Quick Start](#quick-start) · [Agent Setup](#setup-with-ai-agents) · [Auth](#authentication) · [Programmatic API](#programmatic-usage) · [CLI](#cli-reference)

</div>

---

## Quick Start

```bash
npx dynamic-openapi-mcp -s https://petstore3.swagger.io/api/v3/openapi.json
```

That's it. The MCP server starts, your AI agent discovers all the tools, and can call the Petstore API.

For Claude Code, add it in one command:

```bash
claude mcp add petstore -- npx dynamic-openapi-mcp -s https://petstore3.swagger.io/api/v3/openapi.json
```

Now ask Claude: *"list all available pets"* — it will call `listPets` and return real data.

---

## Table of Contents

- [Quick Start](#quick-start)
- [What's Inside](#whats-inside)
- [Setup with AI Agents](#setup-with-ai-agents)
  - [Claude Code](#claude-code)
  - [Cursor](#cursor)
  - [Windsurf](#windsurf)
  - [Claude Desktop](#claude-desktop)
  - [Multiple APIs](#multiple-apis)
- [Authentication](#authentication)
  - [Environment Variables](#via-environment-variables)
  - [Supported Schemes](#supported-schemes)
- [Programmatic Usage](#programmatic-usage)
  - [Custom Base URL](#custom-base-url)
  - [Inline Spec](#from-an-inline-spec)
  - [Inspecting the Spec](#inspecting-the-parsed-spec)
- [CLI Reference](#cli-reference)
- [How the Mapping Works](#how-the-mapping-works)
  - [Operations → Tools](#operations--tools)
  - [Schemas → Resources](#schemas--resources)
  - [Prompts](#prompts)
- [License](#license)

---

## What's Inside

| Category | What you get |
|:---------|:-------------|
| **Tools** | One per operation — `GET /pets` becomes `listPets`, with fully typed inputs |
| **Resources** | Full spec as `openapi://spec` + each schema as `openapi://schemas/{name}` |
| **Prompts** | `describe-api` for an overview, `explore-endpoint` for details on any operation |
| **Auth** | Bearer, API Key (header/query/cookie), Basic, OAuth2 client credentials |
| **Sources** | URL, local file (JSON/YAML), inline string, or JavaScript object |

The flow is simple: AI calls a tool → `dynamic-openapi-mcp` makes the real HTTP request → response comes back as MCP content.

## Setup with AI Agents

### Claude Code

Add to your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "my-api": {
      "command": "npx",
      "args": ["dynamic-openapi-mcp", "-s", "https://api.example.com/openapi.json"],
      "env": {
        "OPENAPI_AUTH_TOKEN": "your-bearer-token"
      }
    }
  }
}
```

Or add via CLI:

```bash
claude mcp add my-api -- npx dynamic-openapi-mcp -s https://api.example.com/openapi.json
```

### Cursor

Go to **Settings → MCP** and add a new server, or add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "my-api": {
      "command": "npx",
      "args": ["dynamic-openapi-mcp", "-s", "./specs/api.yaml"],
      "env": {
        "OPENAPI_API_KEY": "your-api-key"
      }
    }
  }
}
```

### Windsurf

Add to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "my-api": {
      "command": "npx",
      "args": ["dynamic-openapi-mcp", "-s", "https://api.example.com/openapi.json"],
      "env": {
        "OPENAPI_AUTH_TOKEN": "sk-..."
      }
    }
  }
}
```

### Claude Desktop

Add to your config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "my-api": {
      "command": "npx",
      "args": ["dynamic-openapi-mcp", "-s", "/absolute/path/to/spec.yaml"],
      "env": {
        "OPENAPI_AUTH_TOKEN": "your-token"
      }
    }
  }
}
```

### Multiple APIs

Connect several APIs at once — each runs as a separate MCP server, and the AI sees all their tools combined:

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["dynamic-openapi-mcp", "-s", "https://raw.githubusercontent.com/github/rest-api-description/main/descriptions/api.github.com/api.github.com.json"],
      "env": { "OPENAPI_AUTH_TOKEN": "ghp_..." }
    },
    "stripe": {
      "command": "npx",
      "args": ["dynamic-openapi-mcp", "-s", "./specs/stripe.yaml"],
      "env": { "OPENAPI_AUTH_TOKEN": "sk_..." }
    },
    "internal-api": {
      "command": "npx",
      "args": ["dynamic-openapi-mcp", "-s", "https://internal.company.com/api/v1/openapi.json"],
      "env": { "OPENAPI_API_KEY": "key-..." }
    }
  }
}
```

## Authentication

### Via environment variables

```bash
# Bearer token (most common)
OPENAPI_AUTH_TOKEN=sk-123 npx dynamic-openapi-mcp -s ./spec.yaml

# API key
OPENAPI_API_KEY=key-456 npx dynamic-openapi-mcp -s ./spec.yaml

# Per-scheme (matches securitySchemes names in your spec)
OPENAPI_AUTH_BEARERAUTH_TOKEN=sk-123 npx dynamic-openapi-mcp -s ./spec.yaml
```

Or set them in the MCP config `env` block — same effect, cleaner setup.

### Supported schemes

| Scheme | Env var | Programmatic config |
|:-------|:--------|:--------------------|
| Bearer | `OPENAPI_AUTH_TOKEN` | `auth.bearerToken` |
| API Key (header/query/cookie) | `OPENAPI_API_KEY` | `auth.apiKey` |
| Basic | `OPENAPI_AUTH_TOKEN` (as `user:pass`) | `auth.basicAuth` |
| OAuth2 (client credentials) | — | `auth.oauth2` |
| Custom | — | `auth.custom` (function) |

Resolution order: programmatic config → per-scheme env var → global env var.

## Programmatic Usage

```bash
pnpm add dynamic-openapi-mcp
```

```typescript
import { createOpenApiMcp } from 'dynamic-openapi-mcp'

const mcp = await createOpenApiMcp({
  source: 'https://petstore3.swagger.io/api/v3/openapi.json',
  auth: { bearerToken: 'my-token' },
})

// Start as MCP server over stdio
await mcp.serve()
```

### Custom base URL

```typescript
const mcp = await createOpenApiMcp({
  source: './spec.yaml',
  baseUrl: 'http://localhost:3000',
  headers: { 'X-Custom-Header': 'value' },
})
```

### From an inline spec

```typescript
const mcp = await createOpenApiMcp({
  source: {
    openapi: '3.0.3',
    info: { title: 'My API', version: '1.0.0' },
    servers: [{ url: 'https://api.example.com' }],
    paths: {
      '/hello': {
        get: {
          operationId: 'sayHello',
          summary: 'Say hello',
          responses: { '200': { description: 'OK' } },
        },
      },
    },
  },
})
```

### Inspecting the parsed spec

```typescript
const mcp = await createOpenApiMcp({ source: './spec.yaml' })

console.log(mcp.spec.title)       // "My API"
console.log(mcp.spec.operations)  // ParsedOperation[]
console.log(mcp.spec.schemas)     // { Pet: {...}, User: {...} }
```

## CLI Reference

```
dynamic-openapi-mcp [options] [source]

Options:
  -s, --source <url|file>   OpenAPI spec URL or file path
  -b, --base-url <url>      Override the base URL from the spec
  -h, --help                Show help
```

| Environment Variable | Description |
|:---------------------|:------------|
| `OPENAPI_SOURCE` | Spec URL or file path (alternative to `-s`) |
| `OPENAPI_BASE_URL` | Override base URL |
| `OPENAPI_AUTH_TOKEN` | Bearer token for authentication |
| `OPENAPI_API_KEY` | API key for authentication |

## How the Mapping Works

### Operations → Tools

Each operation in the spec becomes one MCP tool:

| OpenAPI | MCP Tool |
|:--------|:---------|
| `operationId: listPets` | Tool name: `listPets` |
| `GET /pets/{petId}` (no operationId) | Tool name: `get_pets_by_petId` |
| `summary` or `description` | Tool description (truncated to 200 chars) |
| Path + query + header params | Top-level input properties |
| Request body | Input property under `body` key |

### Schemas → Resources

| OpenAPI | MCP Resource URI |
|:--------|:-----------------|
| Full dereferenced spec | `openapi://spec` |
| `components.schemas.Pet` | `openapi://schemas/Pet` |
| `components.schemas.User` | `openapi://schemas/User` |

### Prompts

| Prompt | Args | What it returns |
|:-------|:-----|:----------------|
| `describe-api` | — | Overview with title, version, all endpoints, auth schemes, schemas |
| `explore-endpoint` | `operationId` | Full details: parameters, request body schema, responses, security |

## License

MIT
