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

[Quick Start](#quick-start) · [The family](#the-family) · [Agent Setup](#setup-with-ai-agents) · [Auth](#authentication) · [Filtering](#filtering-operations) · [Programmatic API](#programmatic-usage) · [CLI](#cli-reference)

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
- [The family](#the-family)
- [Setup with AI Agents](#setup-with-ai-agents)
  - [Claude Code](#claude-code)
  - [Cursor](#cursor)
  - [Windsurf](#windsurf)
  - [Claude Desktop](#claude-desktop)
  - [Multiple APIs](#multiple-apis)
- [Authentication](#authentication)
  - [Choosing an Auth Strategy](#choosing-an-auth-strategy)
  - [Environment Variables](#via-environment-variables)
  - [Supported Schemes](#supported-schemes)
  - [Programmatic Examples](#programmatic-examples)
  - [Temporary Tokens and Refresh](#temporary-tokens-and-refresh)
  - [How Auth Is Usually Modeled in OpenAPI](#how-auth-is-usually-modeled-in-openapi)
  - [Troubleshooting Auth](#troubleshooting-auth)
- [Filtering operations](#filtering-operations)
- [Programmatic Usage](#programmatic-usage)
  - [Custom Base URL](#custom-base-url)
  - [Inline Spec](#from-an-inline-spec)
  - [Inspecting the Spec](#inspecting-the-parsed-spec)
  - [Retry Behavior](#retry-behavior)
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
| **Auth** | Bearer, API Key (header/query/cookie), Basic, OAuth2 client credentials, token exchange |
| **Bodies** | JSON, form-urlencoded, multipart/form-data, and octet-stream request bodies |
| **Sources** | URL, local file (JSON/YAML), inline string, or JavaScript object |

The flow is simple: AI calls a tool → `dynamic-openapi-mcp` makes the real HTTP request → response comes back as MCP content.

## The family

Three complementary projects, one spec, three output surfaces — pick the one that fits the use case:

| Sibling | Output | Runs when | Best when |
|:--------|:-------|:----------|:----------|
| [`dynamic-openapi-mcp`](#) | **Live MCP server (stdio)** | Every tool call spins the server | You want real-time introspection, auto-refreshed OAuth tokens, typed tool I/O |
| [`dynamic-openapi-cli`](https://github.com/forattini-dev/dynamic-openapi-cli) | Bash CLI (optionally bundled) | Humans and scripts invoke it | You want a commit-friendly shim humans and CI can run |
| [`dynamic-openapi-skill`](https://github.com/forattini-dev/dynamic-openapi-skill) | Static `SKILL.md` | Claude loads it on demand | You want zero runtime, diff-friendly docs, and model-driven calls via `curl` / `fetch` |

> All three share the same parser and auth layer. Switching between them is a matter of pointing them at the same spec.

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

### Choosing an Auth Strategy

| If your API uses... | Use this | Auto-refresh | Best for |
|:--------------------|:---------|:-------------|:---------|
| Static bearer token | `OPENAPI_AUTH_TOKEN` or `auth.bearerToken` | No | Personal access tokens, fixed service tokens |
| Static API key | `OPENAPI_API_KEY` or `auth.apiKey` | No | Header/query/cookie API keys declared in the spec |
| Basic auth | `auth.basicAuth` | No | Legacy username/password APIs |
| OAuth2 client credentials | `auth.oauth2` | Yes | Machine-to-machine OAuth flows with `tokenUrl` |
| Temporary token exchange | `auth.tokenExchange` | Yes | Non-standard `credId` / `credSecret` login flows |
| Fully custom auth logic | `auth.custom` | You implement it | Edge cases not covered by built-in strategies |

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
| Bearer | `OPENAPI_AUTH_TOKEN` or `OPENAPI_AUTH_<SCHEME>_TOKEN` | `auth.bearerToken` |
| API Key (header/query/cookie) | `OPENAPI_API_KEY` or `OPENAPI_AUTH_<SCHEME>_KEY` | `auth.apiKey` |
| Basic | `OPENAPI_AUTH_<SCHEME>_TOKEN` as `user:pass` | `auth.basicAuth` |
| OAuth2 (client credentials) | — | `auth.oauth2` |
| Token exchange | — | `auth.tokenExchange` |
| Custom | — | `auth.custom` (function) |

Resolution order: programmatic config → per-scheme env var → global env var.

Per-scheme environment variables are derived from the `securitySchemes` name in your OpenAPI document:

```yaml
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
```

This scheme name maps to:

```bash
OPENAPI_AUTH_BEARERAUTH_TOKEN=sk-123
```

For a basic auth scheme named `basicAuth`, use:

```bash
OPENAPI_AUTH_BASICAUTH_TOKEN=username:password
```

### Programmatic Examples

Bearer token:

```typescript
const mcp = await createOpenApiMcp({
  source: './spec.yaml',
  auth: { bearerToken: process.env.MY_API_TOKEN! },
})
```

API key:

```typescript
const mcp = await createOpenApiMcp({
  source: './spec.yaml',
  auth: { apiKey: process.env.MY_API_KEY! },
})
```

Basic auth:

```typescript
const mcp = await createOpenApiMcp({
  source: './spec.yaml',
  auth: {
    basicAuth: {
      username: process.env.API_USER!,
      password: process.env.API_PASSWORD!,
    },
  },
})
```

OAuth2 client credentials with automatic token caching and refresh:

```typescript
const mcp = await createOpenApiMcp({
  source: './spec.yaml',
  auth: {
    oauth2: {
      clientId: process.env.OAUTH_CLIENT_ID!,
      clientSecret: process.env.OAUTH_CLIENT_SECRET!,
      tokenUrl: 'https://auth.example.com/oauth/token',
      scopes: ['pets:read', 'pets:write'],
    },
  },
})
```

`dynamic-openapi-mcp` caches the retrieved access token in memory and refreshes it when it is close to expiration.

### Temporary Tokens and Refresh

Many APIs are not true OAuth2, but still issue a short-lived bearer token after exchanging credentials such as `credId` and `credSecret`.

For these APIs, use `auth.tokenExchange`. The built-in strategy:

1. Exchanges credentials for a temporary token.
2. Caches the token in memory.
3. Refreshes slightly before `expires_in` or `expires_at`.
4. Retries once on `401 Unauthorized` after forcing a fresh token.
5. Reuses a single in-flight refresh promise so concurrent MCP calls do not stampede the auth server.

Example:

```typescript
import { createOpenApiMcp } from 'dynamic-openapi-mcp'

const mcp = await createOpenApiMcp({
  source: './spec.yaml',
  auth: {
    tokenExchange: {
      tokenUrl: 'https://auth.example.com/session',
      request: {
        contentType: 'application/json',
        fields: {
          credId: process.env.CRED_ID!,
          credSecret: process.env.CRED_SECRET!,
        },
      },
      response: {
        tokenField: 'access_token',
        expiresInField: 'expires_in',
      },
      apply: {
        location: 'header',
        name: 'Authorization',
        prefix: 'Bearer ',
      },
    },
  },
})
```

Notes:

- `auth.tokenExchange` also supports form-encoded requests via `request.contentType: 'application/x-www-form-urlencoded'`.
- If the token response is nested, use dot-paths such as `response.tokenField: 'data.accessToken'`.
- If there is no expiry metadata, the token stays cached until the API returns `401`, then a new exchange is attempted once.
- `apply.location` can be `header`, `query`, or `cookie`.
- The token cache is in-memory. If the MCP process restarts, it will fetch a new token on the next request.
- If your auth flow cannot be described declaratively, fall back to `auth.custom`.

Advanced fallback with `auth.custom`:

```typescript
const mcp = await createOpenApiMcp({
  source: './spec.yaml',
  auth: {
    custom: async (_url, init) => {
      const headers = new Headers(init.headers)
      headers.set('Authorization', `Bearer ${await getMyTokenSomehow()}`)
      return { ...init, headers }
    },
  },
})
```

### How Auth Is Usually Modeled in OpenAPI

For protected endpoints, OpenAPI usually describes the final auth mechanism used when calling the API, not the full lifecycle of how a client should fetch and refresh credentials.

Standard bearer auth:

```yaml
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
security:
  - bearerAuth: []
```

API key auth:

```yaml
components:
  securitySchemes:
    apiKeyAuth:
      type: apiKey
      name: X-API-Key
      in: header
security:
  - apiKeyAuth: []
```

OAuth2 client credentials:

```yaml
components:
  securitySchemes:
    oauth:
      type: oauth2
      flows:
        clientCredentials:
          tokenUrl: https://auth.example.com/oauth/token
          scopes:
            pets:read: Read pets
security:
  - oauth: [pets:read]
```

Custom temporary token flows are usually documented in two separate places:

1. The protected endpoints declare `bearerAuth` or `apiKeyAuth` in `securitySchemes`.
2. A normal operation in `paths` documents the login or token-exchange endpoint.

Example:

```yaml
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer

paths:
  /auth/token:
    post:
      summary: Exchange credId and credSecret for a temporary token
      requestBody:
        required: true
      responses:
        '200':
          description: Token issued
```

This pattern is common, but it does not fully tell a generic client:

- which credentials should come from environment variables
- which response field contains the token
- how long the token is valid
- when to refresh it
- whether a `401` should trigger a new exchange

That is why true OAuth2 is easiest to automate from OpenAPI alone, while custom temporary-token systems usually need either explicit `auth.tokenExchange` config or a small amount of user-supplied code.

If you want to document these custom flows more explicitly for users of this library, a future vendor extension could look like this:

```yaml
x-dynamic-openapi-mcp-auth:
  type: tokenExchange
  tokenUrl: https://auth.example.com/session
  request:
    contentType: application/json
    fields:
      credId:
        env: CRED_ID
      credSecret:
        env: CRED_SECRET
  response:
    tokenField: access_token
    expiresInField: expires_in
    tokenType: Bearer
```

This is not used by `dynamic-openapi-mcp` today, but it shows the kind of metadata that would make temporary-token flows much easier to automate.

### Troubleshooting Auth

- If requests return `401 Unauthorized`, first confirm the OpenAPI spec's `securitySchemes` matches how the real API expects auth.
- If you use environment variables, prefer per-scheme variables when the spec defines multiple auth schemes.
- If your token expires every few minutes, use programmatic auth instead of a static env var.
- If your provider gives you a login endpoint that is not OAuth2, start with `auth.tokenExchange`. Use `auth.custom` only when the exchange is too irregular to describe declaratively.
- If the provider requires the temporary token in a query string or cookie, `auth.tokenExchange` supports `apply.location: 'query'` and `apply.location: 'cookie'`.

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

### Retry Behavior

By default, `dynamic-openapi-mcp` retries only safe methods: `GET`, `HEAD`, `OPTIONS`, and `TRACE`.

This keeps reads resilient without risking duplicate writes on `POST`, `PUT`, `PATCH`, or `DELETE`.

If you want different behavior, set `fetchOptions.retryPolicy`:

```typescript
const mcp = await createOpenApiMcp({
  source: './spec.yaml',
  fetchOptions: {
    retries: 2,
    retryPolicy: 'all', // 'safe-only' (default) | 'all' | 'none'
  },
})
```

Notes:

- `retryPolicy: 'safe-only'` is the default.
- `retryPolicy: 'all'` retries mutating requests too.
- `retryPolicy: 'none'` disables request retries entirely.
- Built-in auth token fetches use their own internal retry behavior and are not blocked by the default safe-only policy.

## CLI Reference

```
dynamic-openapi-mcp [options] [source]

Options:
  -s, --source <url|file>        OpenAPI spec URL or file path
  -b, --base-url <url>           Override the base URL from the spec
      --server-index <n>         Select Nth server entry (default: 0)
      --include-tag <name>       Only expose operations with this tag (repeatable, comma-separated)
      --exclude-tag <name>       Hide operations with this tag (repeatable, comma-separated)
      --include-operation <id>   Only expose these operationIds (repeatable, comma-separated)
      --exclude-operation <id>   Hide these operationIds (repeatable, comma-separated)
  -h, --help                     Show help
```

| Environment Variable | Description |
|:---------------------|:------------|
| `OPENAPI_SOURCE` | Spec URL or file path (alternative to `-s`) |
| `OPENAPI_BASE_URL` | Override base URL |
| `OPENAPI_AUTH_TOKEN` | Bearer token for authentication |
| `OPENAPI_API_KEY` | API key for authentication |

## Filtering operations

Not every endpoint needs to reach the AI. Two ways to cut the surface:

### Flags (and programmatic `filters`)

```bash
# only expose the `pets` and `store` tags
dynamic-openapi-mcp -s ./spec.yaml --include-tag pets --include-tag store

# hide admin endpoints and one noisy op
dynamic-openapi-mcp -s ./spec.yaml --exclude-tag admin --exclude-operation debugDump

# allowlist specific operations — tags are ignored for these
dynamic-openapi-mcp -s ./spec.yaml --include-operation listPets,getPetById

# mix-and-match: everything under `pets`, minus one write op
dynamic-openapi-mcp -s ./spec.yaml --include-tag pets --exclude-operation deletePet
```

Programmatic equivalent:

```typescript
const mcp = await createOpenApiMcp({
  source: './spec.yaml',
  filters: {
    tags: { include: ['pets'], exclude: ['admin'] },
    operations: { include: ['healthCheck'], exclude: ['debugDump'] },
  },
})
```

**Precedence** (first match wins): `x-hidden` → `operations.exclude` → `operations.include` → `tags.exclude` → includes as allowlist. `operations.include` escapes a matching `tags.exclude`, but `operations.exclude` wins over everything except `x-hidden`.

### `x-hidden` vendor extension

Let the spec author hide an endpoint from every consumer of this tool — no flags needed:

```yaml
paths:
  /admin/reset:
    post:
      operationId: adminReset
      x-hidden: true       # always removed, regardless of filter flags
```

Good for internal-only endpoints that ship in the public spec but shouldn't be called from AI agents / bundled CLIs / skills.

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

Request bodies preserve the original media type when possible:

- `application/json` is sent as JSON.
- `application/x-www-form-urlencoded` is serialized as `URLSearchParams`.
- `multipart/form-data` is serialized as `FormData`.
- `application/octet-stream` and other binary bodies support `{ dataBase64, filename?, contentType? }`.

Response handling follows the same idea:

- JSON is pretty-printed.
- Images are returned as MCP image content.
- Other binary payloads are returned as binary metadata plus base64 when small enough to inline.

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
