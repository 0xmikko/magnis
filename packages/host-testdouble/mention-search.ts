/** `@/modules/episodes/hooks/useMentionSearch` — the graph search behind the
 * @-mention popup.
 *
 * It exists as its own module, rather than being inlined into the markdown
 * double, for one reason: `NoteDetailMention.test.tsx` keeps the real
 * `useEditorMentionSuggestion` and replaces THIS hook, to prove the query and
 * active flag flow from the editor into search and the results flow back. That
 * seam only exists if the double has the same seam the host does.
 */

import type { EntitySearchResult } from "@magnis/host/markdown";

export function useMentionSearch(
  _query: string,
  _active: boolean,
): { readonly results: readonly EntitySearchResult[]; readonly isLoading: boolean } {
  // No graph in a test stand. A test that wants results replaces this module.
  return { results: [], isLoading: false };
}
