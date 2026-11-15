import { API_BASE_URL } from "../config";
import { supabase } from "../supabase";

export class ApiError extends Error {
  status: number;
  code?: string;
  field?: string;

  constructor(status: number, message: string, code?: string, field?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.field = field;
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  /** Sent as the Idempotency-Key header. Required by the contract on profile
   * confirm and assessment start/submit; generate with crypto.randomUUID(). */
  idempotencyKey?: string;
  /** Skip the Authorization header — only /api/health needs no auth. */
  skipAuth?: boolean;
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const isFormData = options.body instanceof FormData;
  const headers: Record<string, string> = {};
  if (!isFormData) headers["Content-Type"] = "application/json";
  if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;
  if (!options.skipAuth) {
    // getSession() reads the current (auto-refreshed) Supabase session —
    // no network call unless a refresh is actually due.
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) headers.Authorization = `Bearer ${data.session.access_token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: isFormData
        ? (options.body as FormData)
        : options.body
          ? JSON.stringify(options.body)
          : undefined,
    });
  } catch {
    throw new ApiError(0, "Unable to reach the server. Check your connection and try again.");
  }

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    let code: string | undefined;
    let field: string | undefined;
    try {
      const data = await response.json();
      // api/openapi.yaml's Error shape: { error: { code, message, field? } }
      if (data?.error?.message) {
        message = data.error.message;
        code = data.error.code;
        field = data.error.field;
      } else if (typeof data?.message === "string") {
        message = data.message;
      }
    } catch {
      // response body wasn't JSON; fall back to the generic message
    }
    throw new ApiError(response.status, message, code, field);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
