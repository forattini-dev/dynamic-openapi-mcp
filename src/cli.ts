import { createOpenApiMcp } from './server.js'

interface CliArgs {
  source?: string
  baseUrl?: string
  serverIndex?: number
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {}

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i]
    const next = argv[i + 1]

    if ((arg === '-s' || arg === '--source') && next) {
      args.source = next
      i++
    } else if ((arg === '-b' || arg === '--base-url') && next) {
      args.baseUrl = next
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

function printHelp(): void {
  console.log(`
openapi-mcp - Transform OpenAPI specs into MCP servers

Usage:
  openapi-mcp [options] [source]

Options:
  -s, --source <url|file>   OpenAPI spec URL or file path
  -b, --base-url <url>      Override the base URL from the spec
  --server-index <n>         Use the Nth server from the spec (0-based, default: 0)
  -h, --help                Show this help message

Environment Variables:
  OPENAPI_SOURCE            OpenAPI spec URL or file path
  OPENAPI_BASE_URL          Override base URL
  OPENAPI_SERVER_INDEX      Server index (0-based)
  OPENAPI_AUTH_TOKEN        Bearer token for API authentication
  OPENAPI_API_KEY           API key for authentication

Examples:
  openapi-mcp -s https://petstore3.swagger.io/api/v3/openapi.json
  openapi-mcp ./spec.yaml
  openapi-mcp --server-index 1 ./spec.yaml
  OPENAPI_SOURCE=./spec.yaml OPENAPI_AUTH_TOKEN=sk-123 openapi-mcp
`)
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv)

  const source = args.source ?? process.env['OPENAPI_SOURCE'] ?? process.env['OPENAPI_SOURCE_FILE']

  if (!source) {
    console.error('Error: No OpenAPI source specified.')
    console.error('Use -s <url|file> or set OPENAPI_SOURCE environment variable.')
    console.error('Run openapi-mcp --help for usage information.')
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

  try {
    const mcp = await createOpenApiMcp({
      source,
      baseUrl,
      serverIndex,
    })

    const opCount = mcp.spec.operations.length
    const schemaCount = Object.keys(mcp.spec.schemas).length
    process.stderr.write(
      `openapi-mcp: loaded "${mcp.spec.title}" v${mcp.spec.version} — ${opCount} tools, ${schemaCount} schemas\n`
    )

    await mcp.serve()
  } catch (error) {
    if (error instanceof Error) {
      process.stderr.write(`openapi-mcp: ${error.message}\n`)
      if (error.stack) {
        process.stderr.write(`${error.stack}\n`)
      }
    } else {
      process.stderr.write(`openapi-mcp: ${String(error)}\n`)
    }
    process.exit(1)
  }
}

main()
