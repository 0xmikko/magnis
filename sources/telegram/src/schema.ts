// telegram connector — shared surface consts. The connector feeds a SINGLE push
// surface; the per-surface remote-id builders live inside the surface folder
// (surfaces/telegram/schema.ts). `SURFACE_TELEGRAM` is the wire surface name —
// advertised in `initialize` capabilities and stamped on every envelope.

/** Wire surface: the Telegram chats + messages push feed. */
export const SURFACE_TELEGRAM = "telegram";
