/** `@magnis/host/markdown` — the host's rich-text editor.
 *
 * `MarkdownEditor` is a Milkdown/ProseMirror instance. A plugin never
 * asserts the editor's internals; it asserts that it PASSED a value and that
 * an edit reaches its `onChange`. The double is a plain textarea that keeps
 * exactly that contract — a plugin test that needed real ProseMirror
 * behaviour would be testing the host.
 */
import { useMemo, useState, type JSX } from "react";

import { useMentionSearch } from "@/modules/episodes/hooks/useMentionSearch";

export interface EntitySearchResultLike {
  readonly id: string;
  // Nullable, as the host declares it: an entity in the graph can have no
  // name, and a mention popup that assumed otherwise would crash on it.
  readonly name: string | null;
  readonly schema_id?: string;
}

export interface MentionSuggestionConfigLike {
  readonly results: readonly EntitySearchResultLike[];
  readonly isLoading: boolean;
  readonly onQueryChange: (query: string, active: boolean) => void;
}

export function MarkdownEditor({
  initialValue,
  onChange,
  placeholder,
  readOnly,
  className,
  autoFocus,
}: {
  readonly initialValue: string;
  readonly onChange: (markdown: string) => void;
  readonly placeholder?: string;
  readonly readOnly?: boolean;
  readonly className?: string;
  readonly autoFocus?: boolean;
  readonly mentionSuggestion?: MentionSuggestionConfigLike;
}): JSX.Element {
  // `initialValue` is initial, as the host's is: a later prop change does not
  // clobber what the user has typed.
  const [value, setValue] = useState(initialValue);
  return (
    <textarea
      data-host="MarkdownEditor"
      className={className}
      value={value}
      placeholder={placeholder}
      readOnly={readOnly}
      autoFocus={autoFocus}
      onChange={(e) => {
        setValue(e.target.value);
        onChange(e.target.value);
      }}
    />
  );
}

export function useEditorMentionSuggestion(): MentionSuggestionConfigLike {
  // The same shape as the host's: this hook owns the `(query, active)` state
  // and hands it to `useMentionSearch`. The indirection is the point — a
  // consumer test replaces the search module and watches the query arrive.
  const [state, setState] = useState<{ query: string; active: boolean }>({
    query: "",
    active: false,
  });
  const { results, isLoading } = useMentionSearch(state.query, state.active);

  return useMemo<MentionSuggestionConfigLike>(
    () => ({
      results,
      isLoading,
      onQueryChange: (query: string, active: boolean): void => {
        setState({ query, active });
      },
    }),
    [results, isLoading],
  );
}
