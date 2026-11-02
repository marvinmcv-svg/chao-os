/**
 * Tiny client-side helpers around the `{ success, data | error }` envelope
 * produced by `withApiHandler`.
 */
export class ApiClientError extends Error {
  constructor(message: string, public code?: string, public status?: number) {
    super(message)
  }
}

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json', ...(init?.headers || {}) } : init?.headers,
  })
  let json: any = null
  try {
    json = await res.json()
  } catch {
    throw new ApiClientError(`Respuesta inválida del servidor (${res.status})`, 'BAD_RESPONSE', res.status)
  }
  if (!json?.success) {
    const e = json?.error
    const message = typeof e === 'string' ? e : e?.message || `Error ${res.status}`
    throw new ApiClientError(message, e?.code, res.status)
  }
  return json.data as T
}

/** Normalise list endpoints that return either `T[]` or `{ projects: T[] }`-style pages. */
export function asList<T>(data: unknown, key?: string): T[] {
  if (Array.isArray(data)) return data as T[]
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>
    if (key && Array.isArray(obj[key])) return obj[key] as T[]
    const firstArray = Object.values(obj).find(Array.isArray)
    if (firstArray) return firstArray as T[]
  }
  return []
}

export function errorMessage(e: unknown, fallback = 'Ocurrió un error'): string {
  if (e instanceof Error && e.message) return e.message
  return fallback
}
