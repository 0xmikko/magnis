/**
 * TelegramReplyComposer — component behavior tests.
 *
 * Traceability:
 * - tst_fe_composer_001 Enter sends trimmed text once, clears draft
 * - tst_fe_composer_002 Shift+Enter inserts newline, does not send
 * - tst_fe_composer_003 Second Enter during in-flight send is ignored
 * - tst_fe_composer_004 Successful send clears localStorage for telegram:<chatId>
 * - tst_fe_composer_005 onSend rejection preserves text + localStorage
 * - tst_fe_composer_006 Mount calls setPresence({mode:"telegram", thread_key: String(chatId)})
 * - tst_fe_composer_007 Telegram mode: paperclip absent from DOM
 * - tst_fe_composer_008 Mount/unmount/chatId switch lifecycle on setPresence
 * - tst_fe_composer_028 composer.apply set_text event with matching (mode, thread_key) updates textarea
 * - tst_fe_composer_029 composer.apply event with mismatched thread_key is ignored
 * - tst_fe_composer_030 append_text concatenates onto existing draft text
 */

import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JSX, ReactNode } from "react";
import { TelegramReplyComposer } from "../TelegramReplyComposer";
import { ComposerMountProvider } from "@magnis/host/composer";
import { __INTERNAL } from "@magnis/host/composer";
import type {
  AppRuntime,
  ComposerApplyEventPayload,
  ComposerPresenceParams,
} from "@magnis/host/runtime";

const { STORAGE_KEY } = __INTERNAL;

// ── Runtime mock ──────────────────────────────────────────────────────

interface PresenceCall {
  readonly params: ComposerPresenceParams | null;
}

const setPresenceCalls: PresenceCall[] = [];

type ApplyHandler = (event: ComposerApplyEventPayload) => void;
const applyHandlers: ApplyHandler[] = [];

function emitApply(event: ComposerApplyEventPayload): void {
  for (const h of applyHandlers) h(event);
}

function makeRuntime(): AppRuntime {
  return {
    composer: {
      setPresence: (params: ComposerPresenceParams | null): void => {
        setPresenceCalls.push({ params });
      },
      onApply: (handler: ApplyHandler): (() => void) => {
        applyHandlers.push(handler);
        return (): void => {
          const idx = applyHandlers.indexOf(handler);
          if (idx >= 0) applyHandlers.splice(idx, 1);
        };
      },
    },
    // Other fields are not touched by this component but satisfy the type.
  } as unknown as AppRuntime;
}

let currentRuntime: AppRuntime;

vi.mock("@magnis/host/runtime", () => ({
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  useAppRuntime: (): AppRuntime => currentRuntime,
}));

// ── Harness ───────────────────────────────────────────────────────────

function Harness({ children }: { children: ReactNode }): JSX.Element {
  return <ComposerMountProvider>{children}</ComposerMountProvider>;
}

beforeEach(() => {
  localStorage.clear();
  setPresenceCalls.length = 0;
  applyHandlers.length = 0;
  currentRuntime = makeRuntime();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function getTextarea(container: HTMLElement): HTMLTextAreaElement {
  const el = container.querySelector("textarea");
  if (!el) throw new Error("textarea not found");
  return el;
}

// ──────────────────────────────────────────────────────────────────────

describe("TelegramReplyComposer", () => {
  // tst_fe_composer_001
  it("tst_fe_composer_001 Enter triggers onSendMessage once with trimmed text and clears draft", () => {
    const onSend = vi.fn();
    const { container } = render(
      <Harness>
        <TelegramReplyComposer chatId="42" onSendMessage={onSend} />
      </Harness>,
    );
    const ta = getTextarea(container);
    fireEvent.change(ta, { target: { value: "  hello  " } });
    fireEvent.keyDown(ta, { key: "Enter" });

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith("hello");
    // Draft cleared from memory (textarea value reset).
    expect(ta.value).toBe("");
  });

  // tst_fe_composer_002
  it("tst_fe_composer_002 Shift+Enter inserts newline and does NOT send", () => {
    const onSend = vi.fn();
    const { container } = render(
      <Harness>
        <TelegramReplyComposer chatId="42" onSendMessage={onSend} />
      </Harness>,
    );
    const ta = getTextarea(container);
    fireEvent.change(ta, { target: { value: "line1" } });
    fireEvent.keyDown(ta, { key: "Enter", shiftKey: true });

    expect(onSend).not.toHaveBeenCalled();
    // Textarea retains typed value; newline insertion itself is browser-native
    // and not simulated by happy-dom, so we assert send-not-called here.
    expect(ta.value).toBe("line1");
  });

  // tst_fe_composer_003
  it("tst_fe_composer_003 Second Enter during in-flight send is ignored", async () => {
    const deferred: { resolve: () => void; promise: Promise<void> } = ((): {
      resolve: () => void;
      promise: Promise<void>;
    } => {
      let resolve: () => void = (): void => { /* assigned below */ };
      const promise = new Promise<void>((r) => { resolve = r; });
      return { resolve, promise };
    })();
    const onSend = vi.fn(() => deferred.promise);

    const { container } = render(
      <Harness>
        <TelegramReplyComposer chatId="42" onSendMessage={onSend} />
      </Harness>,
    );
    const ta = getTextarea(container);
    fireEvent.change(ta, { target: { value: "hello" } });
    fireEvent.keyDown(ta, { key: "Enter" });
    // Second Enter fires during in-flight promise.
    fireEvent.keyDown(ta, { key: "Enter" });

    expect(onSend).toHaveBeenCalledTimes(1);

    // Resolve and flush microtasks so state settles.
    deferred.resolve();
    await act(async () => { await deferred.promise; });
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  // tst_fe_composer_004
  it("tst_fe_composer_004 successful send clears localStorage entry for telegram:<chatId>", () => {
    const onSend = vi.fn();
    const { container } = render(
      <Harness>
        <TelegramReplyComposer chatId="42" onSendMessage={onSend} />
      </Harness>,
    );
    const ta = getTextarea(container);
    fireEvent.change(ta, { target: { value: "hello" } });

    // Pre-send: entry exists in storage.
    const rawBefore = localStorage.getItem(STORAGE_KEY);
    expect(rawBefore).not.toBeNull();
    const parsedBefore = JSON.parse(rawBefore ?? "{}") as Record<string, unknown>;
    expect(parsedBefore["telegram:42"]).toBeDefined();

    fireEvent.keyDown(ta, { key: "Enter" });

    const rawAfter = localStorage.getItem(STORAGE_KEY);
    const parsedAfter = JSON.parse(rawAfter ?? "{}") as Record<string, unknown>;
    expect(parsedAfter["telegram:42"]).toBeUndefined();
  });

  // tst_fe_composer_005
  it("tst_fe_composer_005 onSend rejection preserves text + localStorage entry", async () => {
    const onSend = vi.fn(() => Promise.reject(new Error("boom")));
    const { container } = render(
      <Harness>
        <TelegramReplyComposer chatId="42" onSendMessage={onSend} />
      </Harness>,
    );
    const ta = getTextarea(container);
    fireEvent.change(ta, { target: { value: "hello" } });
    fireEvent.keyDown(ta, { key: "Enter" });

    // Let the rejection propagate.
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });

    expect(ta.value).toBe("hello");
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = JSON.parse(raw ?? "{}") as Record<string, { text: string }>;
    expect(parsed["telegram:42"]?.text).toBe("hello");
  });

  // tst_fe_composer_006 — presence on mount
  it("tst_fe_composer_006 mount triggers setPresence with {mode:\"telegram\", thread_key: String(chatId)}", () => {
    render(
      <Harness>
        <TelegramReplyComposer chatId={99} />
      </Harness>,
    );
    // First call is the mount with the params; there may be subsequent lifecycle calls.
    expect(setPresenceCalls[0]?.params).toEqual({
      mode: "telegram",
      thread_key: "99",
    });
  });

  // tst_fe_composer_007
  it("tst_fe_composer_007 telegram mode: paperclip icon absent from rendered DOM", () => {
    const { container } = render(
      <Harness>
        <TelegramReplyComposer chatId="42" />
      </Harness>,
    );
    // Per MessageComposer Icon usage, paperclip would render an <svg class="lucide-paperclip">.
    // Also guard against any element carrying "paperclip" as a title or aria-label.
    const html = container.innerHTML;
    expect(html.toLowerCase()).not.toContain("paperclip");
    const attachButtons = container.querySelectorAll('[title="Attach"]');
    expect(attachButtons.length).toBe(0);
  });

  // tst_fe_composer_008 — mount / unmount / chatId switch
  it("tst_fe_composer_008 mount → setPresence(params); unmount → setPresence(null); chatId change = null then new", () => {
    const { rerender, unmount } = render(
      <Harness>
        <TelegramReplyComposer chatId="A" />
      </Harness>,
    );
    // Mount recorded presence for A.
    expect(setPresenceCalls.find((c) => c.params?.thread_key === "A")).toBeDefined();

    // Change chatId: useEffect cleanup should fire setPresence(null), then re-mount with new key.
    setPresenceCalls.length = 0;
    rerender(
      <Harness>
        <TelegramReplyComposer chatId="B" />
      </Harness>,
    );
    const hadNull = setPresenceCalls.some((c) => c.params === null);
    const hadB = setPresenceCalls.some((c) => c.params?.thread_key === "B");
    expect(hadNull).toBe(true);
    expect(hadB).toBe(true);

    // Unmount: final null call.
    setPresenceCalls.length = 0;
    unmount();
    expect(setPresenceCalls.some((c) => c.params === null)).toBe(true);
  });

  // tst_fe_composer_028 — composer.apply routes set_text to textarea
  it("tst_fe_composer_028 composer.apply set_text with matching (mode, thread_key) updates textarea", () => {
    const { container } = render(
      <Harness>
        <TelegramReplyComposer chatId="42" />
      </Harness>,
    );
    act(() => {
      emitApply({
        mode: "telegram",
        thread_key: "42",
        revision: 1,
        op: "set_text",
        text: "from agent",
      });
    });
    expect(getTextarea(container).value).toBe("from agent");
  });

  // tst_fe_composer_029 — mismatched thread_key is ignored
  it("tst_fe_composer_029 composer.apply with mismatched thread_key does not update", () => {
    const { container } = render(
      <Harness>
        <TelegramReplyComposer chatId="42" />
      </Harness>,
    );
    const ta = getTextarea(container);
    fireEvent.change(ta, { target: { value: "typed" } });
    act(() => {
      emitApply({
        mode: "telegram",
        thread_key: "999",
        revision: 1,
        op: "set_text",
        text: "should not apply",
      });
    });
    expect(ta.value).toBe("typed");
  });

  // tst_fe_composer_030 — append_text concatenates onto existing draft text
  it("tst_fe_composer_030 append_text concatenates onto existing draft text", () => {
    const { container } = render(
      <Harness>
        <TelegramReplyComposer chatId="42" />
      </Harness>,
    );
    const ta = getTextarea(container);
    fireEvent.change(ta, { target: { value: "hello" } });
    act(() => {
      emitApply({
        mode: "telegram",
        thread_key: "42",
        revision: 1,
        op: "append_text",
        text: " world",
      });
    });
    expect(getTextarea(container).value).toBe("hello world");
  });
});
