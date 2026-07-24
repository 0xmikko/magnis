import type { JSX } from "react";
import { Icon } from "@magnis/host/ui";
import { useAppRuntime } from "@magnis/host/runtime";
import { resolveAvatarUrl } from "./helpers";
import type { ListItemContentProps } from "@magnis/host/base";

function ChatAvatar({
  initials,
  color,
  avatarUrl,
}: {
  readonly initials: string;
  readonly color: string;
  readonly avatarUrl?: string;
}): JSX.Element {
  return (
    <div
      className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 overflow-hidden"
      style={{ backgroundColor: color }}
    >
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt=""
          className="w-full h-full object-cover"
        />
      ) : (
        <span className="text-white font-semibold text-sm">{initials}</span>
      )}
    </div>
  );
}

function UnreadBadge({
  count,
}: {
  readonly count: number;
}): JSX.Element {
  return (
    <div className="min-w-[22px] h-[22px] rounded-full bg-green flex items-center justify-center px-1">
      <span className="text-white text-[11px] font-bold leading-none">
        {count}
      </span>
    </div>
  );
}

export function TelegramChatItemContent({
  item,
}: ListItemContentProps): JSX.Element {
  const runtime = useAppRuntime();
  const initials = (item.metadata?.initials as string | undefined) ?? "?";
  const avatarColor = (item.metadata?.avatarColor as string | undefined) ?? "#4A90D9";
  const avatarUrl = resolveAvatarUrl(runtime.transport.baseUrl, item.avatar_url ?? null);
  const muted = item.metadata?.muted as boolean | undefined;
  const unreadCount = item.unread_count;
  const isIndexed = item.metadata?.isIndexed as boolean | undefined;

  return (
    <>
      <ChatAvatar
        initials={initials}
        color={avatarColor}
        avatarUrl={avatarUrl}
      />
      <div className="flex-1 min-w-0 flex flex-col gap-1 justify-center">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 min-w-0">
            <span
              className={`list-item-title truncate ${
                unreadCount ? "font-semibold" : "font-medium"
              }`}
            >
              {item.name ?? "Chat"}
            </span>
            {muted && (
              <Icon
                name="bell-off"
                size={12}
                className="text-content-muted shrink-0"
              />
            )}
            {isIndexed === false && (
              <Icon
                name="circle-alert"
                size={12}
                className="text-content-muted shrink-0"
              />
            )}
          </div>
          <span className="list-item-meta shrink-0 ml-2">
            {item.timestamp ?? ""}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`list-item-secondary truncate flex-1 ${
              unreadCount
                ? "text-content-secondary"
                : "text-content-tertiary"
            }`}
          >
            {item.preview ?? ""}
          </span>
          {item.is_pinned && !unreadCount && (
            <Icon
              name="pin"
              size={14}
              className="text-content-muted shrink-0"
            />
          )}
          {unreadCount !== undefined && unreadCount > 0 && (
            <UnreadBadge count={unreadCount} />
          )}
        </div>
      </div>
    </>
  );
}
