// plugins/modules/linkedin/ui/index.tsx
import { defineModule } from "/api/plugins/__host-shim.js?m=base";
import { setupEventInvalidation } from "/api/plugins/__host-shim.js?m=runtime";

// plugins/modules/linkedin/ui/PostCard.tsx
import { Avatar, Card, Icon, Row, Stack, Tag, Text } from "/api/plugins/__host-shim.js?m=ui";
import { initialsFromName } from "/api/plugins/__host-shim.js?m=utils";
import { jsx, jsxs } from "/api/plugins/__host-shim.js?m=react-jsx-runtime";
var PROXIED_HOSTS = ["media.licdn.com", "pbs.twimg.com"];
function proxiedMediaUrl(url) {
  if (!url)
    return null;
  try {
    if (PROXIED_HOSTS.includes(new URL(url).host)) {
      return `/api/media-proxy?url=${encodeURIComponent(url)}`;
    }
  } catch {
    return url;
  }
  return url;
}
function formatNumber(n) {
  if (n < 1000)
    return String(n);
  if (n < 1e4)
    return `${(n / 1000).toFixed(1)}K`;
  if (n < 1e6)
    return `${String(Math.round(n / 1000))}K`;
  return `${(n / 1e6).toFixed(1)}M`;
}
function relativeTime(v) {
  if (!v)
    return { label: "—", title: "" };
  const d = new Date(v);
  if (Number.isNaN(d.getTime()))
    return { label: "—", title: "" };
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  const title = d.toISOString();
  if (mins < 1)
    return { label: "just now", title };
  if (mins < 60)
    return { label: `${String(mins)}m ago`, title };
  const hours = Math.floor(mins / 60);
  if (hours < 24)
    return { label: `${String(hours)}h ago`, title };
  const days = Math.floor(hours / 24);
  if (days < 30)
    return { label: `${String(days)}d ago`, title };
  return { label: title.slice(0, 10), title };
}
function MediaGrid({ media }) {
  const items = media.filter((m) => m.url ?? m.preview_image_url);
  if (items.length === 0)
    return null;
  const cols = items.length === 1 ? "grid-cols-1" : "grid-cols-2";
  return /* @__PURE__ */ jsx("div", {
    className: `grid gap-2 ${cols}`,
    children: items.map((m, i) => /* @__PURE__ */ jsx("a", {
      href: proxiedMediaUrl(m.url ?? m.preview_image_url) ?? undefined,
      target: "_blank",
      rel: "noopener noreferrer",
      children: /* @__PURE__ */ jsx("img", {
        src: proxiedMediaUrl(m.url ?? m.preview_image_url) ?? undefined,
        alt: m.alt_text ?? "",
        loading: "lazy",
        className: "aspect-video w-full rounded-xl border border-edge object-cover"
      })
    }, `${String(m.url ?? m.preview_image_url)}-${String(i)}`))
  });
}
function MetricStat({ icon, value }) {
  if (value === null)
    return null;
  return /* @__PURE__ */ jsxs(Row, {
    gap: 1,
    align: "center",
    children: [
      /* @__PURE__ */ jsx(Icon, {
        name: icon,
        size: 14,
        className: "text-content-tertiary"
      }),
      /* @__PURE__ */ jsx(Text, {
        variant: "caption",
        children: formatNumber(value)
      })
    ]
  });
}
function MetricsRow({ metrics }) {
  if (!metrics)
    return null;
  if (metrics.replies === null && metrics.reposts === null && metrics.likes === null)
    return null;
  return /* @__PURE__ */ jsxs(Row, {
    gap: 5,
    align: "center",
    className: "mt-1",
    children: [
      /* @__PURE__ */ jsx(MetricStat, {
        icon: "message-circle",
        value: metrics.replies
      }),
      /* @__PURE__ */ jsx(MetricStat, {
        icon: "repeat-2",
        value: metrics.reposts
      }),
      /* @__PURE__ */ jsx(MetricStat, {
        icon: "heart",
        value: metrics.likes
      })
    ]
  });
}
function PostCard({
  post,
  author
}) {
  const when = relativeTime(post.created_at);
  const name = author.name ?? author.handle ?? "";
  const handle = post.author_handle ?? author.handle;
  return /* @__PURE__ */ jsx(Card, {
    children: /* @__PURE__ */ jsxs(Stack, {
      gap: 2,
      children: [
        /* @__PURE__ */ jsxs(Row, {
          gap: 2,
          align: "center",
          justify: "between",
          children: [
            /* @__PURE__ */ jsxs(Row, {
              gap: 2,
              align: "center",
              className: "min-w-0",
              children: [
                /* @__PURE__ */ jsx(Avatar, {
                  label: initialsFromName(name),
                  size: "sm",
                  imageSrc: proxiedMediaUrl(author.avatar_url) ?? undefined,
                  imageAlt: name
                }),
                /* @__PURE__ */ jsx(Text, {
                  variant: "body",
                  weight: "semibold",
                  truncate: true,
                  noShrink: true,
                  children: name
                }),
                /* @__PURE__ */ jsxs(Text, {
                  variant: "caption",
                  truncate: true,
                  children: [
                    handle ? `@${handle} · ` : "",
                    post.url ? /* @__PURE__ */ jsx("a", {
                      href: post.url,
                      target: "_blank",
                      rel: "noopener noreferrer",
                      title: when.title,
                      className: "hover:underline",
                      children: when.label
                    }) : /* @__PURE__ */ jsx("span", {
                      title: when.title,
                      children: when.label
                    })
                  ]
                })
              ]
            }),
            post.is_repost && /* @__PURE__ */ jsx(Tag, {
              label: "Repost",
              variant: "teal",
              mode: "subtle"
            })
          ]
        }),
        /* @__PURE__ */ jsx(Text, {
          variant: "body",
          leading: "relaxed",
          className: "whitespace-pre-wrap",
          children: post.text
        }),
        /* @__PURE__ */ jsx(MediaGrid, {
          media: post.media
        }),
        /* @__PURE__ */ jsx(MetricsRow, {
          metrics: post.metrics
        })
      ]
    })
  });
}

// plugins/modules/linkedin/ui/EntityCards.tsx
import { BaseEntityCard } from "/api/plugins/__host-shim.js?m=base";
import { ActionPrefix } from "/api/plugins/__host-shim.js?m=base";
import { jsx as jsx2, jsxs as jsxs2 } from "/api/plugins/__host-shim.js?m=react-jsx-runtime";
function fmtDate(v) {
  if (typeof v !== "string" || v.length === 0)
    return;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d.toLocaleDateString();
}
function metricLine(data) {
  const m = data.metrics ?? {};
  const n = (k) => typeof m[k] === "number" ? m[k] : undefined;
  const parts = [];
  const likes = n("likes");
  if (likes !== undefined)
    parts.push(`\uD83D\uDC4D ${String(likes)}`);
  const reposts = n("reposts");
  if (reposts !== undefined)
    parts.push(`⇄ ${String(reposts)}`);
  const replies = n("replies");
  if (replies !== undefined)
    parts.push(`\uD83D\uDCAC ${String(replies)}`);
  return parts.length ? parts.join("  ") : undefined;
}
function LinkedInPostCard(props) {
  const { data, action } = props;
  const author = data.author_handle ?? undefined;
  const text = data.text ?? data.name ?? "";
  const when = fmtDate(data.created_at);
  const metrics = metricLine(data);
  return /* @__PURE__ */ jsx2(BaseEntityCard, {
    ...props,
    children: /* @__PURE__ */ jsxs2("div", {
      className: "min-w-0 flex-1",
      children: [
        /* @__PURE__ */ jsxs2("span", {
          className: "block truncate text-[12px] font-medium text-content",
          children: [
            /* @__PURE__ */ jsx2(ActionPrefix, {
              action
            }),
            author ?? "LinkedIn post",
            when && /* @__PURE__ */ jsx2("span", {
              className: "ml-2 text-[10px] text-content-tertiary",
              children: when
            })
          ]
        }),
        /* @__PURE__ */ jsx2("span", {
          className: "mt-0.5 block text-[11px] text-content-secondary line-clamp-3",
          children: text
        }),
        metrics && /* @__PURE__ */ jsx2("span", {
          className: "mt-1 block text-[10px] text-content-tertiary",
          children: metrics
        })
      ]
    })
  });
}
function LinkedInProfileCard(props) {
  const { data, action } = props;
  const name = data.display_name ?? data.name ?? data.handle ?? "LinkedIn profile";
  const handle = data.handle ?? undefined;
  const followers = typeof data.follower_count === "number" ? data.follower_count : undefined;
  const bio = data.bio ?? undefined;
  const avatar = data.avatar_url ?? undefined;
  const subtitle = handle ? `@${handle}${followers !== undefined ? ` · ${followers.toLocaleString()} followers` : ""}` : undefined;
  return /* @__PURE__ */ jsxs2(BaseEntityCard, {
    ...props,
    children: [
      avatar && /* @__PURE__ */ jsx2("img", {
        src: proxiedMediaUrl(avatar) ?? undefined,
        alt: name,
        className: "h-8 w-8 shrink-0 rounded-full object-cover",
        loading: "lazy"
      }),
      /* @__PURE__ */ jsxs2("div", {
        className: "min-w-0 flex-1",
        children: [
          /* @__PURE__ */ jsxs2("span", {
            className: "block truncate text-[12px] font-medium text-content",
            children: [
              /* @__PURE__ */ jsx2(ActionPrefix, {
                action
              }),
              name
            ]
          }),
          subtitle && /* @__PURE__ */ jsx2("span", {
            className: "mt-0.5 block truncate text-[11px] text-content-secondary",
            children: subtitle
          }),
          bio && /* @__PURE__ */ jsx2("span", {
            className: "mt-0.5 block text-[11px] text-content-tertiary line-clamp-2",
            children: bio
          })
        ]
      })
    ]
  });
}

// plugins/modules/linkedin/ui/ProfileFeed.tsx
import { useState } from "/api/plugins/__host-shim.js?m=react";
import { useQuery } from "/api/plugins/__host-shim.js?m=react-query";
import { Icon as Icon2, Row as Row2, Scrollable, SearchableTabs, Stack as Stack2, Text as Text2 } from "/api/plugins/__host-shim.js?m=ui";
import { jsx as jsx3, jsxs as jsxs3 } from "/api/plugins/__host-shim.js?m=react-jsx-runtime";
var TABS = [
  { id: "posts", label: "Posts" },
  { id: "profile", label: "Profile" }
];
function LinkedInProfileFeed({ entityId, runtime }) {
  const [activeTab, setActiveTab] = useState("posts");
  const { data: profile } = useQuery({
    queryKey: ["linkedin", "profile", entityId],
    queryFn: () => runtime.transport.rpc("linkedin.profiles.get", { id: entityId }),
    enabled: !!entityId
  });
  const handle = profile?.handle ?? undefined;
  const { data: feed } = useQuery({
    queryKey: ["linkedin", "feed", handle],
    queryFn: () => runtime.transport.rpc("linkedin.posts.list", {
      author_handle: handle,
      limit: 50
    }),
    enabled: !!handle
  });
  const posts = feed?.items ?? [];
  const author = {
    name: profile?.display_name ?? null,
    handle: profile?.handle ?? null,
    avatar_url: profile?.avatar_url ?? null
  };
  return /* @__PURE__ */ jsxs3(Scrollable, {
    children: [
      /* @__PURE__ */ jsx3(SearchableTabs, {
        tabs: TABS,
        activeTab,
        onTabChange: setActiveTab
      }),
      /* @__PURE__ */ jsx3("div", {
        className: "px-5 py-4",
        children: activeTab === "posts" ? posts.length === 0 ? /* @__PURE__ */ jsx3(Text2, {
          variant: "caption",
          color: "tertiary",
          children: "No posts yet."
        }) : /* @__PURE__ */ jsx3(Stack2, {
          gap: 3,
          children: posts.map((p) => /* @__PURE__ */ jsx3(PostCard, {
            post: p,
            author
          }, p.id))
        }) : /* @__PURE__ */ jsxs3(Stack2, {
          gap: 6,
          children: [
            profile?.bio && /* @__PURE__ */ jsxs3(Stack2, {
              gap: 1,
              children: [
                /* @__PURE__ */ jsx3(Text2, {
                  variant: "caption",
                  weight: "semibold",
                  color: "tertiary",
                  children: "About"
                }),
                /* @__PURE__ */ jsx3(Text2, {
                  variant: "body",
                  color: "secondary",
                  leading: "relaxed",
                  className: "whitespace-pre-wrap",
                  children: profile.bio
                })
              ]
            }),
            profile?.handle && /* @__PURE__ */ jsxs3(Stack2, {
              gap: 1,
              children: [
                /* @__PURE__ */ jsx3(Text2, {
                  variant: "caption",
                  weight: "semibold",
                  color: "tertiary",
                  children: "Handle"
                }),
                /* @__PURE__ */ jsxs3(Text2, {
                  variant: "body",
                  color: "secondary",
                  children: [
                    "@",
                    profile.handle
                  ]
                })
              ]
            }),
            profile?.follower_count !== null && profile?.follower_count !== undefined && /* @__PURE__ */ jsxs3(Stack2, {
              gap: 1,
              children: [
                /* @__PURE__ */ jsx3(Text2, {
                  variant: "caption",
                  weight: "semibold",
                  color: "tertiary",
                  children: "Followers"
                }),
                /* @__PURE__ */ jsx3(Text2, {
                  variant: "body",
                  color: "secondary",
                  children: profile.follower_count.toLocaleString()
                })
              ]
            }),
            profile?.url && /* @__PURE__ */ jsxs3(Stack2, {
              gap: 1,
              children: [
                /* @__PURE__ */ jsx3(Text2, {
                  variant: "caption",
                  weight: "semibold",
                  color: "tertiary",
                  children: "Profile"
                }),
                /* @__PURE__ */ jsxs3(Row2, {
                  gap: 2,
                  align: "center",
                  children: [
                    /* @__PURE__ */ jsx3(Icon2, {
                      name: "link",
                      size: 14,
                      className: "text-content-tertiary shrink-0"
                    }),
                    /* @__PURE__ */ jsx3("a", {
                      href: profile.url,
                      target: "_blank",
                      rel: "noopener noreferrer",
                      className: "text-sm text-accent hover:underline",
                      children: profile.url
                    })
                  ]
                })
              ]
            })
          ]
        })
      })
    ]
  });
}

// plugins/modules/linkedin/ui/ProfileHeader.tsx
import { useCallback, useRef } from "/api/plugins/__host-shim.js?m=react";
import { useMutation, useQuery as useQuery2, useQueryClient } from "/api/plugins/__host-shim.js?m=react-query";
import {
  Avatar as Avatar2,
  ContextMenu,
  Icon as Icon3,
  IconButton,
  Row as Row3,
  Stack as Stack3,
  Tag as Tag2,
  Text as Text3,
  TOPBAR_AVATAR_SIZE,
  TopBarHeader,
  useContextMenu
} from "/api/plugins/__host-shim.js?m=ui";
import { initialsFromName as initialsFromName2 } from "/api/plugins/__host-shim.js?m=utils";
import { jsx as jsx4, jsxs as jsxs4, Fragment } from "/api/plugins/__host-shim.js?m=react-jsx-runtime";
var PLATFORM = "linkedin";
function ProfileHeaderExtra({ bio, url }) {
  if (!bio && !url)
    return null;
  return /* @__PURE__ */ jsxs4(Stack3, {
    gap: 0.5,
    className: "mt-0.5",
    children: [
      bio && /* @__PURE__ */ jsx4(Text3, {
        variant: "caption",
        color: "secondary",
        truncate: true,
        children: bio
      }),
      url && /* @__PURE__ */ jsxs4(Row3, {
        gap: 1,
        align: "center",
        children: [
          /* @__PURE__ */ jsx4(Icon3, {
            name: "link",
            size: 12,
            className: "text-content-tertiary shrink-0"
          }),
          /* @__PURE__ */ jsx4("a", {
            href: url,
            target: "_blank",
            rel: "noopener noreferrer",
            className: "truncate text-xs text-accent hover:underline",
            children: url
          })
        ]
      })
    ]
  });
}
function LinkedInProfileHeader({
  entityId,
  entityName,
  themeColor,
  runtime,
  onRename
}) {
  const queryClient = useQueryClient();
  const menu = useContextMenu();
  const menuBtnRef = useRef(null);
  const openMenu = useCallback(() => {
    const rect = menuBtnRef.current?.getBoundingClientRect();
    if (!rect)
      return;
    menu.open({
      clientX: rect.right,
      clientY: rect.bottom,
      preventDefault: () => {}
    }, null);
  }, [menu]);
  const { data: profile } = useQuery2({
    queryKey: ["linkedin", "profile", entityId],
    queryFn: () => runtime.transport.rpc("linkedin.profiles.get", { id: entityId }),
    enabled: !!entityId
  });
  const handle = profile?.handle ?? undefined;
  const trackingKey = [PLATFORM, "tracking", handle];
  const { data: tracking } = useQuery2({
    queryKey: trackingKey,
    queryFn: () => runtime.transport.rpc("contacts.get_social_tracking_by_handle", {
      platform: PLATFORM,
      handle
    }),
    enabled: !!handle
  });
  const setTracking = useMutation({
    mutationFn: (tracked) => {
      if (!tracking)
        throw new Error("cannot toggle tracking before it resolves");
      return runtime.transport.rpc("contacts.set_social_tracking", {
        id: tracking.contact_id,
        platform: PLATFORM,
        tracked
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trackingKey });
    }
  });
  const menuItems = [
    ...tracking ? [
      tracking.tracked ? { id: "untrack", label: "Untrack on LinkedIn", variant: "danger" } : { id: "track", label: "Track on LinkedIn" }
    ] : [],
    ...profile?.url ? [{ id: "open", label: "Open profile" }] : []
  ];
  const subtitle = profile?.handle ? `@${profile.handle}${profile.follower_count !== null ? ` · ${profile.follower_count.toLocaleString()} followers` : ""}` : undefined;
  return /* @__PURE__ */ jsxs4(Fragment, {
    children: [
      /* @__PURE__ */ jsx4(TopBarHeader, {
        leading: /* @__PURE__ */ jsx4(Avatar2, {
          label: initialsFromName2(entityName ?? ""),
          color: themeColor,
          size: TOPBAR_AVATAR_SIZE,
          imageSrc: proxiedMediaUrl(profile?.avatar_url ?? null) ?? undefined
        }),
        title: entityName ?? "Untitled",
        subtitle,
        extra: /* @__PURE__ */ jsx4(ProfileHeaderExtra, {
          bio: profile?.bio,
          url: profile?.url
        }),
        onTitleEdit: onRename,
        actions: /* @__PURE__ */ jsxs4(Fragment, {
          children: [
            tracking?.tracked && /* @__PURE__ */ jsx4(Tag2, {
              label: "Tracked",
              variant: "green",
              mode: "subtle"
            }),
            menuItems.length > 0 && /* @__PURE__ */ jsx4("div", {
              ref: menuBtnRef,
              children: /* @__PURE__ */ jsx4(IconButton, {
                variant: "ghost",
                label: "Profile actions",
                onClick: openMenu,
                children: /* @__PURE__ */ jsx4(Icon3, {
                  name: "ellipsis-vertical",
                  size: 15
                })
              })
            })
          ]
        })
      }),
      menu.state.isOpen && /* @__PURE__ */ jsx4(ContextMenu, {
        items: menuItems,
        position: menu.state.position,
        onSelect: (itemId) => {
          if (itemId === "untrack")
            setTracking.mutate(false);
          if (itemId === "track")
            setTracking.mutate(true);
          if (itemId === "open" && profile?.url)
            window.open(profile.url, "_blank", "noopener");
          menu.close();
        },
        onClose: menu.close
      })
    ]
  });
}

// plugins/modules/linkedin/ui/AddProfileAction.tsx
import { useState as useState2 } from "/api/plugins/__host-shim.js?m=react";
import { Icon as Icon4, IconButton as IconButton2 } from "/api/plugins/__host-shim.js?m=ui";
import { jsx as jsx5, jsxs as jsxs5, Fragment as Fragment2 } from "/api/plugins/__host-shim.js?m=react-jsx-runtime";
function AddProfileAction({
  runtime
}) {
  const [open, setOpen] = useState2(false);
  const [value, setValue] = useState2("");
  const [busy, setBusy] = useState2(false);
  const [error, setError] = useState2(null);
  const [added, setAdded] = useState2(null);
  function close() {
    setOpen(false);
    setValue("");
    setError(null);
    setAdded(null);
  }
  async function submit() {
    const raw = value.trim();
    if (!raw || busy)
      return;
    setBusy(true);
    setError(null);
    setAdded(null);
    try {
      const result = await runtime.transport.rpc("contacts.track_social_profile", { platform: "linkedin", url_or_handle: raw });
      setValue("");
      setAdded(result.handle);
      runtime.queryClient.invalidateQueries({ queryKey: ["linkedin"] });
      runtime.queryClient.invalidateQueries({ queryKey: ["contacts"] });
    } catch (e) {
      setError(e instanceof Error && e.message.includes("invalid_url") ? "Not a LinkedIn profile — paste linkedin.com/in/… or a handle" : "Could not track this profile");
    } finally {
      setBusy(false);
    }
  }
  function onKeyDown(e) {
    if (e.key === "Enter")
      submit();
    if (e.key === "Escape")
      close();
  }
  return /* @__PURE__ */ jsxs5(Fragment2, {
    children: [
      /* @__PURE__ */ jsx5(IconButton2, {
        variant: "ghost",
        label: "Add profile",
        onClick: () => {
          setOpen(true);
        },
        children: /* @__PURE__ */ jsx5(Icon4, {
          name: "plus",
          size: 15
        })
      }),
      open && /* @__PURE__ */ jsx5("div", {
        className: "fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-[2px]",
        onClick: (e) => {
          if (e.target === e.currentTarget)
            close();
        },
        children: /* @__PURE__ */ jsxs5("div", {
          className: "w-full max-w-lg mx-4 rounded-xl bg-surface border border-edge shadow-2xl",
          children: [
            /* @__PURE__ */ jsxs5("div", {
              className: "flex items-center justify-between px-5 pt-5 pb-3",
              children: [
                /* @__PURE__ */ jsx5("h2", {
                  className: "text-[15px] font-semibold text-content m-0",
                  children: "Add LinkedIn profile"
                }),
                /* @__PURE__ */ jsx5("button", {
                  type: "button",
                  onClick: close,
                  className: "w-8 h-8 rounded-lg bg-transparent border-none text-content-secondary hover:text-content hover:bg-surface-hover cursor-pointer",
                  children: "✕"
                })
              ]
            }),
            /* @__PURE__ */ jsxs5("div", {
              className: "px-5 pb-5 space-y-3",
              children: [
                /* @__PURE__ */ jsx5("p", {
                  className: "text-[13px] text-content-secondary m-0",
                  children: "Paste a profile URL (linkedin.com/in/…) or a handle. The person appears in the list immediately and their posts arrive with the next sync. Tracking costs API credits on every cycle."
                }),
                /* @__PURE__ */ jsx5("input", {
                  "aria-label": "Profile URL or handle",
                  autoFocus: true,
                  value,
                  disabled: busy,
                  onChange: (e) => {
                    setValue(e.target.value);
                    setError(null);
                  },
                  onKeyDown,
                  placeholder: "https://www.linkedin.com/in/…",
                  className: "w-full rounded-lg bg-surface-secondary border border-edge px-3 py-2.5 text-sm text-content focus:outline-none focus:border-accent"
                }),
                error && /* @__PURE__ */ jsx5("p", {
                  className: "text-xs text-red-400 m-0",
                  children: error
                }),
                added && !error && /* @__PURE__ */ jsxs5("p", {
                  className: "text-xs text-green-400 m-0",
                  children: [
                    "Added @",
                    added,
                    " — syncing… Paste another to keep going."
                  ]
                })
              ]
            }),
            /* @__PURE__ */ jsxs5("div", {
              className: "flex items-center justify-end gap-2 px-5 py-4 border-t border-edge",
              children: [
                /* @__PURE__ */ jsx5("button", {
                  type: "button",
                  onClick: close,
                  className: "text-xs px-4 py-2 rounded-lg border border-edge text-content-secondary hover:text-content hover:border-edge-strong transition-colors",
                  children: "Close"
                }),
                /* @__PURE__ */ jsx5("button", {
                  type: "button",
                  onClick: () => {
                    submit();
                  },
                  disabled: busy || !value.trim(),
                  className: "text-xs px-4 py-2 rounded-lg bg-accent text-white font-medium disabled:opacity-50",
                  children: "Add"
                })
              ]
            })
          ]
        })
      })
    ]
  });
}

// plugins/modules/linkedin/ui/index.tsx
import { jsx as jsx6 } from "/api/plugins/__host-shim.js?m=react-jsx-runtime";
var ICON_URL = "/api/plugins/linkedin/icon.svg";
function LinkedInIcon() {
  return /* @__PURE__ */ jsx6("span", {
    role: "img",
    "aria-label": "LinkedIn",
    className: "inline-block h-[22px] w-[22px] bg-current",
    style: {
      maskImage: `url(${ICON_URL})`,
      maskRepeat: "no-repeat",
      maskSize: "contain",
      maskPosition: "center",
      WebkitMaskImage: `url(${ICON_URL})`,
      WebkitMaskRepeat: "no-repeat",
      WebkitMaskSize: "contain",
      WebkitMaskPosition: "center"
    }
  });
}
var LinkedinModule = defineModule({
  id: "linkedin",
  title: "LinkedIn",
  icon: /* @__PURE__ */ jsx6(LinkedInIcon, {}),
  iconName: "briefcase",
  themeColor: "purple",
  entityTypes: ["profile", "post"],
  entityLabels: { profile: { EntityCard: LinkedInProfileCard } },
  primaryEntityType: "profile",
  rpc: { list: "linkedin.profiles.list", get: "linkedin.profiles.get" },
  mapListItem: (raw) => {
    const asStr = (v) => typeof v === "string" ? v : typeof v === "number" ? String(v) : "";
    const handle = asStr(raw.handle);
    const fc = typeof raw.follower_count === "number" ? raw.follower_count : null;
    const pending = raw.pending === true;
    return {
      id: asStr(raw.id),
      name: asStr(raw.display_name) || handle || "Profile",
      schema_id: "linkedin.profile",
      preview: pending ? `@${handle} · Syncing…` : handle ? `@${handle}${fc !== null ? ` · ${fc.toLocaleString()} followers` : ""}` : null,
      timestamp: null,
      avatar_url: typeof raw.avatar_url === "string" && raw.avatar_url ? proxiedMediaUrl(raw.avatar_url) : null
    };
  },
  HeaderActions: AddProfileAction,
  HeaderComponent: LinkedInProfileHeader,
  DetailPanel: LinkedInProfileFeed,
  EntityCard: LinkedInPostCard,
  extraSetup: (runtime) => {
    const unsub = setupEventInvalidation(runtime.transport, runtime.queryClient, ["sync.progress"], [["linkedin"]]);
    return () => {
      unsub();
    };
  }
});
export {
  LinkedinModule
};
