/** fetch JSON vers nos routes /api, avec le message d'erreur du serveur remonté tel quel. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(
  path: string,
  opts: { method?: "GET" | "POST"; body?: unknown; headers?: Record<string, string> } = {},
): Promise<T> {
  const res = await fetch(path, {
    method: opts.method ?? "GET",
    headers: { ...(opts.body ? { "Content-Type": "application/json" } : {}), ...opts.headers },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new ApiError(res.status, data.error ?? `request failed (${res.status})`);
  return data;
}
