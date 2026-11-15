export const USE_MOCKS = (import.meta.env.VITE_USE_MOCKS ?? "").trim().toLowerCase() === "true";

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

export function mockDelay(min = 300, max = 1200): Promise<void> {
  const ms = Math.round(min + Math.random() * (max - min));
  return new Promise((resolve) => setTimeout(resolve, ms));
}
