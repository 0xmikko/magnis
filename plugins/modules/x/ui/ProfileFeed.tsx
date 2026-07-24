import { useState, type JSX } from "react";
import { useQuery } from "@tanstack/react-query";
import { Icon, Row, Scrollable, SearchableTabs, Stack, Text } from "@magnis/host/ui";
import type { DetailPanelProps } from "@magnis/host/base";
import type { PaginatedResponse } from "@magnis/plugin-sdk";
import { groupThreads, PostCard, ThreadCard, type RichPost } from "./PostCard";

export interface ProfileDetail {
  id: string;
  handle: string | null;
  display_name: string | null;
  follower_count: number | null;
  bio: string | null;
  url: string | null;
  avatar_url: string | null;
}

const TABS = [
  { id: "posts", label: "Posts" },
  { id: "profile", label: "Profile" },
] as const;

// Detail BODY: the standard SearchableTabs bar (same visual as contacts'
// OVERVIEW/MEMORY/FILES) with module tabs Posts / Profile. Header facts live
// in ProfileHeader; everything here is design-system primitives only.
export function XProfileFeed({ entityId, runtime }: DetailPanelProps): JSX.Element {
  const [activeTab, setActiveTab] = useState<string>("posts");

  const { data: profile } = useQuery({
    queryKey: ["x", "profile", entityId],
    queryFn: () => runtime.transport.rpc<ProfileDetail>("x.profiles.get", { id: entityId }),
    enabled: !!entityId,
  });
  const handle = profile?.handle ?? undefined;
  const { data: feed } = useQuery({
    queryKey: ["x", "feed", handle],
    queryFn: () =>
      runtime.transport.rpc<PaginatedResponse<RichPost>>("x.posts.list", {
        author_handle: handle,
        limit: 50,
      }),
    enabled: !!handle,
  });
  const posts = feed?.items ?? [];
  const author = {
    name: profile?.display_name ?? null,
    handle: profile?.handle ?? null,
    avatar_url: profile?.avatar_url ?? null,
  };

  return (
    <Scrollable>
      <SearchableTabs tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />
      <div className="px-5 py-4">
        {activeTab === "posts" ? (
          posts.length === 0 ? (
            <Text variant="caption" color="tertiary">
              No posts yet.
            </Text>
          ) : (
            <Stack gap={3}>
              {groupThreads(posts).map((thread) => {
                const first = thread[0];
                if (!first) return null;
                return thread.length === 1 ? (
                  <PostCard key={first.id} post={first} author={author} />
                ) : (
                  <ThreadCard key={first.id} posts={thread} author={author} />
                );
              })}
            </Stack>
          )
        ) : (
          <Stack gap={6}>
            {profile?.bio && (
              <Stack gap={1}>
                <Text variant="caption" weight="semibold" color="tertiary">
                  About
                </Text>
                <Text
                  variant="body"
                  color="secondary"
                  leading="relaxed"
                  className="whitespace-pre-wrap"
                >
                  {profile.bio}
                </Text>
              </Stack>
            )}
            {profile?.handle && (
              <Stack gap={1}>
                <Text variant="caption" weight="semibold" color="tertiary">
                  Handle
                </Text>
                <Text variant="body" color="secondary">
                  @{profile.handle}
                </Text>
              </Stack>
            )}
            {typeof profile?.follower_count === "number" && (
              <Stack gap={1}>
                <Text variant="caption" weight="semibold" color="tertiary">
                  Followers
                </Text>
                <Text variant="body" color="secondary">
                  {profile.follower_count.toLocaleString()}
                </Text>
              </Stack>
            )}
            {profile?.url && (
              <Stack gap={1}>
                <Text variant="caption" weight="semibold" color="tertiary">
                  Profile
                </Text>
                <Row gap={2} align="center">
                  <Icon name="link" size={14} className="text-content-tertiary shrink-0" />
                  <a
                    href={profile.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-accent hover:underline"
                  >
                    {profile.url}
                  </a>
                </Row>
              </Stack>
            )}
          </Stack>
        )}
      </div>
    </Scrollable>
  );
}
