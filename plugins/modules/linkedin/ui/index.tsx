import type { JSX } from "react";
import { defineModule } from "@magnis/host/base";
import { setupEventInvalidation } from "@magnis/host/runtime";
import { proxiedMediaUrl } from "./PostCard";
import { LinkedInPostCard, LinkedInProfileCard } from "./EntityCards";
import { LinkedInProfileFeed } from "./ProfileFeed";
import { LinkedInProfileHeader } from "./ProfileHeader";
import { AddProfileAction } from "./AddProfileAction";

// Brand glyph shipped IN the plugin (plugins/linkedin/ui/icon.svg) and served by
// the backend from the plugin store — no external hosting (plugin-icon-standard).
// Rendered as a CSS mask filled with currentColor: rail icons are ALWAYS
// monochrome and must follow the rail's active/hover text color like lucide.
const ICON_URL = "/api/plugins/linkedin/ui/icon.svg";

function LinkedInIcon(): JSX.Element {
  return (
    <span
      role="img"
      aria-label="LinkedIn"
      className="inline-block h-[22px] w-[22px] bg-current"
      style={{
        maskImage: `url(${ICON_URL})`,
        maskRepeat: "no-repeat",
        maskSize: "contain",
        maskPosition: "center",
        WebkitMaskImage: `url(${ICON_URL})`,
        WebkitMaskRepeat: "no-repeat",
        WebkitMaskSize: "contain",
        WebkitMaskPosition: "center",
      }}
    />
  );
}

// LinkedIn module UI — list = tracked PEOPLE (profiles); main view = the selected
// person's profile header + their post feed (ProfileFeed). Read-only.
export const LinkedinModule = defineModule({
  id: "linkedin",
  title: "LinkedIn",
  icon: <LinkedInIcon />,
  iconName: "briefcase",
  themeColor: "purple",
  entityTypes: ["profile", "post"],
  // Per-type entity cards: a profile in a contact\u2019s dynamic tab is an
  // identity card, not a post (social-contact-identity S4/INV-2).
  entityLabels: { profile: { EntityCard: LinkedInProfileCard } },
  primaryEntityType: "profile",
  // List the tracked profiles (people), not posts.
  rpc: { list: "linkedin.profiles.list", get: "linkedin.profiles.get" },
  mapListItem: (raw) => {
    const handle = raw.handle ? String(raw.handle) : "";
    const fc = typeof raw.follower_count === "number" ? raw.follower_count : null;
    // LA-2: a tracked-but-not-yet-synced placeholder reads "Syncing…" — the
    // honest optimistic state right after "+"; replaced by the real profile
    // on the next sync cycle.
    const pending = raw.pending === true;
    return {
      id: String(raw.id ?? ""),
      name: raw.display_name ? String(raw.display_name) : handle || "Profile",
      schema_id: "linkedin.profile",
      preview: pending
        ? `@${handle} · Syncing…`
        : handle
          ? `@${handle}${fc != null ? ` · ${fc.toLocaleString()} followers` : ""}`
          : null,
      timestamp: null,
      avatar_url: raw.avatar_url ? proxiedMediaUrl(String(raw.avatar_url)) : null,
    };
  },
  // STANDARD detail: DetailPane + TopBarHeader via the framework path; the
  // header extends the standard TopBarHeader through HeaderComponent (bio +
  // profile link in its `extra` slot, like email's To/Reply-To rows) and the
  // panel is only the BODY (posts). NEVER detailType:"custom" for headers.
  // "+" add-profile input (S5): LinkedIn only — X friends come from the API.
  HeaderActions: AddProfileAction,
  HeaderComponent: LinkedInProfileHeader,
  DetailPanel: LinkedInProfileFeed,
  // Kept for agent-context rendering of individual posts.
  EntityCard: LinkedInPostCard,
  // Live refresh (telegram/email precedent): the scheduler emits sync.progress
  // after every ingest cycle — invalidate the whole ["linkedin"] query tree so
  // the list, feed and profile refetch without a manual reload.
  extraSetup: (runtime) => {
    const unsub = setupEventInvalidation(
      runtime.transport,
      runtime.queryClient,
      ["sync.progress"],
      [["linkedin"]],
    );
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    return () => { unsub(); };
  },
});
