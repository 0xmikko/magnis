// ProbeAuth: anysite has no whoami — the cheapest REAL
// verification is resolving one stable public profile (costs 1 credit,
// paid once per explicit user provision). anysite keys carry no identity,
// so the subject is the masked key. Extracted for unit tests (the probe contract).

import { AnysiteClient, type FetchLike } from "./api";

export async function probeLinkedInAuth(
  meta: Record<string, unknown> | undefined,
  fetchFn: FetchLike,
): Promise<{ subject: string }> {
  const key = typeof meta?.api_key === "string" ? meta.api_key : "";
  if (!key) throw new Error("anysite: missing api_key");
  const client = new AnysiteClient(key, fetchFn);
  const profile = await client.resolveProfile("linkedin");
  if (!profile) throw new Error("anysite: probe resolved no profile — key rejected");
  return { subject: `anysite …${key.slice(-4)}` };
}
