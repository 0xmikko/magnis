/**
 * EmailReplyComposer — component behavior tests.
 *
 * Traceability:
 * - tst_fe_composer_020 INV-7 mount calls setPresence({mode:"email", thread_key}); unmount null; threadId change null then new
 * - tst_fe_composer_021 INV-3 two EmailReplyComposer instances sharing threadId see the same draft text
 * - tst_fe_composer_022 INV-3 different threadId → different drafts
 * - tst_fe_composer_023 INV-4 successful email.reply RPC clears draft + localStorage
 * - tst_fe_composer_024 INV-5 rejected email.reply RPC preserves text + localStorage
 * - tst_fe_composer_025 INV-11 paperclip button IS present in DOM
 * - tst_fe_composer_026 email.reply call carries {email_id, body_text, attachment_ids}
 * - tst_fe_composer_027 draft attachments persist across remount
 * - tst_fe_composer_031 DEC-18 composer.apply set_text updates textarea value
 * - tst_fe_composer_032 composer.apply set_attachments updates draft attachments forwarded to email.reply
 * - tst_fe_composer_033 INV-11 paperclip → pick file → upload → chip + draft.attachments contain id
 * - tst_fe_composer_034 INV-11 removing a chip drops id from outbound email.reply payload
 * - tst_fe_composer_035 INV-11 upload failure preserves draft text; no chip added; error surfaced
 * - tst_fe_composer_036 INV-11 chips + attachment IDs persist across remount
 */

import { act, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JSX, ReactNode } from "react";
import { EmailReplyComposer } from "../EmailReplyComposer";
import type { UploadedFile } from "@magnis/host/runtime";
import { ComposerMountProvider } from "@magnis/host/composer";
import {
  __INTERNAL,
  writeDraftDirect,
} from "@magnis/host/composer";
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
let rpcImpl: (method: string, params: unknown) => Promise<unknown> = () =>
  Promise.resolve({});
const rpcSpy = vi.fn(
  (method: string, params: unknown): Promise<unknown> => rpcImpl(method, params),
);

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
    transport: {
      rpc: rpcSpy,
    },
  } as unknown as AppRuntime;
}

let currentRuntime: AppRuntime;

// ── fileUpload mock ───────────────────────────────────────────────────

let uploadImpl: (file: File) => Promise<UploadedFile> = (file) =>
  Promise.resolve({
    id: `att-${file.name}`,
    name: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
  });

const uploadSpy = vi.fn(
  (_transport: unknown, file: File): Promise<UploadedFile> => uploadImpl(file),
);

// useAppRuntime + uploadBrowserFile both come from @magnis/host/runtime now,
// so a single facade mock replaces the old per-module mocks.
vi.mock("@magnis/host/runtime", () => ({
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  useAppRuntime: (): AppRuntime => currentRuntime,
  uploadBrowserFile: (transport: unknown, file: File): Promise<UploadedFile> =>
    uploadSpy(transport, file),
}));

// ── Harness ───────────────────────────────────────────────────────────

function Harness({ children }: { children: ReactNode }): JSX.Element {
  return <ComposerMountProvider>{children}</ComposerMountProvider>;
}

beforeEach(() => {
  localStorage.clear();
  setPresenceCalls.length = 0;
  applyHandlers.length = 0;
  rpcSpy.mockClear();
  rpcImpl = (): Promise<unknown> => Promise.resolve({});
  uploadSpy.mockClear();
  uploadImpl = (file: File): Promise<UploadedFile> =>
    Promise.resolve({
      id: `att-${file.name}`,
      name: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
    });
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

function firstRpcCall(): readonly [string, unknown] {
  const call = rpcSpy.mock.calls[0];
  if (!call) throw new Error("rpc was not called");
  return [call[0], call[1]];
}

function clickSend(container: HTMLElement): void {
  const btn = container.querySelector('button[title="Send"]');
  if (!btn) throw new Error("send button not found");
  fireEvent.click(btn);
}

// ──────────────────────────────────────────────────────────────────────

describe("EmailReplyComposer", () => {
  // tst_fe_composer_020 — INV-7 presence lifecycle
  it("tst_fe_composer_020 mount → setPresence(email,thread); unmount → null; threadId change → null then new", () => {
    const { rerender, unmount } = render(
      <Harness>
        <EmailReplyComposer emailId="e1" threadId="T1" />
      </Harness>,
    );
    expect(setPresenceCalls[0]?.params).toEqual({ mode: "email", thread_key: "T1" });

    setPresenceCalls.length = 0;
    rerender(
      <Harness>
        <EmailReplyComposer emailId="e1" threadId="T2" />
      </Harness>,
    );
    const hadNull = setPresenceCalls.some((c) => c.params === null);
    const hadT2 = setPresenceCalls.some(
      (c) => c.params?.mode === "email" && c.params.thread_key === "T2",
    );
    expect(hadNull).toBe(true);
    expect(hadT2).toBe(true);

    setPresenceCalls.length = 0;
    unmount();
    expect(setPresenceCalls.some((c) => c.params === null)).toBe(true);
  });

  // tst_fe_composer_021 — INV-3 shared thread draft
  it("tst_fe_composer_021 two instances sharing threadId see the same draft text", () => {
    writeDraftDirect("email", "Tshared", { text: "hello" });
    const first = render(
      <Harness>
        <EmailReplyComposer emailId="e-alpha" threadId="Tshared" />
      </Harness>,
    );
    const second = render(
      <Harness>
        <EmailReplyComposer emailId="e-beta" threadId="Tshared" />
      </Harness>,
    );
    expect(getTextarea(first.container).value).toBe("hello");
    expect(getTextarea(second.container).value).toBe("hello");
  });

  // tst_fe_composer_022 — INV-3 distinct threads → distinct drafts
  it("tst_fe_composer_022 different threadId → different drafts", () => {
    writeDraftDirect("email", "T1", { text: "alpha" });
    writeDraftDirect("email", "T2", { text: "beta" });
    const a = render(
      <Harness>
        <EmailReplyComposer emailId="e1" threadId="T1" />
      </Harness>,
    );
    const b = render(
      <Harness>
        <EmailReplyComposer emailId="e2" threadId="T2" />
      </Harness>,
    );
    expect(getTextarea(a.container).value).toBe("alpha");
    expect(getTextarea(b.container).value).toBe("beta");
  });

  // tst_fe_composer_023 — INV-4 success clears draft + localStorage
  it("tst_fe_composer_023 successful email.reply clears draft + localStorage entry for email:<threadId>", async () => {
    rpcImpl = (): Promise<unknown> => Promise.resolve({ ok: true });
    const { container } = render(
      <Harness>
        <EmailReplyComposer emailId="e1" threadId="T1" />
      </Harness>,
    );
    const ta = getTextarea(container);
    fireEvent.change(ta, { target: { value: "thanks" } });

    const rawBefore = localStorage.getItem(STORAGE_KEY);
    const parsedBefore = JSON.parse(rawBefore ?? "{}") as Record<string, unknown>;
    expect(parsedBefore["email:T1"]).toBeDefined();

    clickSend(container);
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });

    const rawAfter = localStorage.getItem(STORAGE_KEY);
    const parsedAfter = JSON.parse(rawAfter ?? "{}") as Record<string, unknown>;
    expect(parsedAfter["email:T1"]).toBeUndefined();
    expect(getTextarea(container).value).toBe("");
  });

  // tst_fe_composer_037 — INV-4 success also clears attachment IDs.
  // Guards against a regression that would leave stale `attachment_ids`
  // in the draft and silently re-attach files to the next reply on the
  // same thread.
  it("tst_fe_composer_037 successful email.reply clears attachments (not just text)", async () => {
    writeDraftDirect("email", "T1", {
      text: "thanks",
      attachments: ["att-1"],
      attachmentMeta: [{ id: "att-1", name: "a.pdf" }],
    });
    const sent: unknown[] = [];
    rpcImpl = (_m, p): Promise<unknown> => {
      sent.push(p);
      return Promise.resolve({ ok: true });
    };
    const { container } = render(
      <Harness>
        <EmailReplyComposer emailId="e1" threadId="T1" />
      </Harness>,
    );

    clickSend(container);
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });

    // Draft gone from storage entirely.
    const rawAfter = localStorage.getItem(STORAGE_KEY);
    const parsedAfter = JSON.parse(rawAfter ?? "{}") as Record<string, unknown>;
    expect(parsedAfter["email:T1"]).toBeUndefined();

    // Send carried the attachment once.
    expect(sent).toHaveLength(1);
    expect((sent[0] as { attachment_ids: string[] }).attachment_ids).toEqual(["att-1"]);

    // Typing again on a fresh draft must NOT resurrect the old attachment.
    const ta = getTextarea(container);
    fireEvent.change(ta, { target: { value: "next" } });
    clickSend(container);
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });
    expect((sent[1] as { attachment_ids: string[] }).attachment_ids).toEqual([]);
  });

  // tst_fe_composer_024 — INV-5 rejection preserves text + localStorage
  it("tst_fe_composer_024 rejected email.reply preserves text + localStorage entry", async () => {
    rpcImpl = (): Promise<unknown> => Promise.reject(new Error("boom"));
    const { container } = render(
      <Harness>
        <EmailReplyComposer emailId="e1" threadId="T1" />
      </Harness>,
    );
    const ta = getTextarea(container);
    fireEvent.change(ta, { target: { value: "thanks" } });
    clickSend(container);

    await act(async () => { await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });

    expect(getTextarea(container).value).toBe("thanks");
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = JSON.parse(raw ?? "{}") as Record<string, { text: string }>;
    expect(parsed["email:T1"]?.text).toBe("thanks");
  });

  // tst_fe_composer_025 — INV-11 paperclip present in email mode
  it("tst_fe_composer_025 email mode: paperclip button IS present in DOM", () => {
    const { container } = render(
      <Harness>
        <EmailReplyComposer emailId="e1" threadId="T1" />
      </Harness>,
    );
    const attachButtons = container.querySelectorAll('[title="Attach"]');
    expect(attachButtons.length).toBe(1);
  });

  // tst_fe_composer_026 — email.reply payload shape
  it("tst_fe_composer_026 email.reply RPC carries {email_id, body_text, attachment_ids}", async () => {
    writeDraftDirect("email", "T1", { text: "body here", attachments: ["att-1", "att-2"] });
    rpcImpl = (): Promise<unknown> => Promise.resolve({ ok: true });
    const { container } = render(
      <Harness>
        <EmailReplyComposer emailId="e-42" threadId="T1" />
      </Harness>,
    );
    clickSend(container);
    await act(async () => { await Promise.resolve(); });

    expect(rpcSpy).toHaveBeenCalledTimes(1);
    const [method, params] = firstRpcCall();
    expect(method).toBe("email.reply");
    expect(params).toEqual({
      email_id: "e-42",
      body_text: "body here",
      attachment_ids: ["att-1", "att-2"],
    });
  });

  // tst_fe_composer_027 — attachments persist across remount
  it("tst_fe_composer_027 draft attachments persist across remount (via useComposerDraft storage)", async () => {
    writeDraftDirect("email", "T1", { text: "first", attachments: ["att-1"] });

    // First mount: verify draft attachments are observed via outgoing RPC payload.
    rpcImpl = (): Promise<unknown> => Promise.resolve({ ok: true });
    const first = render(
      <Harness>
        <EmailReplyComposer emailId="e1" threadId="T1" />
      </Harness>,
    );
    first.unmount();

    // Second mount (simulating remount / reload scenario): storage still carries attachments.
    const second = render(
      <Harness>
        <EmailReplyComposer emailId="e1" threadId="T1" />
      </Harness>,
    );
    clickSend(second.container);
    await act(async () => { await Promise.resolve(); });

    expect(rpcSpy).toHaveBeenCalledTimes(1);
    const [, params] = firstRpcCall();
    expect((params as { attachment_ids: readonly string[] }).attachment_ids).toEqual([
      "att-1",
    ]);
  });

  // tst_fe_composer_031 — DEC-18 composer.apply set_text updates textarea
  it("tst_fe_composer_031 composer.apply set_text with matching (mode, thread_key) updates textarea", () => {
    const { container } = render(
      <Harness>
        <EmailReplyComposer emailId="e1" threadId="T1" />
      </Harness>,
    );
    act(() => {
      emitApply({
        mode: "email",
        thread_key: "T1",
        revision: 1,
        op: "set_text",
        text: "drafted by agent",
      });
    });
    expect(getTextarea(container).value).toBe("drafted by agent");
  });

  // tst_fe_composer_033 — INV-11 picker → upload → chip
  it("tst_fe_composer_033 clicking paperclip opens picker; selecting a file triggers upload; chip appears; draft.attachments contains id", async () => {
    const { container } = render(
      <Harness>
        <EmailReplyComposer emailId="e1" threadId="T1" />
      </Harness>,
    );

    // Paperclip is interactive (click handler attached).
    const attachBtn = container.querySelector<HTMLButtonElement>('button[title="Attach"]');
    if (!attachBtn) throw new Error("attach button not found");
    expect(attachBtn.disabled).toBe(false);
    fireEvent.click(attachBtn);

    // Simulate the native picker returning a file via the hidden input.
    const input = container.querySelector<HTMLInputElement>(
      'input[data-testid="email-attachment-input"]',
    );
    if (!input) throw new Error("hidden file input not found");
    const file = new File(["hello"], "report.pdf", { type: "application/pdf" });
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    fireEvent.change(input);

    await waitFor(() => {
      expect(uploadSpy).toHaveBeenCalledTimes(1);
    });

    // Chip rendered with the file name.
    await waitFor(() => {
      const chip = container.querySelector('[data-testid="composer-attachment-chip"]');
      expect(chip).not.toBeNull();
      expect(chip?.textContent).toContain("report.pdf");
    });

    // draft.attachments persisted to localStorage contains the uploaded id.
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = JSON.parse(raw ?? "{}") as Record<
      string,
      { attachments?: readonly string[] }
    >;
    expect(parsed["email:T1"]?.attachments).toContain("att-report.pdf");
  });

  // tst_fe_composer_034 — INV-11 remove chip → id dropped from outbound payload
  it("tst_fe_composer_034 removing a chip drops it from chips + outbound attachment_ids", async () => {
    writeDraftDirect("email", "T1", {
      text: "hello",
      attachments: ["att-a", "att-b"],
      attachmentMeta: [
        { id: "att-a", name: "a.pdf" },
        { id: "att-b", name: "b.pdf" },
      ],
    });
    rpcImpl = (): Promise<unknown> => Promise.resolve({ ok: true });

    const { container } = render(
      <Harness>
        <EmailReplyComposer emailId="e1" threadId="T1" />
      </Harness>,
    );

    // Two chips initially.
    expect(
      container.querySelectorAll('[data-testid="composer-attachment-chip"]').length,
    ).toBe(2);

    // Click × on the first chip (att-a).
    const chipA = container.querySelector(
      '[data-attachment-id="att-a"] button[title="Remove attachment"]',
    );
    if (!chipA) throw new Error("remove button for att-a not found");
    fireEvent.click(chipA);

    await waitFor(() => {
      expect(
        container.querySelectorAll('[data-testid="composer-attachment-chip"]').length,
      ).toBe(1);
    });

    clickSend(container);
    await act(async () => { await Promise.resolve(); });

    expect(rpcSpy).toHaveBeenCalledTimes(1);
    const [, params] = firstRpcCall();
    expect((params as { attachment_ids: readonly string[] }).attachment_ids).toEqual([
      "att-b",
    ]);
  });

  // tst_fe_composer_035 — INV-11 upload failure: text preserved, no chip, error visible
  it("tst_fe_composer_035 upload failure preserves draft text; chip not added; error surfaced", async () => {
    uploadImpl = (): Promise<UploadedFile> =>
      Promise.reject(new Error("Upload failed: 500 Internal Server Error"));

    const { container } = render(
      <Harness>
        <EmailReplyComposer emailId="e1" threadId="T1" />
      </Harness>,
    );

    const ta = getTextarea(container);
    fireEvent.change(ta, { target: { value: "important draft" } });

    const input = container.querySelector<HTMLInputElement>(
      'input[data-testid="email-attachment-input"]',
    );
    if (!input) throw new Error("hidden file input not found");
    const file = new File(["x"], "bad.pdf", { type: "application/pdf" });
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    fireEvent.change(input);

    await waitFor(() => {
      expect(uploadSpy).toHaveBeenCalledTimes(1);
    });

    // Error text surfaced.
    await waitFor(() => {
      const alert = container.querySelector('[role="alert"]');
      expect(alert).not.toBeNull();
      expect(alert?.textContent ?? "").toMatch(/Upload failed/);
    });

    // Text preserved.
    expect(getTextarea(container).value).toBe("important draft");
    // No chip added.
    expect(
      container.querySelectorAll('[data-testid="composer-attachment-chip"]').length,
    ).toBe(0);
  });

  // tst_fe_composer_036 — INV-11 chips + ids persist across remount
  it("tst_fe_composer_036 chips + attachment IDs persist across remount", () => {
    writeDraftDirect("email", "T1", {
      text: "draft body",
      attachments: ["att-1", "att-2"],
      attachmentMeta: [
        { id: "att-1", name: "one.pdf", mimeType: "application/pdf" },
        { id: "att-2", name: "two.jpg", mimeType: "image/jpeg" },
      ],
    });

    const first = render(
      <Harness>
        <EmailReplyComposer emailId="e1" threadId="T1" />
      </Harness>,
    );
    expect(
      first.container.querySelectorAll('[data-testid="composer-attachment-chip"]').length,
    ).toBe(2);
    first.unmount();

    const second = render(
      <Harness>
        <EmailReplyComposer emailId="e1" threadId="T1" />
      </Harness>,
    );
    const chips = second.container.querySelectorAll('[data-testid="composer-attachment-chip"]');
    expect(chips.length).toBe(2);
    expect(chips[0]?.textContent).toContain("one.pdf");
    expect(chips[1]?.textContent).toContain("two.jpg");
    expect(chips[0]?.querySelector("svg.lucide-file-text")).not.toBeNull();
    expect(chips[1]?.querySelector("svg.lucide-file-image")).not.toBeNull();
  });

  // tst_fe_composer_032 — composer.apply set_attachments updates draft attachments
  it("tst_fe_composer_032 composer.apply set_attachments updates draft attachments forwarded to email.reply", async () => {
    rpcImpl = (): Promise<unknown> => Promise.resolve({ ok: true });
    const { container } = render(
      <Harness>
        <EmailReplyComposer emailId="e-99" threadId="T1" />
      </Harness>,
    );
    const ta = getTextarea(container);
    fireEvent.change(ta, { target: { value: "hello" } });

    act(() => {
      emitApply({
        mode: "email",
        thread_key: "T1",
        revision: 1,
        op: "set_attachments",
        attachment_ids: ["att-X", "att-Y"],
      });
    });

    clickSend(container);
    await act(async () => { await Promise.resolve(); });

    expect(rpcSpy).toHaveBeenCalledTimes(1);
    const [, params] = firstRpcCall();
    expect((params as { attachment_ids: readonly string[] }).attachment_ids).toEqual([
      "att-X",
      "att-Y",
    ]);
  });
});
