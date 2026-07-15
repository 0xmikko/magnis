import { useEffect, useState } from "react";
import type { EntityRendererProps } from "@magnis/host/runtime";

export function useEntityDetail(
  data: Readonly<Record<string, unknown>>,
  runtime: EntityRendererProps["runtime"],
  rpcMethod: string,
  hasDataCheck: (d: Readonly<Record<string, unknown>>) => boolean,
): Readonly<Record<string, unknown>> {
  const entityId = data.id as string | undefined;
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    if (hasDataCheck(data) || !entityId) return;
    let cancelled = false;
    runtime.transport
      .rpc<Record<string, unknown>>(rpcMethod, { id: entityId })
      .then((d) => { if (!cancelled) setDetail(d); })
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      .catch(() => {});
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    return () => { cancelled = true; };
  }, [entityId, data, runtime, rpcMethod, hasDataCheck]);

  return detail ?? data;
}

export const hasMessageData = (d: Readonly<Record<string, unknown>>): boolean =>
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  Boolean(d.sender || d.preview || d.subject);

export const hasChatData = (d: Readonly<Record<string, unknown>>): boolean =>
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  Boolean(d.chat_title || d.last_message);
