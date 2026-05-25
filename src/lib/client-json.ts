export async function readJson<T = any>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text.trim()) return {} as T;

  try {
    return JSON.parse(text) as T;
  } catch {
    return { error: response.ok ? "Invalid JSON response" : text } as T;
  }
}
