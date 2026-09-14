/**
 * The deterministic phone fixture's sign-in screen — a FAITHFUL twin of a
 * real one.
 *
 * It used to be the simplest thing that could pass: one text input, one
 * button it drew itself, and a comparison against the host status the
 * fixture connector happened to answer. Every one of those shortcuts hid a
 * defect that then showed up on a live stand:
 *
 *   - the real screens auto-submit the code the moment the last digit lands,
 *     so nothing is pressed and the ceremony moves under the screen;
 *   - the real screens publish their primary action, so the HOST draws it
 *     bottom-right and the body holds no button of its own;
 *   - the status the browser sees is the HOST's word (`password_required`),
 *     not the connector's (`password`) — reading the connector's spelling
 *     left a live screen frozen on the code boxes while the ceremony had
 *     already moved to the password, and every later press answered
 *     `409: auth ceremony expected password`.
 *
 * So this screen does what they do, and the E2E walk over it is what catches
 * the next one.
 *
 * @tested-by: tst_e2e_source_auth_screen_001
 * @tested-by: tst_e2e_source_auth_screen_002
 */
import { useEffect, useRef, useState } from "react";
import type { JSX } from "react";

/** What the host draws in its footer for this screen: the bottom-right
 * corner, where a person looks for the action. A screen that publishes one
 * does not draw its own. */
export interface SourceAuthPrimary {
  label: string;
  disabled: boolean;
  run: () => void;
}

export interface SourceAuthScreenProps {
  sourceId: string;
  submit: (step: "phone" | "code" | "password", value: string) => Promise<void>;
  exec: (op: "begin" | "step") => Promise<{ status: string }>;
  onConnected?: () => void;
  onPrimary?: (action: SourceAuthPrimary | null) => void;
}

type Phase = "phone" | "code" | "password" | "connected";

/** The fixture's codes are five digits, like Telegram's. */
const CODE_LEN = 5;

/** Where the ceremony stands after a code, in the HOST's words.
 *
 * A status nobody planned is an error, not a no-op: a screen that quietly
 * stays put is the defect this fixture exists to catch. */
export function phaseAfterCode(status: string): Phase {
  if (status === "password_required") return "password";
  if (status === "connected") return "connected";
  throw new Error(`unexpected sign-in status: ${status}`);
}

/** The digit boxes, and the auto-submit that comes with them: the last digit
 * sends the code, because that is what a person expects of a code field and
 * what every real screen does. */
function CodeBoxes({
  value,
  onChange,
  onComplete,
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  onComplete: (code: string) => void;
  disabled: boolean;
}): JSX.Element {
  const boxes = useRef<(HTMLInputElement | null)[]>([]);
  const focus = (index: number): void => {
    boxes.current[Math.max(0, Math.min(index, CODE_LEN - 1))]?.focus();
  };
  const take = (index: number, raw: string): void => {
    const digits = raw.replace(/\D/gu, "");
    if (digits === "") return;
    const next = digits.length === 1
      ? (value.slice(0, index) + digits + value.slice(index + 1)).slice(0, CODE_LEN)
      : (value.slice(0, index) + digits).replace(/\D/gu, "").slice(0, CODE_LEN);
    onChange(next);
    focus(digits.length === 1 ? index + 1 : next.length);
    if (next.length === CODE_LEN) onComplete(next);
  };
  return (
    <div className="flex justify-center gap-2">
      {Array.from({ length: CODE_LEN }, (_, index) => (
        <input
          key={index}
          ref={(element) => { boxes.current[index] = element; }}
          value={value[index] ?? ""}
          inputMode="numeric"
          maxLength={1}
          disabled={disabled}
          aria-label={`digit ${String(index + 1)}`}
          onChange={(event) => { take(index, event.target.value); }}
          className="h-12 w-10 rounded-lg border border-edge bg-surface-tertiary text-center text-lg text-content"
        />
      ))}
    </div>
  );
}

export default function FixturePhoneAuthScreen({
  submit,
  exec,
  onConnected,
  onPrimary,
}: SourceAuthScreenProps): JSX.Element {
  const [phase, setPhase] = useState<Phase>("phone");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** One submit at a time: auto-submit and a press can arrive together. */
  const submitting = useRef(false);

  const advance = async (override?: string): Promise<void> => {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    // The auto-submitted value, not the state, which may not have rendered.
    const current = override ?? value;
    try {
      if (phase === "phone") {
        await submit("phone", current);
        await exec("begin");
        setPhase("code");
      } else if (phase !== "connected") {
        await submit(phase, current);
        const { status } = await exec("step");
        const next = phaseAfterCode(status);
        setPhase(next);
        if (next === "connected") onConnected?.();
      }
      setValue("");
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
      submitting.current = false;
    }
  };

  const isCode = phase === "code";
  const canSubmit = !busy && (isCode ? value.length === CODE_LEN : value.length > 0);
  const actionLabel = phase === "phone" ? "Send code" : "Continue";
  // The call is rebuilt on every render, so it travels by ref and stays OUT
  // of the dependencies: an effect that runs on every render publishes on
  // every render, and a host that holds what it is given re-renders this
  // screen for it, forever.
  const latest = useRef(advance);
  latest.current = advance;
  useEffect(() => {
    onPrimary?.({
      label: actionLabel,
      disabled: !canSubmit,
      run: () => { void latest.current(); },
    });
    return (): void => { onPrimary?.(null); };
  }, [actionLabel, canSubmit, onPrimary]);

  if (phase === "connected") {
    return <p className="text-sm text-content">Fixture phone account connected.</p>;
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSubmit) void advance();
      }}
    >
      <label className="text-sm text-content-secondary">
        {phase === "phone" ? "Phone" : phase === "code" ? "Code" : "Password"}
      </label>
      {isCode ? (
        <CodeBoxes
          value={value}
          onChange={setValue}
          onComplete={(code) => { if (!busy) void advance(code); }}
          disabled={busy}
        />
      ) : (
        <input
          value={value}
          type={phase === "password" ? "password" : "text"}
          onChange={(event) => { setValue(event.target.value); }}
          disabled={busy}
          className="w-full rounded-lg bg-surface-tertiary border border-edge px-3 py-2.5 text-sm text-content"
        />
      )}
      {error === null ? null : <p className="text-sm text-red-400">{error}</p>}
      {onPrimary === undefined && (
        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white border-none disabled:opacity-50"
        >
          {actionLabel}
        </button>
      )}
    </form>
  );
}
