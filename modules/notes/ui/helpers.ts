import type { NoteListItem } from "./types";

export interface NoteGroup {
  readonly label: string;
  readonly date: Date | null; // null for "Pinned" group
  readonly notes: readonly NoteListItem[];
}

/**
 * Group notes by time periods: Pinned, Today, Yesterday, Last 7 Days,
 * Last 30 Days, then by month (e.g. "February 2026").
 */
export function groupNotesByTime(notes: readonly NoteListItem[]): readonly NoteGroup[] {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart.getTime() - 86_400_000);
  const last7Start = new Date(todayStart.getTime() - 7 * 86_400_000);
  const last30Start = new Date(todayStart.getTime() - 30 * 86_400_000);

  const pinned: NoteListItem[] = [];
  const today: NoteListItem[] = [];
  const yesterday: NoteListItem[] = [];
  const last7: NoteListItem[] = [];
  const last30: NoteListItem[] = [];
  const byMonth = new Map<string, NoteListItem[]>();

  for (const note of notes) {
    if (note.pinned) {
      pinned.push(note);
      continue;
    }

    const date = new Date(note.updated_at ?? note.created_at);

    if (date >= todayStart) {
      today.push(note);
    } else if (date >= yesterdayStart) {
      yesterday.push(note);
    } else if (date >= last7Start) {
      last7.push(note);
    } else if (date >= last30Start) {
      last30.push(note);
    } else {
      const monthKey = `${String(date.getFullYear())}-${String(date.getMonth()).padStart(2, "0")}`;
      const monthLabel = date.toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      });
      const key = `${monthKey}|${monthLabel}`;
      const bucket = byMonth.get(key);
      if (bucket) {
        bucket.push(note);
      } else {
        byMonth.set(key, [note]);
      }
    }
  }

  const groups: NoteGroup[] = [];

  if (pinned.length > 0) groups.push({ label: "Pinned", date: null, notes: pinned });
  if (today.length > 0) groups.push({ label: "Today", date: todayStart, notes: today });
  if (yesterday.length > 0) groups.push({ label: "Yesterday", date: yesterdayStart, notes: yesterday });
  if (last7.length > 0) groups.push({ label: "Last 7 Days", date: last7Start, notes: last7 });
  if (last30.length > 0) groups.push({ label: "Last 30 Days", date: last30Start, notes: last30 });

  // Sort month buckets by key (descending = most recent first)
  const sortedMonths = [...byMonth.entries()].sort(([a], [b]) => b.localeCompare(a));
  for (const [key, bucket] of sortedMonths) {
    const label = key.split("|")[1] ?? key;
    const firstNote = bucket.at(0);
    const firstDate = firstNote
      ? new Date(firstNote.updated_at ?? firstNote.created_at)
      : null;
    groups.push({ label, date: firstDate, notes: bucket });
  }

  return groups;
}

/**
 * Extract a plain-text preview from markdown: strip markdown syntax, return first ~80 chars.
 */
export function extractPreview(body: string | null | undefined, maxLength = 80): string {
  if (!body) return "";

  const stripped = body
    // Remove headings markers
    .replace(/^#{1,6}\s+/gm, "")
    // Remove bold/italic markers
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1")
    .replace(/_{1,3}([^_]+)_{1,3}/g, "$1")
    // Remove inline code
    .replace(/`([^`]+)`/g, "$1")
    // Remove links [text](url)
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    // Remove images ![alt](url)
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    // Remove blockquotes
    .replace(/^>\s+/gm, "")
    // Remove horizontal rules
    .replace(/^[-*_]{3,}\s*$/gm, "")
    // Remove list markers
    .replace(/^[\s]*[-*+]\s+/gm, "")
    .replace(/^[\s]*\d+\.\s+/gm, "")
    // Collapse whitespace
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (stripped.length <= maxLength) return stripped;
  return `${stripped.slice(0, maxLength).trimEnd()}...`;
}
