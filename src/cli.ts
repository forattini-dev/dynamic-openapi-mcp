import { pathToFileURL } from 'node:url'
import { createOpenApiMcp } from './server.js'
import { createDocsMcp } from './docs/server.js'
import type { OperationFilters } from './parser/filter.js'

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

export function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    includeTags: [],
    excludeTags: [],
    includeOperations: [],
    excludeOperations: [],
  }

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i]
    const next = argv[i + 1]

    if ((arg === '-s' || arg === '--source') && next) {
      args.source = next
      i++
    } else if ((arg === '-b' || arg === '--base-url') && next) {
      args.baseUrl = next
      i++
    } else if (arg === '--docs' && next) {
      args.docs = next
      i++
    } else if (arg === '--path' && next) {
      args.docsPath = next
      i++
    } else if (arg === '--branch' && next) {
      args.docsBranch = next
      i++
    } else if (arg === '--name' && next) {
      args.name = next
      i++
    } else if (arg === '--include-tag' && next) {
      pushCsv(args.includeTags, next)
      i++
    } else if (arg === '--exclude-tag' && next) {
      pushCsv(args.excludeTags, next)
      i++
    } else if (arg === '--include-operation' && next) {
      pushCsv(args.includeOperations, next)
      i++
    } else if (arg === '--exclude-operation' && next) {
      pushCsv(args.excludeOperations, next)
      i++
    } else if ((arg === '--server-index') && next) {
      const parsed = parseInt(next, 10)
      if (isNaN(parsed) || parsed < 0) {
        console.error(`Error: --server-index must be a non-negative integer, got "${next}"`)
        process.exit(1)
      }
      args.serverIndex = parsed
      i++
    } else if (arg === '-h' || arg === '--help') {
      printHelp()
      process.exit(0)
    } else if (!arg.startsWith('-') && !args.source) {
      args.source = arg
    }
  }

  return args
}

function pushCsv(target: string[], value: string): void {
  for (const piece of value.split(',')) {
    const trimmed = piece.trim()
    if (trimmed) target.push(trimmed)
  }
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

const invokedDirectly =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href

if (invokedDirectly) {
  main()
}
