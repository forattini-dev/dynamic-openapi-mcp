import { realpathSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createParser } from 'cli-args-parser'
import type { PrimitiveValue } from 'cli-args-parser'
import { createOpenApiMcp } from './server.js'
import { createDocsMcp } from './docs/server.js'
import { runBundle } from './cli/bundle.js'
import type { OperationFilters } from 'dynamic-openapi-tools/parser'

export interface CliArgs {
  source?: string
  baseUrl?: string
  serverIndex?: number
  docs?: string
  docsPath?: string
  docsBranch?: string
  name?: string
  includeTags: string[]
  excludeTags: string[]
  includeOperations: string[]
  excludeOperations: string[]
}

function buildCliParser() {
  return createParser({
    options: {
      source: { short: 's', type: 'string' },
      'base-url': { short: 'b', type: 'string' },
      'server-index': { type: 'string' },
      docs: { type: 'string' },
      path: { type: 'string' },
      branch: { type: 'string' },
      name: { type: 'string' },
      'include-tag': { type: 'array' },
      'exclude-tag': { type: 'array' },
      'include-operation': { type: 'array' },
      'exclude-operation': { type: 'array' },
      help: { short: 'h', type: 'boolean' },
    },
    positional: [{ name: 'source' }],
  })
}

export function parseArgs(argv: string[]): CliArgs {
  const parser = buildCliParser()
  const result = parser.parse(argv.slice(2))

  if (result.options['help'] === true) {
    printHelp()
    process.exit(0)
  }

  const rawServerIndex = pickString(result.options['server-index'])
  let serverIndex: number | undefined
  if (rawServerIndex !== undefined) {
    const parsed = parseInt(rawServerIndex, 10)
    if (isNaN(parsed) || parsed < 0) {
      console.error(`Error: --server-index must be a non-negative integer, got "${rawServerIndex}"`)
      process.exit(1)
    }
    serverIndex = parsed
  }

  const source =
    pickString(result.options['source']) ?? pickString(result.positional['source'])

  return {
    source,
    baseUrl: pickString(result.options['base-url']),
    serverIndex,
    docs: pickString(result.options['docs']),
    docsPath: pickString(result.options['path']),
    docsBranch: pickString(result.options['branch']),
    name: pickString(result.options['name']),
    includeTags: csvArray(result.options['include-tag']),
    excludeTags: csvArray(result.options['exclude-tag']),
    includeOperations: csvArray(result.options['include-operation']),
    excludeOperations: csvArray(result.options['exclude-operation']),
  }
}

function pickString(value: PrimitiveValue | PrimitiveValue[] | undefined): string | undefined {
  if (value === undefined || value === null) return undefined
  if (Array.isArray(value)) return value.length > 0 ? String(value[0]) : undefined
  if (typeof value === 'boolean') return undefined
  const str = String(value)
  return str.length > 0 ? str : undefined
}

function csvArray(value: PrimitiveValue | PrimitiveValue[] | undefined): string[] {
  if (value === undefined || value === null) return []
  const values = Array.isArray(value) ? value : [value]
  const out: string[] = []
  for (const v of values) {
    for (const piece of String(v).split(',')) {
      const trimmed = piece.trim()
      if (trimmed) out.push(trimmed)
    }
  }
  return out
}

export function buildFilters(args: CliArgs): OperationFilters | undefined {
  const filters: OperationFilters = {}
  if (args.includeTags.length > 0 || args.excludeTags.length > 0) {
    filters.tags = {}
    if (args.includeTags.length > 0) filters.tags.include = args.includeTags
    if (args.excludeTags.length > 0) filters.tags.exclude = args.excludeTags
  }
  if (args.includeOperations.length > 0 || args.excludeOperations.length > 0) {
    filters.operations = {}
    if (args.includeOperations.length > 0) filters.operations.include = args.includeOperations
    if (args.excludeOperations.length > 0) filters.operations.exclude = args.excludeOperations
  }
  return filters.tags || filters.operations ? filters : undefined
}

function printHelp(): void {
  console.log(`
dynamic-openapi-mcp - Transform OpenAPI specs or markdown docs into MCP servers

Usage:
  dynamic-openapi-mcp [options] [source]
  dynamic-openapi-mcp bundle -s <url|file> --name <mcp-name> --out <path>

Subcommands:
  bundle                    Package an OpenAPI spec into a standalone MCP binary
                            (run "dynamic-openapi-mcp bundle --help" for details)

OpenAPI Mode:
  -s, --source <url|file>   OpenAPI spec URL or file path
  -b, --base-url <url>      Override the base URL from the spec
  --server-index <n>         Use the Nth server from the spec (0-based, default: 0)
  --include-tag <name>       Only expose operations with this tag (repeatable, comma-separated)
  --exclude-tag <name>       Hide operations with this tag (repeatable, comma-separated)
  --include-operation <id>   Only expose these operationIds (repeatable, comma-separated)
  --exclude-operation <id>   Hide these operationIds (repeatable, comma-separated)
                             (operations flagged with \`x-hidden: true\` in the spec are always hidden)

Docs Mode:
  --docs <dir|url>           Serve markdown files as MCP tools
  --path <subpath>           Subpath within git repo (used with --docs)
  --branch <branch>          Git branch to clone (used with --docs)
  --name <name>              Custom server name

General:
  -h, --help                Show this help message

Environment Variables:
  OPENAPI_SOURCE            OpenAPI spec URL or file path
  OPENAPI_BASE_URL          Override base URL
  OPENAPI_SERVER_INDEX      Server index (0-based)
  OPENAPI_AUTH_TOKEN        Bearer token for API authentication
  OPENAPI_API_KEY           API key for authentication

Examples:
  # OpenAPI mode
  dynamic-openapi-mcp -s https://petstore3.swagger.io/api/v3/openapi.json
  dynamic-openapi-mcp ./spec.yaml

  # Docs mode
  dynamic-openapi-mcp --docs ./docs
  dynamic-openapi-mcp --docs https://github.com/org/repo
  dynamic-openapi-mcp --docs https://github.com/org/repo --path docs/ --branch main
  dynamic-openapi-mcp --docs ./docs --name my-api-docs
`)
}

async function main(): Promise<void> {
  const rawArgs = process.argv.slice(2)
  if (rawArgs[0] === 'bundle') {
    await runBundle(rawArgs.slice(1))
    return
  }

  const args = parseArgs(process.argv)

  try {
    // Docs mode
    if (args.docs) {
      const mcp = await createDocsMcp({
        source: args.docs,
        name: args.name,
        path: args.docsPath,
        branch: args.docsBranch,
      })

      process.stderr.write(
        `dynamic-openapi-mcp: docs mode — indexed ${mcp.index.files.length} files from "${mcp.index.name}"\n`
      )

      await mcp.serve()
      return
    }

    // OpenAPI mode
    const source = args.source ?? process.env['OPENAPI_SOURCE'] ?? process.env['OPENAPI_SOURCE_FILE']

    if (!source) {
      console.error('Error: No OpenAPI source or docs directory specified.')
      console.error('Use -s <url|file> for OpenAPI, --docs <dir|url> for docs mode, or set OPENAPI_SOURCE.')
      console.error('Run dynamic-openapi-mcp --help for usage information.')
      process.exit(1)
    }

    const baseUrl = args.baseUrl ?? process.env['OPENAPI_BASE_URL']

    let serverIndex = args.serverIndex
    if (serverIndex === undefined && process.env['OPENAPI_SERVER_INDEX']) {
      const parsed = parseInt(process.env['OPENAPI_SERVER_INDEX'], 10)
      if (!isNaN(parsed) && parsed >= 0) {
        serverIndex = parsed
      }
    }

    const mcp = await createOpenApiMcp({
      source,
      baseUrl,
      serverIndex,
      filters: buildFilters(args),
    })

    const opCount = mcp.spec.operations.length
    const schemaCount = Object.keys(mcp.spec.schemas).length
    process.stderr.write(
      `dynamic-openapi-mcp: loaded "${mcp.spec.title}" v${mcp.spec.version} — ${opCount} tools, ${schemaCount} schemas\n`
    )

    await mcp.serve()
  } catch (error) {
    if (error instanceof Error) {
      process.stderr.write(`dynamic-openapi-mcp: ${error.message}\n`)
      if (error.stack) {
        process.stderr.write(`${error.stack}\n`)
      }
    } else {
      process.stderr.write(`dynamic-openapi-mcp: ${String(error)}\n`)
    }
    process.exit(1)
  }
}

function isInvokedDirectly(): boolean {
  if (typeof process === 'undefined' || !Array.isArray(process.argv)) return false
  const argv1 = process.argv[1]
  if (!argv1) return false
  try {
    const argvReal = realpathSync(argv1)
    const metaReal = realpathSync(fileURLToPath(import.meta.url))
    return pathToFileURL(argvReal).href === pathToFileURL(metaReal).href
  } catch {
    return false
  }
}

if (isInvokedDirectly()) {
  main()
}
