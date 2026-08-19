// happy-dom v20 does not provide `localStorage`/`sessionStorage` (neither on
// `window` nor on the bare `globalThis`) under the Node test runner, while
// plugin code — and the composer double that backs it — reads the unqualified
// `localStorage` global. Without this, any composer test throws "Cannot read
// properties of undefined (reading 'getItem')".
//
// Runs at setup-module eval, before any test file imports, so it is top-level.
class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length(): number {
    return this.store.size;
  }
  clear(): void {
    this.store.clear();
  }
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

const g = globalThis as unknown as {
  window?: { localStorage?: Storage; sessionStorage?: Storage };
  localStorage?: Storage;
  sessionStorage?: Storage;
};

if (g.localStorage === undefined) {
  const ls = new MemoryStorage();
  g.localStorage = ls;
  if (g.window !== undefined) g.window.localStorage = ls;
}
if (g.sessionStorage === undefined) {
  const ss = new MemoryStorage();
  g.sessionStorage = ss;
  if (g.window !== undefined) g.window.sessionStorage = ss;
}
