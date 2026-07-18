import { useCallback, useRef, type JSX } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Avatar,
  ContextMenu,
  Icon,
  IconButton,
  Row,
  Stack,
  Tag,
  Text,
  TOPBAR_AVATAR_SIZE,
  TopBarHeader,
  useContextMenu,
} from "@magnis/host/ui";
import type { ContextMenuEntry } from "@magnis/host/ui";
import { initialsFromName } from "@magnis/host/utils";
import type { HeaderComponentProps } from "@magnis/host/base";
import type { ProfileDetail } from "./ProfileFeed";
import { proxiedMediaUrl } from "./PostCard";

const PLATFORM = "x";

interface TrackingByHandle {
  contact_id: string;
  tracked: boolean;
  handle: string;
}

// Standard TopBarHeader with the profile facts in its `extra` slot (the same
// extension mechanism the email header uses for To/Reply-To rows): bio line +
// the external profile link, as caption rows under the subtitle.
function ProfileHeaderExtra({ bio, url }: { bio?: string | null; url?: string | null }): JSX.Element | null {
  if (!bio && !url) return null;
  return (
    <Stack gap={0.5} className="mt-0.5">
      {bio && (
        <Text variant="caption" color="secondary" truncate>
          {bio}
        </Text>
      )}
      {url && (
        <Row gap={1} align="center">
          <Icon name="link" size={12} className="text-content-tertiary shrink-0" />
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="truncate text-xs text-accent hover:underline"
          >
            {url}
          </a>
        </Row>
      )}
    </Stack>
  );
}

export function XProfileHeader({
  entityId,
  entityName,
  themeColor,
  runtime,
  onRename,
}: HeaderComponentProps): JSX.Element {
  const queryClient = useQueryClient();
  const menu = useContextMenu<null>();
  const menuBtnRef = useRef<HTMLDivElement>(null);

  // IconButton's onClick carries no event — synthesize the menu position from
  // the button rect (telegram header-menu pattern).
  const openMenu = useCallback(() => {
    const rect = menuBtnRef.current?.getBoundingClientRect();
    if (!rect) return;
    menu.open(
      {
        clientX: rect.right,
        clientY: rect.bottom,
        preventDefault: () => {
          /* noop */
        },
      } as React.MouseEvent,
      null,
    );
  }, [menu]);

  const { data: profile } = useQuery({
    queryKey: ["x", "profile", entityId],
    queryFn: () => runtime.transport.rpc<ProfileDetail>("x.profiles.get", { id: entityId }),
    enabled: !!entityId,
  });
  const handle = profile?.handle ?? undefined;

  // INV-6: tracked state resolved from the contacts facet by handle (DEC-A).
  const trackingKey = [PLATFORM, "tracking", handle];
  const { data: tracking } = useQuery({
    queryKey: trackingKey,
    queryFn: () =>
      runtime.transport.rpc<TrackingByHandle | null>("contacts.get_social_tracking_by_handle", {
        platform: PLATFORM,
        handle,
      }),
    enabled: !!handle,
  });

  const setTracking = useMutation({
    mutationFn: (tracked: boolean) => {
      if (!tracking) throw new Error("x tracking record not loaded");
      return runtime.transport.rpc("contacts.set_social_tracking", {
        id: tracking.contact_id,
        platform: PLATFORM,
        tracked,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: trackingKey });
    },
  });

  // Track/Untrack only when the owning contact resolved (no contact = nothing
  // to toggle — the facet lives on the contact).
  const menuItems: ContextMenuEntry[] = [
    ...(tracking
      ? [
          tracking.tracked
            ? ({ id: "untrack", label: "Untrack on X", variant: "danger" } as const)
            : ({ id: "track", label: "Track on X" } as const),
        ]
      : []),
    ...(profile?.url ? [{ id: "open", label: "Open profile" }] : []),
  ];

  const subtitle = profile?.handle
    ? `@${profile.handle}${
        typeof profile.follower_count === "number"
          ? ` · ${profile.follower_count.toLocaleString()} followers`
          : ""
      }`
    : undefined;

  return (
    <>
      <TopBarHeader
        leading={
          <Avatar
            label={initialsFromName(entityName ?? "")}
            color={themeColor}
            size={TOPBAR_AVATAR_SIZE}
            imageSrc={proxiedMediaUrl(profile?.avatar_url ?? null) ?? undefined}
          />
        }
        title={entityName ?? "Untitled"}
        subtitle={subtitle}
        extra={<ProfileHeaderExtra bio={profile?.bio} url={profile?.url} />}
        onTitleEdit={onRename}
        actions={
          <>
            {tracking?.tracked && <Tag label="Tracked" variant="green" mode="subtle" />}
            {menuItems.length > 0 && (
              <div ref={menuBtnRef}>
                <IconButton variant="ghost" label="Profile actions" onClick={openMenu}>
                  <Icon name="ellipsis-vertical" size={15} />
                </IconButton>
              </div>
            )}
          </>
        }
      />
      {menu.state.isOpen && (
        <ContextMenu
          items={menuItems}
          position={menu.state.position}
          onSelect={(itemId) => {
            if (itemId === "untrack") setTracking.mutate(false);
            if (itemId === "track") setTracking.mutate(true);
            if (itemId === "open" && profile?.url) window.open(profile.url, "_blank", "noopener");
            menu.close();
          }}
          onClose={menu.close}
        />
      )}
    </>
  );
}
