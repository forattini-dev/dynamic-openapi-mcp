import type { ParsedOperation } from 'dynamic-openapi-tools/parser'

export const MCP_MAX_TOOLS_ENV = 'MCP_MAX_TOOLS'
export const MCP_HIDDEN_EXTENSION = 'x-mcp-hidden'

export interface SelectedOperations {
  registered: ParsedOperation[]
  hidden: ParsedOperation[]
  budgeted: ParsedOperation[]
}

/**
 * Pick which operations get registered as MCP tools. Three layers, in order:
 *
 *   1. `x-mcp-hidden: true` on an operation removes it from the MCP surface
 *      (CLI/skill keep it). Distinct from `x-hidden`, which removes from all
 *      surfaces and is honored upstream by `filterOperations`.
 *
 *   2. If `MCP_MAX_TOOLS` is set and the remaining count exceeds it, trim by
 *      a stable priority: untagged & deprecated last, then alphabetical by
 *      operationId. The trimmed operations are returned as `budgeted` so the
 *      caller can surface them via a Prompt for agent discovery.
 *
 *   3. Everything else is `registered`.
 *
 * The fallback `env` argument keeps the function pure for testing.
 */
export function selectOperations(
  operations: ParsedOperation[],
  env: NodeJS.ProcessEnv = process.env,
): SelectedOperations {
  const hidden: ParsedOperation[] = []
  const candidates: ParsedOperation[] = []

  for (const operation of operations) {
    if (isMcpHidden(operation)) {
      hidden.push(operation)
    } else {
      candidates.push(operation)
    }
  }

  const max = readMaxTools(env)
  if (max === null || candidates.length <= max) {
    return { registered: candidates, hidden, budgeted: [] }
  }

  const ranked = [...candidates].sort(rankForBudget)
  const registered = ranked.slice(0, max)
  const budgeted = ranked.slice(max)
  return { registered, hidden, budgeted }
}

function isMcpHidden(operation: ParsedOperation): boolean {
  const bag = operation as unknown as Record<string, unknown>
  if (bag[MCP_HIDDEN_EXTENSION] === true) return true
  const extensions = bag['extensions']
  if (extensions && typeof extensions === 'object') {
    if ((extensions as Record<string, unknown>)[MCP_HIDDEN_EXTENSION] === true) return true
  }
  return false
}

function readMaxTools(env: NodeJS.ProcessEnv): number | null {
  const raw = env[MCP_MAX_TOOLS_ENV]
  if (raw === undefined || raw === '') return null
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return parsed
}

/**
 * Sort comparator: deprecated last, then untagged last, then alphabetical by
 * operationId. Returns < 0 when `a` should come first (higher priority).
 */
function rankForBudget(a: ParsedOperation, b: ParsedOperation): number {
  const deprA = a.deprecated ? 1 : 0
  const deprB = b.deprecated ? 1 : 0
  if (deprA !== deprB) return deprA - deprB

  const untaggedA = a.tags.length === 0 ? 1 : 0
  const untaggedB = b.tags.length === 0 ? 1 : 0
  if (untaggedA !== untaggedB) return untaggedA - untaggedB

  return a.operationId.localeCompare(b.operationId)
}
