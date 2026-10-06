// Copied from the host (frontend/src/utils/time.ts) — no @magnis/host shim
// equivalent. Format a message timestamp as a short local time.
export function formatMessageTime(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
