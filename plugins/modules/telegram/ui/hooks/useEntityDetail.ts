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
      .catch(() => undefined);
    return (): void => { cancelled = true; };
  }, [entityId, data, runtime, rpcMethod, hasDataCheck]);

  return detail ?? data;
}

export const hasMessageData = (d: Readonly<Record<string, unknown>>): boolean =>
  Boolean(d.sender) || Boolean(d.preview) || Boolean(d.subject);

export const hasChatData = (d: Readonly<Record<string, unknown>>): boolean =>
  Boolean(d.chat_title) || Boolean(d.last_message);
