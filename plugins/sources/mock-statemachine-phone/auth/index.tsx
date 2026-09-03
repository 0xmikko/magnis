import { useState } from "react";
import type { FormEvent, JSX } from "react";

export interface SourceAuthScreenProps {
  sourceId: string;
  submit: (step: "phone" | "code" | "password", value: string) => Promise<void>;
  exec: (op: "begin" | "step") => Promise<{ status: string }>;
  onConnected?: () => void;
}

type Phase = "phone" | "code" | "password" | "connected";

/** Minimal host-driven screen for the deterministic three-step phone fixture. */
export default function FixturePhoneAuthScreen({
  submit,
  exec,
  onConnected,
}: SourceAuthScreenProps): JSX.Element {
  const [phase, setPhase] = useState<Phase>("phone");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const advance = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (value === "" || phase === "connected") return;
    setBusy(true);
    setError(null);
    try {
      if (phase === "phone") {
        await submit("phone", value);
        await exec("begin");
        setPhase("code");
      } else {
        await submit(phase, value);
        const result = await exec("step");
        if (result.status === "password_required") {
          setPhase("password");
        } else if (result.status === "connected") {
          setPhase("connected");
          onConnected?.();
        } else {
          throw new Error(`unexpected status ${result.status}`);
        }
      }
      setValue("");
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  if (phase === "connected") {
    return <p className="text-sm text-content">Fixture phone account connected.</p>;
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={(event) => void advance(event)}>
      <label className="text-sm text-content-secondary">
        {phase === "phone" ? "Phone" : phase === "code" ? "Code" : "Password"}
      </label>
      <input
        value={value}
        type={phase === "password" ? "password" : "text"}
        onChange={(event) => {
          setValue(event.target.value);
        }}
        disabled={busy}
        className="w-full rounded-lg bg-surface-tertiary border border-edge px-3 py-2.5 text-sm text-content"
      />
      {error === null ? null : <p className="text-sm text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={busy || value === ""}
        className="w-full rounded-lg bg-[#2AABEE] px-4 py-2.5 text-sm font-medium text-white border-none disabled:opacity-50"
      >
        Continue
      </button>
    </form>
  );
}
