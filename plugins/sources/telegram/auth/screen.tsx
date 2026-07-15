/**
 * Telegram connect screen (per-source auth UI, DEC-3).
 *
 * phone_code is a multi-step MTProto login with NO browser redirect: the screen
 * collects the phone number, then the SMS/app login code, then (if the account
 * has 2FA) the password — handing each to the host, which stashes it and injects
 * it into the connector's `magnis.auth.begin` / `magnis.auth.step` calls (DEC-24).
 * No secret ever lives in this component beyond the moment it is handed off; the
 * minted session credential never returns to the browser (DEC-14 / CON-3).
 *
 * Loaded + transpiled by the host (`loadSourceAuthScreen`). The host injects the
 * session drivers as props so this screen never touches the transport itself:
 * `submit(step, value)` → `source.auth.submit`; `exec(op)` → `source.auth.exec`
 * (resolves to `{ status }` = `code_sent` | `password` | `connected`). Uses only
 * plain elements + Tailwind (no `@magnis/host/ui` dependency).
 */
import { useRef, useState } from "react";

export interface SourceAuthScreenProps {
  sourceId: string;
  submit: (step: "phone" | "code" | "password", value: string) => Promise<void>;
  exec: (op: "begin" | "step") => Promise<{ status: string }>;
  onConnected?: () => void;
}

type Phase = "phone" | "code" | "password" | "connected";

/** Telegram login codes are 5 digits. */
const CODE_LEN = 5;

/**
 * Segmented one-time-code input: `length` single-digit cells, digits only,
 * auto-advancing focus, backspace-aware, and paste-distributing. Never holds
 * more than `length` digits. Calls `onComplete` once the last cell is filled.
 */
function CodeCells({
  length,
  value,
  onChange,
  onComplete,
  disabled,
}: {
  length: number;
  value: string;
  onChange: (v: string) => void;
  onComplete: (code: string) => void;
  disabled: boolean;
}): JSX.Element {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const focus = (i: number): void => {
    refs.current[Math.max(0, Math.min(i, length - 1))]?.focus();
  };
  const apply = (i: number, raw: string): void => {
    const digits = raw.replace(/\D/g, "");
    if (!digits) return;
    let next: string;
    if (digits.length === 1) {
      // replace-in-place, then step forward
      next = (value.slice(0, i) + digits + value.slice(i + 1)).slice(0, length);
      onChange(next);
      focus(i + 1);
    } else {
      // paste: fill from this cell onward
      next = (value.slice(0, i) + digits).replace(/\D/g, "").slice(0, length);
      onChange(next);
      focus(next.length);
    }
    // Pass the completed code EXPLICITLY — the parent's `value` state hasn't
    // re-rendered yet after onChange, so reading it in the auto-submit would
    // be stale (the bug behind "missing _meta.code").
    if (next.length === length) onComplete(next);
  };
  const onKeyDown = (i: number, e: { key: string; preventDefault: () => void }): void => {
    if (e.key === "Backspace") {
      e.preventDefault();
      if (value[i]) {
        onChange(value.slice(0, i) + value.slice(i + 1));
        focus(i);
      } else if (i > 0) {
        onChange(value.slice(0, i - 1) + value.slice(i));
        focus(i - 1);
      }
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      focus(i - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      focus(i + 1);
    }
  };
  // Geometry is inline (not Tailwind): utility classes used ONLY in a plugin
  // auth screen aren't scanned into the host's compiled CSS, so w-/h- classes
  // would silently no-op. Colours reuse classes the host already ships.
  return (
    <div style={{ display: "flex", justifyContent: "center", gap: 8 }}>
      {Array.from({ length }, (_, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          value={value[i] ?? ""}
          inputMode="numeric"
          maxLength={1}
          autoFocus={i === 0}
          disabled={disabled}
          onChange={(e) => {
            apply(i, e.target.value);
          }}
          onKeyDown={(e) => {
            onKeyDown(i, e);
          }}
          onPaste={(e) => {
            e.preventDefault();
            apply(i, e.clipboardData.getData("text"));
          }}
          style={{ width: 44, height: 52, textAlign: "center", fontSize: 18, fontWeight: 500 }}
          className="rounded-lg bg-surface-tertiary border border-edge text-content outline-none focus:border-content-muted disabled:opacity-50"
        />
      ))}
    </div>
  );
}

export default function TelegramAuthScreen({
  submit,
  exec,
  onConnected,
}: SourceAuthScreenProps): JSX.Element {
  const [phase, setPhase] = useState<Phase>("phone");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Dedupe overlapping submits (auto-complete + Enter + click).
  const submitting = useRef(false);

  const advance = async (override?: string): Promise<void> => {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    // Prefer the explicitly-passed value (auto-submit) over `value` state,
    // which may not have re-rendered yet.
    const current = override ?? value;
    try {
      if (phase === "phone") {
        await submit("phone", current);
        await exec("begin");
        setPhase("code");
      } else {
        await submit(phase, current);
        const { status } = await exec("step");
        if (status === "password") setPhase("password");
        else if (status === "connected") {
          setPhase("connected");
          onConnected?.();
        }
      }
      setValue("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      submitting.current = false;
    }
  };

  if (phase === "connected") {
    return <p className="text-sm text-content">Telegram connected.</p>;
  }

  const label =
    phase === "phone"
      ? "Phone number (with country code)"
      : phase === "code"
        ? "Login code"
        : "Two-factor password";

  const isCode = phase === "code";
  // The code phase requires all CODE_LEN digits; other phases just non-empty.
  const canSubmit = !busy && (isCode ? value.length === CODE_LEN : value.length > 0);
  return (
    // A real form so Enter in the field submits (the default action), not just
    // a mouse click on the button.
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit) void advance();
      }}
    >
      <label className="text-[13px] text-content-secondary">{label}</label>
      {isCode ? (
        <CodeCells
          length={CODE_LEN}
          value={value}
          onChange={setValue}
          onComplete={(code) => {
            if (!busy) void advance(code);
          }}
          disabled={busy}
        />
      ) : (
        <input
          className="w-full rounded-lg bg-surface-tertiary border border-edge px-3 py-2.5 text-sm text-content outline-none focus:border-content-muted"
          value={value}
          type={phase === "password" ? "password" : "text"}
          autoFocus
          placeholder={phase === "phone" ? "+1 234 567 8900" : ""}
          onChange={(e) => {
            setValue(e.target.value);
          }}
        />
      )}
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full rounded-lg bg-[#2AABEE] px-4 py-2.5 text-sm font-medium text-white cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed border-none"
      >
        {phase === "phone" ? "Send code" : "Continue"}
      </button>
    </form>
  );
}
