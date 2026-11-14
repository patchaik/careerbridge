import { API_BASE_URL } from "../config";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const isFormData = options.body instanceof FormData;
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: options.method ?? "GET",
      headers: isFormData ? undefined : { "Content-Type": "application/json" },
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
    try {
      const data = await response.json();
      if (typeof data?.message === "string") message = data.message;
    } catch {
      // response body wasn't JSON; fall back to the generic message
    }
    throw new ApiError(response.status, message);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
