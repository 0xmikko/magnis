// Copied from the host (frontend/src/utils/text.ts) — no @magnis/host shim
// equivalent. Up-to-`maxLength` uppercase initials from a display name.
export function initialsFromName(name: string, maxLength = 2): string {
  const initials = name
    .split(" ")
    .map((word) => word[0])
    .filter(Boolean)
    .join("")
    .slice(0, maxLength)
    .toUpperCase();
  return initials || "?";
}
