import { API_BASE_URL } from "../config";

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

const AUTH_STORAGE_KEY = "careerbridge:auth";

// The real backend's MVP auth: send the signed-in user's backend id as
// X-User-Id on every call except /api/health and POST /api/users. Read
// straight from localStorage (not AuthContext) to avoid a circular import
// between the context layer and the api layer.
function backendUserId(): string | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { backendUserId?: string };
    return parsed.backendUserId ?? null;
  } catch {
    return null;
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  /** Sent as the Idempotency-Key header. Required by the contract on profile
   * confirm and assessment start/submit; generate with crypto.randomUUID(). */
  idempotencyKey?: string;
  /** Skip the X-User-Id header — only /api/health and POST /api/users. */
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
    const userId = backendUserId();
    if (userId) headers["X-User-Id"] = userId;
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
