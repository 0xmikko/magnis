import { XIcon } from "./XIcon";
import { defineModule } from "@magnis/host/base";
import { setupEventInvalidation } from "@magnis/host/runtime";
import { proxiedMediaUrl } from "./PostCard";
import { XPostCard, XProfileCard } from "./EntityCards";
import { XProfileFeed } from "./ProfileFeed";
import { XProfileHeader } from "./ProfileHeader";

// Brand glyph shipped IN the plugin (plugins/x/icon.svg, package root) and
// served by the backend from the plugin store — no external hosting
// (plugin-icon-standard). Rendered as a CSS mask filled with currentColor:
// rail icons are ALWAYS monochrome and must follow the rail's active/hover
// text color like lucide.

// X module UI — list = tracked PEOPLE (profiles); main view = the selected
// person's profile header + their post feed (ProfileFeed). Read-only.
export const XModule = defineModule({
  id: "x",
  title: "X",
  icon: <XIcon />,
  iconName: "hash",
  themeColor: "blue",
  entityTypes: ["profile", "post"],
  // Per-type entity cards: a profile in a contact\u2019s dynamic tab is an
  // identity card, not a post.
  entityLabels: { profile: { EntityCard: XProfileCard } },
  primaryEntityType: "profile",
  rpc: { list: "x.profiles.list", get: "x.profiles.get" },
  mapListItem: (raw) => {
    const handle = typeof raw.handle === "string" ? raw.handle : "";
    const fc = typeof raw.follower_count === "number" ? raw.follower_count : null;
    return {
      id: typeof raw.id === "string" ? raw.id : "",
      name: typeof raw.display_name === "string" && raw.display_name ? raw.display_name : handle || "Profile",
      schema_id: "x.profile",
      preview: handle ? `@${handle}${fc !== null ? ` · ${fc.toLocaleString()} followers` : ""}` : null,
      timestamp: null,
      avatar_url: typeof raw.avatar_url === "string" ? proxiedMediaUrl(raw.avatar_url) : null,
    };
  },
  // STANDARD detail: DetailPane + TopBarHeader via the framework path; the
  // header extends the standard TopBarHeader through HeaderComponent (bio +
  // profile link in its `extra` slot, like email's To/Reply-To rows) and the
  // panel is only the BODY (posts). NEVER detailType:"custom" for headers.
  HeaderComponent: XProfileHeader,
  DetailPanel: XProfileFeed,
  EntityCard: XPostCard,
  // Live refresh (telegram/email precedent): the scheduler emits sync.progress
  // after every ingest cycle — invalidate the whole ["x"] query tree so the
  // list, feed and profile refetch without a manual reload.
  extraSetup: (runtime) => {
    const unsub = setupEventInvalidation(
      runtime.transport,
      runtime.queryClient,
      ["sync.progress"],
      [["x"]],
    );
    return (): void => { unsub(); };
  },
});
