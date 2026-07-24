import { useEffect, useRef } from "react";
import { useAppRuntime } from "@magnis/host/runtime";

export function useTelegramSync(onRefreshChats: () => void): void {
  const runtime = useAppRuntime();

  const onRefreshChatsRef = useRef(onRefreshChats);
  // eslint-disable-next-line react-hooks/refs -- latest-ref pattern: keep the newest callback for the debounced effect without re-subscribing; not read during render.
  onRefreshChatsRef.current = onRefreshChats;

  useEffect(() => {
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    const debouncedRefresh = (): void => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        onRefreshChatsRef.current();
      }, 1000);
    };

    const offSyncProgress = runtime.transport.onEventType(["sync.progress"], (event) => {
      const raw = (event.payload ?? {}) as Record<string, unknown>;
      if (raw.module_id !== "telegram" && raw.source_id !== "telegram") return;
      debouncedRefresh();
    });

    return (): void => {
      offSyncProgress();
      if (refreshTimer) clearTimeout(refreshTimer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
