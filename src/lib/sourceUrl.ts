export function sourceUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password ? url : null;
  } catch {
    return null;
  }
}
