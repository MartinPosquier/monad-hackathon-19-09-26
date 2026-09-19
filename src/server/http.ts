/** Erreurs HTTP typées et enveloppe commune des route handlers. */

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function handle(fn: () => Promise<unknown> | unknown): Promise<Response> {
  try {
    return Response.json(await fn(), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
    console.error("[api]", e);
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ error: `internal error: ${message}` }, { status: 500 });
  }
}

export async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, "invalid JSON body");
  }
}
