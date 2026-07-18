import { useEffect, useRef } from "react";
import { useAppRuntime } from "@magnis/host/runtime";

export function useTelegramSync(onRefreshChats: () => void): void {
  const runtime = useAppRuntime();

  const onRefreshChatsRef = useRef(onRefreshChats);
  onRefreshChatsRef.current = onRefreshChats;

  useEffect(() => {
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    const debouncedRefresh = () => {
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

    return () => {
      offSyncProgress();
      if (refreshTimer) clearTimeout(refreshTimer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
