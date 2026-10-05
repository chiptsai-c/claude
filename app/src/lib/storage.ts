/** Per-device conveniences only. Storage can be missing or blocked, so every call is guarded. */
export function load(key: string, fallback: string): string {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}

export function save(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* storage blocked: ignore */ }
}
