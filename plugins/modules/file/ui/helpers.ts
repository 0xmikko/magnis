// File-plugin UI helpers. `mimeToIcon` lives in the host (`@magnis/host/utils`)
// because host composers also render attachment icons; these two are
// plugin-only, so they stay local.

/** Map MIME type to a badge color class. */
export function mimeToColor(mimeType: string): string {
  if (mimeType.startsWith("image/")) return "bg-pink-600";
  if (mimeType.startsWith("video/")) return "bg-purple-600";
  if (mimeType.startsWith("audio/")) return "bg-amber-600";
  if (mimeType === "application/pdf") return "bg-red-600";
  return "bg-blue-600";
}

/** Short display label for source module. */
export function sourceLabel(sourceModule: string): string {
  switch (sourceModule) {
    case "telegram": return "Telegram";
    case "email": return "Email";
    case "uploads": return "Upload";
    case "upload": return "Upload";
    default: return sourceModule;
  }
}
