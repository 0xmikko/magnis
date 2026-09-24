// Copied from the host (frontend/src/utils/hash.ts) — no @magnis/host shim
// equivalent. Deterministic 32-bit string hash (avatar colour selection).
export function hashCode(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return hash;
}
