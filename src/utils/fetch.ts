export interface FetchWithRetryOptions {
  timeout?: number
  retries?: number
  retryDelay?: number
  retryOn?: number[]
}

const DEFAULT_OPTIONS: Required<FetchWithRetryOptions> = {
  timeout: 30_000,
  retries: 3,
  retryDelay: 1_000,
  retryOn: [429, 500, 502, 503, 504],
}

export async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  opts?: FetchWithRetryOptions
): Promise<Response> {
  const { timeout, retries, retryDelay, retryOn } = { ...DEFAULT_OPTIONS, ...opts }

  let lastError: Error | undefined

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeout)

      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      })

      clearTimeout(timer)

      if (retryOn.includes(response.status) && attempt < retries) {
        const retryAfter = response.headers.get('Retry-After')
        const delay = retryAfter
          ? parseRetryAfter(retryAfter)
          : retryDelay * Math.pow(2, attempt)

        await sleep(delay)
        continue
      }

      return response
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      if (lastError.name === 'AbortError') {
        lastError = new Error(`Request timed out after ${timeout}ms: ${url}`)
      }

      if (attempt < retries) {
        await sleep(retryDelay * Math.pow(2, attempt))
        continue
      }
    }
  }

  throw lastError ?? new Error(`Request failed after ${retries + 1} attempts: ${url}`)
}

function parseRetryAfter(value: string): number {
  const seconds = Number(value)
  if (!Number.isNaN(seconds)) {
    return Math.min(seconds * 1000, 60_000)
  }

  const date = Date.parse(value)
  if (!Number.isNaN(date)) {
    return Math.min(Math.max(date - Date.now(), 0), 60_000)
  }

  return 1_000
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
