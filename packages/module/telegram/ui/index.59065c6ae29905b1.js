// plugins/modules/telegram/ui/TelegramIcon.tsx
import { jsx, jsxs } from "/api/plugins/__host-shim.js?m=react-jsx-runtime";
function TelegramIcon({
  size = 22,
  className
}) {
  return /* @__PURE__ */ jsxs("svg", {
    xmlns: "http://www.w3.org/2000/svg",
    viewBox: "0 0 24 24",
    width: size,
    height: size,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    className,
    "aria-hidden": "true",
    children: [
      /* @__PURE__ */ jsx("polygon", {
        points: "22 2 15 22 11 13 2 9 22 2"
      }),
      /* @__PURE__ */ jsx("line", {
        x1: "22",
        y1: "2",
        x2: "11",
        y2: "13"
      })
    ]
  });
}

// plugins/modules/telegram/ui/index.tsx
import { defineModule } from "/api/plugins/__host-shim.js?m=base";

// plugins/modules/telegram/ui/TelegramToolCallRenderer.tsx
import { BaseToolCallCard } from "/api/plugins/__host-shim.js?m=base";
import { jsx as jsx2 } from "/api/plugins/__host-shim.js?m=react-jsx-runtime";
function TelegramToolCallRenderer({
  payload
}) {
  const { toolCall: tc, toolResult, isAllowlisted, superseded, selectedChatName, onApprove, onDeny, onEdit, onAllowlistToggle } = payload;
  const args = tc.args;
  const chatIdLabel = typeof args.chat_id === "string" || typeof args.chat_id === "number" ? `Chat ${String(args.chat_id)}` : "Telegram";
  const chatName = tc.chatName ?? args.chat_name ?? selectedChatName ?? chatIdLabel;
  return /* @__PURE__ */ jsx2(BaseToolCallCard, {
    icon: "send",
    title: `Telegram to ${chatName}`,
    variant: "sky",
    status: tc.status,
    toolResult,
    superseded,
    isAllowlisted,
    primaryLabel: "Send",
    primaryIcon: "send",
    doneLabel: "Sent",
    onApprove,
    onDeny,
    onEdit,
    onAllowlistToggle,
    children: /* @__PURE__ */ jsx2("p", {
      className: "whitespace-pre-wrap text-[13px] leading-[1.5] text-agent-text",
      children: typeof args.text === "string" ? args.text : ""
    })
  });
}

// plugins/modules/telegram/ui/TelegramBatchSendRenderer.tsx
import { useCallback, useMemo, useState } from "/api/plugins/__host-shim.js?m=react";
import { Icon } from "/api/plugins/__host-shim.js?m=ui";
import { BaseToolCallCard as BaseToolCallCard2 } from "/api/plugins/__host-shim.js?m=base";
import { AllowlistDropdown } from "/api/plugins/__host-shim.js?m=agent";
import { jsx as jsx3, jsxs as jsxs2 } from "/api/plugins/__host-shim.js?m=react-jsx-runtime";
function TelegramBatchSendRenderer({
  payload
}) {
  const { toolCall: tc, toolResult, isAllowlisted, superseded, onApprove, onDeny, onAllowlistToggle } = payload;
  const args = tc.args;
  const messages = useMemo(() => args.messages ?? [], [args.messages]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [excluded, setExcluded] = useState(() => new Set);
  const [savedEdits, setSavedEdits] = useState(() => new Map);
  const [editingIndex, setEditingIndex] = useState(null);
  const [editText, setEditText] = useState("");
  const total = messages.length;
  const activeCount = total - excluded.size;
  const current = messages.at(currentIndex);
  const isEditing = editingIndex === currentIndex;
  const isDraft = tc.status === "pending";
  const isExcluded = excluded.has(currentIndex);
  const goLeft = useCallback(() => {
    setCurrentIndex((i) => Math.max(0, i - 1));
  }, []);
  const goRight = useCallback(() => {
    setCurrentIndex((i) => Math.min(total - 1, i + 1));
  }, [total]);
  const toggleExclude = useCallback((idx) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  }, []);
  const startEdit = useCallback(() => {
    if (!current)
      return;
    setEditText(savedEdits.get(currentIndex) ?? current.text);
    setEditingIndex(currentIndex);
  }, [current, currentIndex, savedEdits]);
  const saveEdit = useCallback(() => {
    if (editingIndex === null)
      return;
    setSavedEdits((prev) => {
      const next = new Map(prev);
      next.set(editingIndex, editText);
      return next;
    });
    setEditingIndex(null);
  }, [editingIndex, editText]);
  const revertEdit = useCallback(() => {
    setEditingIndex(null);
  }, []);
  const buildOverrideArgs = useCallback(() => {
    const updatedMessages = messages.map((msg, i) => ({ ...msg, text: savedEdits.get(i) ?? msg.text }));
    return { messages: updatedMessages, excluded_indices: Array.from(excluded) };
  }, [messages, savedEdits, excluded]);
  const handleApprove = useCallback(async () => {
    await onApprove(buildOverrideArgs());
  }, [onApprove, buildOverrideArgs]);
  if (!current) {
    return /* @__PURE__ */ jsx3("div", {
      className: "text-agent-text-muted text-[12px]",
      children: "No messages in batch"
    });
  }
  const saved = savedEdits.get(currentIndex);
  const displayText = isEditing ? editText : saved ?? current.text;
  const hasEdits = saved !== undefined;
  const toLabel = current.chat_name && current.chat_name.length > 0 ? current.chat_name : String(current.chat_id);
  const headerNav = /* @__PURE__ */ jsxs2("div", {
    className: "flex items-center gap-1",
    "data-testid": "telegram-batch-nav",
    children: [
      /* @__PURE__ */ jsx3("button", {
        type: "button",
        className: "rounded p-0.5 text-agent-text-muted hover:text-agent-text disabled:opacity-30",
        disabled: currentIndex === 0 || isEditing,
        onClick: goLeft,
        children: /* @__PURE__ */ jsx3(Icon, {
          name: "chevron-left",
          size: 14
        })
      }),
      /* @__PURE__ */ jsxs2("span", {
        className: "text-[11px] tabular-nums text-agent-text-muted",
        children: [
          String(currentIndex + 1),
          "/",
          String(total)
        ]
      }),
      /* @__PURE__ */ jsx3("button", {
        type: "button",
        className: "rounded p-0.5 text-agent-text-muted hover:text-agent-text disabled:opacity-30",
        disabled: currentIndex === total - 1 || isEditing,
        onClick: goRight,
        children: /* @__PURE__ */ jsx3(Icon, {
          name: "chevron-right",
          size: 14
        })
      })
    ]
  });
  const customActionBar = isDraft ? isEditing ? /* @__PURE__ */ jsxs2("div", {
    className: "flex items-center justify-end gap-2",
    children: [
      /* @__PURE__ */ jsx3("button", {
        type: "button",
        className: "rounded-md border border-agent-border px-3 py-1.5 text-[12px] text-agent-text-muted hover:text-agent-text",
        onClick: revertEdit,
        children: "Revert"
      }),
      /* @__PURE__ */ jsx3("button", {
        type: "button",
        className: "rounded-md bg-sky-500 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-sky-400",
        onClick: saveEdit,
        children: "Save"
      })
    ]
  }) : /* @__PURE__ */ jsxs2("div", {
    className: "flex items-center gap-2",
    children: [
      /* @__PURE__ */ jsx3(AllowlistDropdown, {
        isAllowlisted,
        onToggle: onAllowlistToggle
      }),
      /* @__PURE__ */ jsxs2("label", {
        className: "flex cursor-pointer items-center gap-1.5 text-[11px] text-agent-text-muted",
        children: [
          /* @__PURE__ */ jsx3("input", {
            type: "checkbox",
            className: "accent-sky-500",
            checked: isExcluded,
            onChange: () => {
              toggleExclude(currentIndex);
            }
          }),
          "Exclude"
        ]
      }),
      /* @__PURE__ */ jsx3("div", {
        className: "flex-1"
      }),
      !isExcluded && /* @__PURE__ */ jsxs2("button", {
        type: "button",
        className: "flex items-center gap-1 rounded-md border border-agent-border px-2.5 py-1.5 text-[12px] text-agent-text-muted hover:text-agent-text",
        onClick: startEdit,
        children: [
          /* @__PURE__ */ jsx3(Icon, {
            name: "edit",
            size: 12
          }),
          "Edit"
        ]
      }),
      /* @__PURE__ */ jsx3("button", {
        type: "button",
        className: "rounded-md border border-agent-border px-2.5 py-1.5 text-[12px] text-agent-text-muted hover:text-agent-text",
        onClick: () => {
          onDeny();
        },
        children: "Deny"
      }),
      /* @__PURE__ */ jsxs2("button", {
        type: "button",
        className: "flex items-center gap-1 rounded-md bg-sky-500 hover:bg-sky-400 px-3 py-1.5 text-[12px] font-medium text-white",
        onClick: () => {
          handleApprove();
        },
        children: [
          /* @__PURE__ */ jsx3(Icon, {
            name: "send",
            size: 12
          }),
          `Send ${String(activeCount)} message${activeCount !== 1 ? "s" : ""}`
        ]
      })
    ]
  }) : undefined;
  return /* @__PURE__ */ jsx3(BaseToolCallCard2, {
    icon: "send",
    title: `Telegram batch (${String(activeCount)} of ${String(total)})`,
    variant: "sky",
    status: tc.status,
    toolResult,
    superseded,
    isAllowlisted,
    headerExtra: headerNav,
    primaryLabel: `Send ${String(activeCount)} message${activeCount !== 1 ? "s" : ""}`,
    primaryIcon: "send",
    doneLabel: `${String(activeCount)} sent`,
    onApprove: handleApprove,
    onDeny,
    onAllowlistToggle,
    customActions: customActionBar,
    children: /* @__PURE__ */ jsxs2("div", {
      className: isExcluded && !isEditing ? "opacity-40" : "",
      children: [
        /* @__PURE__ */ jsxs2("div", {
          className: "mb-1 text-[11px]",
          children: [
            /* @__PURE__ */ jsx3("span", {
              className: "text-sky-400/80",
              children: "To:"
            }),
            " ",
            /* @__PURE__ */ jsx3("span", {
              className: "text-agent-text",
              "data-testid": "batch-recipient",
              children: toLabel
            }),
            hasEdits && !isEditing && /* @__PURE__ */ jsx3("span", {
              className: "ml-2 text-[10px] text-amber-400",
              children: "(edited)"
            })
          ]
        }),
        isEditing ? /* @__PURE__ */ jsx3("textarea", {
          className: "mb-2 w-full resize-none rounded border border-agent-border bg-transparent px-2 py-1 text-[13px] leading-[1.5] text-agent-text outline-none focus:border-sky-400",
          style: { fieldSizing: "content" },
          rows: 1,
          value: editText,
          onChange: (e) => {
            setEditText(e.target.value);
          }
        }) : /* @__PURE__ */ jsx3("p", {
          className: "mb-2 whitespace-pre-wrap rounded border border-transparent px-2 py-1 text-[13px] leading-[1.5] text-agent-text",
          children: displayText
        })
      ]
    })
  });
}

// plugins/modules/telegram/ui/TelegramSetTriggerRenderer.tsx
import { BaseToolCallCard as BaseToolCallCard3 } from "/api/plugins/__host-shim.js?m=base";
import { jsx as jsx4, jsxs as jsxs3 } from "/api/plugins/__host-shim.js?m=react-jsx-runtime";
function TelegramSetTriggerRenderer({
  payload
}) {
  const { toolCall: tc, toolResult, isAllowlisted, superseded, onApprove, onDeny, onAllowlistToggle } = payload;
  const args = tc.args;
  const chatId = typeof args.chat_id === "string" || typeof args.chat_id === "number" ? String(args.chat_id) : "?";
  const gate = typeof args.gate_prompt === "string" ? args.gate_prompt : "";
  const action = typeof args.action_prompt === "string" ? args.action_prompt : "";
  const debounce = typeof args.debounce_seconds === "number" ? args.debounce_seconds : 0;
  return /* @__PURE__ */ jsx4(BaseToolCallCard3, {
    icon: "bell",
    title: `Watch Telegram chat ${chatId}`,
    variant: "amber",
    status: tc.status,
    toolResult,
    superseded,
    isAllowlisted,
    primaryLabel: "Set trigger",
    primaryIcon: "bell",
    doneLabel: "Trigger set",
    onApprove,
    onDeny,
    onAllowlistToggle,
    children: /* @__PURE__ */ jsxs3("div", {
      className: "flex flex-col gap-2 text-[13px] leading-[1.5]",
      children: [
        /* @__PURE__ */ jsxs3("div", {
          children: [
            /* @__PURE__ */ jsx4("span", {
              className: "text-amber-400/80",
              children: "When:"
            }),
            " ",
            /* @__PURE__ */ jsx4("span", {
              className: "text-agent-text",
              "data-testid": "trigger-gate",
              children: gate
            })
          ]
        }),
        /* @__PURE__ */ jsxs3("div", {
          children: [
            /* @__PURE__ */ jsx4("span", {
              className: "text-amber-400/80",
              children: "Then:"
            }),
            " ",
            /* @__PURE__ */ jsx4("span", {
              className: "text-agent-text",
              "data-testid": "trigger-action",
              children: action
            })
          ]
        }),
        debounce > 0 ? /* @__PURE__ */ jsxs3("div", {
          className: "text-[11px] text-agent-text opacity-60",
          children: [
            "Batched within ",
            String(debounce),
            "s"
          ]
        }) : null
      ]
    })
  });
}

// plugins/modules/telegram/ui/EntityCards.tsx
import { useContext } from "/api/plugins/__host-shim.js?m=react";

// plugins/modules/telegram/ui/utils/time.ts
function formatMessageTime(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime()))
    return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// plugins/modules/telegram/ui/EntityCards.tsx
import { BaseEntityCard } from "/api/plugins/__host-shim.js?m=base";
import { ActionPrefix } from "/api/plugins/__host-shim.js?m=base";
import { ExpansionContext } from "/api/plugins/__host-shim.js?m=agent";

// plugins/modules/telegram/ui/hooks/useEntityDetail.ts
import { useEffect, useState as useState2 } from "/api/plugins/__host-shim.js?m=react";
function useEntityDetail(data, runtime, rpcMethod, hasDataCheck) {
  const entityId = data.id;
  const [detail, setDetail] = useState2(null);
  useEffect(() => {
    if (hasDataCheck(data) || !entityId)
      return;
    let cancelled = false;
    runtime.transport.rpc(rpcMethod, { id: entityId }).then((d) => {
      if (!cancelled)
        setDetail(d);
    }).catch(() => {
      return;
    });
    return () => {
      cancelled = true;
    };
  }, [entityId, data, runtime, rpcMethod, hasDataCheck]);
  return detail ?? data;
}
var hasMessageData = (d) => Boolean(d.sender) || Boolean(d.preview) || Boolean(d.subject);
var hasChatData = (d) => Boolean(d.chat_title) || Boolean(d.last_message);

// plugins/modules/telegram/ui/EntityCards.tsx
import { jsx as jsx5, jsxs as jsxs4 } from "/api/plugins/__host-shim.js?m=react-jsx-runtime";
var MESSAGE_CLAMP_CHARS = 140;
function toStringList(value) {
  if (!Array.isArray(value))
    return [];
  return value.filter((v) => typeof v === "string" && v.length > 0);
}
function memberNames(data) {
  const raw = data.members ?? data.participants;
  if (!Array.isArray(raw))
    return toStringList(data.members);
  const out = [];
  for (const item of raw) {
    if (typeof item === "string" && item.length > 0)
      out.push(item);
    else if (item && typeof item === "object") {
      const rec = item;
      const name = (typeof rec.name === "string" && rec.name.length > 0 ? rec.name : undefined) ?? (typeof rec.display_name === "string" && rec.display_name.length > 0 ? rec.display_name : undefined) ?? (typeof rec.username === "string" && rec.username.length > 0 ? `@${rec.username}` : undefined);
      if (name)
        out.push(name);
    }
  }
  return out;
}
function telegramMessageHasMore(data) {
  const text = (typeof data.preview === "string" ? data.preview : "") || (typeof data.subject === "string" ? data.subject : "") || (typeof data.text === "string" ? data.text : "");
  return text.length > MESSAGE_CLAMP_CHARS || text.includes(`
`);
}
function telegramChatHasMore(data) {
  return memberNames(data).length > 0 || typeof data.chat_type === "string" && data.chat_type.length > 0 || typeof data.created_at === "string" && data.created_at.length > 0;
}
function Row({ label, value }) {
  return /* @__PURE__ */ jsxs4("div", {
    className: "flex gap-2 text-[11px]",
    children: [
      /* @__PURE__ */ jsx5("span", {
        className: "w-20 shrink-0 text-content-tertiary",
        children: label
      }),
      /* @__PURE__ */ jsx5("span", {
        className: "min-w-0 flex-1 whitespace-pre-wrap break-words text-content",
        children: value
      })
    ]
  });
}
function TelegramMessageCard(props) {
  const resolved = useEntityDetail(props.data, props.runtime, "telegram.messages.get", hasMessageData);
  const { expanded } = useContext(ExpansionContext);
  const { action } = props;
  const metadata = resolved.metadata;
  const senderName = metadata?.sender_name;
  const displaySender = senderName ?? resolved.sender ?? "Unknown";
  const displayText = resolved.preview ?? resolved.subject ?? "";
  const fullText = resolved.preview ?? resolved.subject ?? resolved.text;
  const rawTime = resolved.timestamp ?? "";
  const timeStr = rawTime ? rawTime.includes("T") || rawTime.length > 10 ? formatMessageTime(rawTime) : rawTime : "";
  return /* @__PURE__ */ jsx5(BaseEntityCard, {
    ...props,
    children: /* @__PURE__ */ jsxs4("div", {
      className: "min-w-0 flex-1",
      children: [
        /* @__PURE__ */ jsxs4("div", {
          className: "flex items-baseline justify-between gap-2",
          children: [
            /* @__PURE__ */ jsxs4("span", {
              className: "truncate text-[12px] font-medium text-content",
              children: [
                /* @__PURE__ */ jsx5(ActionPrefix, {
                  action
                }),
                displaySender
              ]
            }),
            timeStr && /* @__PURE__ */ jsx5("span", {
              className: "shrink-0 text-[11px] text-content-tertiary",
              children: timeStr
            })
          ]
        }),
        !expanded && displayText && /* @__PURE__ */ jsx5("p", {
          className: "mt-0.5 line-clamp-2 text-[12px] leading-[1.4] text-content-tertiary",
          children: displayText
        }),
        expanded && fullText && fullText.length > 0 && /* @__PURE__ */ jsx5("div", {
          className: "mt-2 whitespace-pre-wrap break-words text-[12px] text-content",
          children: fullText
        })
      ]
    })
  });
}
function TelegramChatCard(props) {
  const resolved = useEntityDetail(props.data, props.runtime, "telegram.chats.get", hasChatData);
  const { expanded } = useContext(ExpansionContext);
  const { action } = props;
  const chatTitle = resolved.chat_title ?? resolved.name;
  const lastMessage = resolved.last_message;
  const lastMessageSender = resolved.last_message_sender;
  const messageCount = resolved.message_count;
  const chatType = typeof resolved.chat_type === "string" ? resolved.chat_type : undefined;
  const createdAt = typeof resolved.created_at === "string" ? resolved.created_at : undefined;
  const members = memberNames(resolved);
  const memberPreview = members.length > 5 ? `${members.slice(0, 5).join(", ")} …` : members.join(", ");
  const rows = [];
  if (chatType)
    rows.push({ label: "Type", value: chatType });
  if (memberPreview)
    rows.push({ label: "Members", value: memberPreview });
  if (createdAt)
    rows.push({ label: "Created", value: createdAt });
  if (lastMessage)
    rows.push({ label: "Last msg", value: lastMessage });
  return /* @__PURE__ */ jsx5(BaseEntityCard, {
    ...props,
    children: /* @__PURE__ */ jsxs4("div", {
      className: "min-w-0 flex-1",
      children: [
        /* @__PURE__ */ jsxs4("div", {
          className: "flex items-baseline justify-between gap-2",
          children: [
            /* @__PURE__ */ jsxs4("span", {
              className: "truncate text-[12px] font-medium text-content",
              children: [
                /* @__PURE__ */ jsx5(ActionPrefix, {
                  action
                }),
                chatTitle ?? "Chat"
              ]
            }),
            messageCount !== undefined && messageCount > 0 && /* @__PURE__ */ jsxs4("span", {
              className: "shrink-0 text-[11px] text-content-tertiary",
              children: [
                messageCount,
                " msgs"
              ]
            })
          ]
        }),
        !expanded && lastMessage && /* @__PURE__ */ jsxs4("p", {
          className: "mt-0.5 line-clamp-1 text-[12px] leading-[1.4] text-content-tertiary",
          children: [
            lastMessageSender && /* @__PURE__ */ jsxs4("span", {
              className: "font-medium text-content-secondary",
              children: [
                lastMessageSender,
                ": "
              ]
            }),
            lastMessage
          ]
        }),
        expanded && rows.length > 0 && /* @__PURE__ */ jsx5("div", {
          className: "mt-2 flex flex-col gap-1",
          children: rows.map((r) => /* @__PURE__ */ jsx5(Row, {
            label: r.label,
            value: r.value
          }, r.label))
        })
      ]
    })
  });
}

// plugins/modules/telegram/ui/TelegramChatItemContent.tsx
import { Icon as Icon2 } from "/api/plugins/__host-shim.js?m=ui";
import { useAppRuntime } from "/api/plugins/__host-shim.js?m=runtime";

// plugins/modules/telegram/ui/utils/hash.ts
function hashCode(value) {
  let hash = 0;
  for (let i = 0;i < value.length; i++) {
    hash = hash * 31 + value.charCodeAt(i) | 0;
  }
  return hash;
}

// plugins/modules/telegram/ui/helpers.ts
function mediaLabel(mediaType) {
  if (!mediaType)
    return "";
  return MEDIA_LABELS[mediaType] ?? "Media";
}
function formatChatListTime(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime()))
    return "";
  const now = new Date;
  const isToday = date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
  if (isToday) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.getFullYear() === yesterday.getFullYear() && date.getMonth() === yesterday.getMonth() && date.getDate() === yesterday.getDate();
  if (isYesterday) {
    return "Yesterday";
  }
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString([], { day: "numeric", month: "short" });
  }
  return date.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
}
function pickAvatarColor(key) {
  return TELEGRAM_AVATAR_COLORS[Math.abs(hashCode(key)) % TELEGRAM_AVATAR_COLORS.length] ?? "#4A90D9";
}
function resolveAvatarUrl(baseUrl, rawUrl) {
  if (!rawUrl)
    return;
  if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) {
    return rawUrl;
  }
  return `${baseUrl}${rawUrl}`;
}
function senderColor(name) {
  const color = TELEGRAM_SENDER_COLORS[Math.abs(hashCode(name)) % TELEGRAM_SENDER_COLORS.length];
  if (color === undefined)
    throw new Error("senderColor: TELEGRAM_SENDER_COLORS is empty");
  return color;
}

// plugins/modules/telegram/ui/TelegramChatItemContent.tsx
import { jsx as jsx6, jsxs as jsxs5, Fragment } from "/api/plugins/__host-shim.js?m=react-jsx-runtime";
function ChatAvatar({
  initials,
  color,
  avatarUrl
}) {
  return /* @__PURE__ */ jsx6("div", {
    className: "w-10 h-10 rounded-full flex items-center justify-center shrink-0 overflow-hidden",
    style: { backgroundColor: color },
    children: avatarUrl ? /* @__PURE__ */ jsx6("img", {
      src: avatarUrl,
      alt: "",
      className: "w-full h-full object-cover"
    }) : /* @__PURE__ */ jsx6("span", {
      className: "text-white font-semibold text-sm",
      children: initials
    })
  });
}
function UnreadBadge({
  count
}) {
  return /* @__PURE__ */ jsx6("div", {
    className: "min-w-[22px] h-[22px] rounded-full bg-green flex items-center justify-center px-1",
    children: /* @__PURE__ */ jsx6("span", {
      className: "text-white text-[11px] font-bold leading-none",
      children: count
    })
  });
}
function TelegramChatItemContent({
  item
}) {
  const runtime = useAppRuntime();
  const initials = item.metadata?.initials ?? "?";
  const avatarColor = item.metadata?.avatarColor ?? "#4A90D9";
  const avatarUrl = resolveAvatarUrl(runtime.transport.baseUrl, item.avatar_url ?? null);
  const muted = item.metadata?.muted;
  const unreadCount = item.unread_count;
  const isIndexed = item.metadata?.isIndexed;
  return /* @__PURE__ */ jsxs5(Fragment, {
    children: [
      /* @__PURE__ */ jsx6(ChatAvatar, {
        initials,
        color: avatarColor,
        avatarUrl
      }),
      /* @__PURE__ */ jsxs5("div", {
        className: "flex-1 min-w-0 flex flex-col gap-1 justify-center",
        children: [
          /* @__PURE__ */ jsxs5("div", {
            className: "flex items-center justify-between",
            children: [
              /* @__PURE__ */ jsxs5("div", {
                className: "flex items-center gap-1 min-w-0",
                children: [
                  /* @__PURE__ */ jsx6("span", {
                    className: `list-item-title truncate ${unreadCount ? "font-semibold" : "font-medium"}`,
                    children: item.name ?? "Chat"
                  }),
                  muted && /* @__PURE__ */ jsx6(Icon2, {
                    name: "bell-off",
                    size: 12,
                    className: "text-content-muted shrink-0"
                  }),
                  isIndexed === false && /* @__PURE__ */ jsx6(Icon2, {
                    name: "circle-alert",
                    size: 12,
                    className: "text-content-muted shrink-0"
                  })
                ]
              }),
              /* @__PURE__ */ jsx6("span", {
                className: "list-item-meta shrink-0 ml-2",
                children: item.timestamp ?? ""
              })
            ]
          }),
          /* @__PURE__ */ jsxs5("div", {
            className: "flex items-center gap-2",
            children: [
              /* @__PURE__ */ jsx6("span", {
                className: `list-item-secondary truncate flex-1 ${unreadCount ? "text-content-secondary" : "text-content-tertiary"}`,
                children: item.preview ?? ""
              }),
              item.is_pinned && !unreadCount && /* @__PURE__ */ jsx6(Icon2, {
                name: "pin",
                size: 14,
                className: "text-content-muted shrink-0"
              }),
              unreadCount !== undefined && unreadCount > 0 && /* @__PURE__ */ jsx6(UnreadBadge, {
                count: unreadCount
              })
            ]
          })
        ]
      })
    ]
  });
}

// plugins/modules/telegram/ui/TelegramDetailWrapper.tsx
import { useCallback as useCallback5, useMemo as useMemo4 } from "/api/plugins/__host-shim.js?m=react";
import { useQuery as useQuery2, useQueryClient } from "/api/plugins/__host-shim.js?m=react-query";

// plugins/modules/telegram/ui/TelegramChatView.tsx
import { useRef as useRef2, useEffect as useEffect3, useLayoutEffect, useCallback as useCallback3, useMemo as useMemo2 } from "/api/plugins/__host-shim.js?m=react";
import { Virtuoso } from "/api/plugins/__host-shim.js?m=react-virtuoso";
import { Icon as Icon3, IconButton, TopBarHeader, ContextMenu, useContextMenu } from "/api/plugins/__host-shim.js?m=ui";
import { DetailPane } from "/api/plugins/__host-shim.js?m=layout";
import { PaneFooterBar } from "/api/plugins/__host-shim.js?m=layout";

// plugins/modules/telegram/ui/TelegramReplyComposer.tsx
import { useCallback as useCallback2, useEffect as useEffect2, useRef, useState as useState3 } from "/api/plugins/__host-shim.js?m=react";
import { MessageComposer } from "/api/plugins/__host-shim.js?m=composer";
import { useComposerDraft } from "/api/plugins/__host-shim.js?m=composer";
import { useComposerMountRegistry } from "/api/plugins/__host-shim.js?m=composer";
import { applyComposerEvent } from "/api/plugins/__host-shim.js?m=composer";
import { useAppRuntime as useAppRuntime2 } from "/api/plugins/__host-shim.js?m=runtime";
import { jsx as jsx7 } from "/api/plugins/__host-shim.js?m=react-jsx-runtime";
function TelegramReplyComposer({
  chatId,
  onSendMessage,
  placeholder,
  disabled
}) {
  const threadKey = String(chatId);
  const runtime = useAppRuntime2();
  const registry = useComposerMountRegistry();
  const { draft, setText, clear, applyRemote } = useComposerDraft("telegram", threadKey);
  useEffect2(() => {
    const unregister = registry.register({
      mode: "telegram",
      threadKey,
      applyOp: applyRemote
    });
    runtime.composer.setPresence({ mode: "telegram", thread_key: threadKey });
    return () => {
      runtime.composer.setPresence(null);
      unregister();
    };
  }, [registry, runtime, threadKey, applyRemote]);
  const draftTextRef = useRef(draft.text);
  useEffect2(() => {
    draftTextRef.current = draft.text;
  }, [draft.text]);
  useEffect2(() => {
    const unsubscribe = runtime.composer.onApply((event) => {
      if (event.mode !== "telegram")
        return;
      if (event.thread_key !== threadKey)
        return;
      const typed = event;
      applyComposerEvent(typed, { mode: "telegram", threadKey, applyOp: applyRemote }, draftTextRef.current);
    });
    return () => {
      unsubscribe();
    };
  }, [runtime, threadKey, applyRemote]);
  const [sending, setSending] = useState3(false);
  const sendingRef = useRef(false);
  const handleSend = useCallback2(() => {
    if (sendingRef.current)
      return;
    const text = draft.text.trim();
    if (!text || !onSendMessage)
      return;
    sendingRef.current = true;
    setSending(true);
    const finish = (ok) => {
      sendingRef.current = false;
      setSending(false);
      if (ok)
        clear();
    };
    let result;
    try {
      result = onSendMessage(text);
    } catch {
      finish(false);
      return;
    }
    if (result && typeof result.then === "function") {
      result.then(() => {
        finish(true);
      }).catch(() => {
        finish(false);
      });
    } else {
      finish(true);
    }
  }, [draft.text, onSendMessage, clear]);
  return /* @__PURE__ */ jsx7(MessageComposer, {
    layout: "inline",
    sendIcon: "send",
    sendIconClassName: "text-[#6AB2F2]",
    value: draft.text,
    onChange: setText,
    onSend: onSendMessage ? handleSend : undefined,
    placeholder,
    disabled: disabled === true || sending || !onSendMessage,
    hideAttach: true,
    textareaTestId: "telegram-composer-textarea"
  });
}

// plugins/modules/telegram/ui/chatTitle.ts
function normalizeTelegramChatTitle(title) {
  const trimmed = (title ?? "").trim();
  if (trimmed === "" || trimmed === "-" || trimmed === "—") {
    return NEW_CHAT_TITLE;
  }
  return trimmed;
}

// plugins/modules/telegram/ui/utils/text.ts
function initialsFromName(name, maxLength = 2) {
  const initials = name.split(" ").map((word) => word[0]).filter(Boolean).join("").slice(0, maxLength).toUpperCase();
  return initials || "?";
}

// plugins/modules/telegram/ui/store.ts
import { createStore } from "/api/plugins/__host-shim.js?m=zustand/vanilla";
import { useStore } from "/api/plugins/__host-shim.js?m=zustand";
import { useAppRuntime as useAppRuntime3 } from "/api/plugins/__host-shim.js?m=runtime";
function useTelegramStore(selector) {
  const runtime = useAppRuntime3();
  const store = runtime.stores.get("telegram");
  if (!store)
    throw new Error("Telegram store not initialized");
  return useStore(store, selector ?? ((s) => s));
}

// plugins/modules/telegram/ui/TelegramChatView.tsx
import { jsx as jsx8, jsxs as jsxs6 } from "/api/plugins/__host-shim.js?m=react-jsx-runtime";
function renderMessageText(text) {
  const combined = /(\[([^\]]+)\]\((https?:\/\/[^)]+)\))|(https?:\/\/[^\s<>"{}|\\^`[\]]+)|(@[\w]+)|(\*\*([^*]+)\*\*)/g;
  const parts = [];
  let lastIndex = 0;
  let match;
  while ((match = combined.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    if (match[1]) {
      const label = match.at(2) ?? "";
      const url = match.at(3) ?? "";
      parts.push(/* @__PURE__ */ jsx8("a", {
        href: url,
        target: "_blank",
        rel: "noopener noreferrer",
        className: "break-all text-tg-accent hover:underline",
        children: label
      }, `mdlink-${String(match.index)}`));
    } else if (match[4]) {
      parts.push(/* @__PURE__ */ jsx8("a", {
        href: match[4],
        target: "_blank",
        rel: "noopener noreferrer",
        className: "break-all text-tg-accent hover:underline",
        children: match[4]
      }, `url-${String(match.index)}`));
    } else if (match[5]) {
      parts.push(/* @__PURE__ */ jsx8("span", {
        className: "cursor-pointer font-medium text-tg-accent hover:underline",
        children: match[5]
      }, `mention-${String(match.index)}`));
    } else if (match[6]) {
      parts.push(/* @__PURE__ */ jsx8("strong", {
        children: match[7]
      }, `bold-${String(match.index)}`));
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts.length > 0 ? parts : [text];
}
function groupMessages(messages, isGroup) {
  const result = [];
  let prevDate;
  for (let i = 0;i < messages.length; i++) {
    const msg = messages[i];
    if (!msg)
      continue;
    const prev = i > 0 ? messages[i - 1] : undefined;
    const next = i < messages.length - 1 ? messages[i + 1] : undefined;
    if (msg.senderName === "__date__") {
      result.push({
        msg,
        position: "single",
        showDate: false,
        showSender: false,
        showAvatar: false
      });
      continue;
    }
    const msgDate = msg.date ?? "";
    const showDate = msgDate !== "" && msgDate !== prevDate;
    if (msgDate)
      prevDate = msgDate;
    const sameAsPrev = prev && prev.senderName !== "__date__" && prev.direction === msg.direction && prev.senderName === msg.senderName && !showDate;
    const sameAsNext = next && next.senderName !== "__date__" && next.direction === msg.direction && next.senderName === msg.senderName && (next.date ?? "") === msgDate;
    let position;
    if (!sameAsPrev && !sameAsNext)
      position = "single";
    else if (!sameAsPrev && sameAsNext)
      position = "first";
    else if (sameAsPrev && sameAsNext)
      position = "middle";
    else
      position = "last";
    const showSender = isGroup && msg.direction === "in" && (position === "single" || position === "first");
    const showAvatar = isGroup && msg.direction === "in" && (position === "single" || position === "last");
    result.push({ msg, position, showDate, showSender, showAvatar });
  }
  return result;
}
function detectIsGroup(messages) {
  for (const m of messages) {
    if (m.direction === "in" && m.senderName && m.senderName.trim() !== "") {
      return true;
    }
  }
  return false;
}
function formatDateSeparator(isoDate) {
  const date = new Date(isoDate + "T00:00:00");
  const now = new Date;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const msgDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (msgDay.getTime() === today.getTime())
    return "Today";
  if (msgDay.getTime() === yesterday.getTime())
    return "Yesterday";
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString("en-GB", { day: "numeric", month: "long" });
  }
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric"
  });
}
function incomingCorners(pos) {
  switch (pos) {
    case "single":
      return "rounded-tl-[4px] rounded-tr-2xl rounded-br-2xl rounded-bl-2xl";
    case "first":
      return "rounded-tl-[4px] rounded-tr-2xl rounded-br-2xl rounded-bl-md";
    case "middle":
      return "rounded-tl-md rounded-tr-2xl rounded-br-2xl rounded-bl-md";
    case "last":
      return "rounded-tl-md rounded-tr-2xl rounded-br-2xl rounded-bl-2xl";
  }
}
function outgoingCorners(pos) {
  switch (pos) {
    case "single":
      return "rounded-tl-2xl rounded-tr-[4px] rounded-br-2xl rounded-bl-2xl";
    case "first":
      return "rounded-tl-2xl rounded-tr-[4px] rounded-br-md rounded-bl-2xl";
    case "middle":
      return "rounded-tl-2xl rounded-tr-md rounded-br-md rounded-bl-2xl";
    case "last":
      return "rounded-tl-2xl rounded-tr-md rounded-br-2xl rounded-bl-2xl";
  }
}
function ReplyQuote({
  replyTo,
  outgoing
}) {
  const color = replyTo.senderName ? senderColor(replyTo.senderName) : outgoing ? "#7EB8E0" : "#4FC3F7";
  return /* @__PURE__ */ jsx8("div", {
    className: "flex gap-2 mb-1 rounded-[4px] px-2 py-[5px] cursor-pointer min-w-0",
    style: {
      borderLeft: `2px solid ${color}`,
      backgroundColor: "rgba(255,255,255,0.06)"
    },
    children: /* @__PURE__ */ jsxs6("div", {
      className: "flex flex-col min-w-0 gap-[1px]",
      children: [
        replyTo.senderName && /* @__PURE__ */ jsx8("span", {
          className: "text-[12px] font-semibold truncate leading-tight",
          style: { color },
          children: replyTo.senderName
        }),
        /* @__PURE__ */ jsx8("span", {
          className: `text-[12px] truncate leading-tight ${outgoing ? "text-white/60" : "text-tg-text-date"}`,
          children: replyTo.text ? replyTo.text.length > 100 ? replyTo.text.slice(0, 100) + "..." : replyTo.text : replyTo.mediaType ?? "Message"
        })
      ]
    })
  });
}
function SenderAvatar({
  name,
  visible,
  avatarUrl
}) {
  if (!visible) {
    return /* @__PURE__ */ jsx8("div", {
      className: "w-[35px] shrink-0"
    });
  }
  return /* @__PURE__ */ jsx8("div", {
    className: "w-[35px] h-[35px] rounded-full flex items-center justify-center shrink-0 self-end overflow-hidden",
    style: { backgroundColor: senderColor(name) },
    children: avatarUrl ? /* @__PURE__ */ jsx8("img", {
      src: avatarUrl,
      alt: "",
      className: "w-full h-full object-cover"
    }) : /* @__PURE__ */ jsx8("span", {
      className: "text-white font-semibold text-[13px] leading-none",
      children: initialsFromName(name)
    })
  });
}
function InlineTime({
  time,
  outgoing,
  sendStatus
}) {
  if (outgoing) {
    let statusIcon;
    if (sendStatus === "sending") {
      statusIcon = /* @__PURE__ */ jsxs6("svg", {
        width: "14",
        height: "14",
        viewBox: "0 0 14 14",
        fill: "none",
        className: "inline-block",
        children: [
          /* @__PURE__ */ jsx8("circle", {
            cx: "7",
            cy: "7",
            r: "5.5",
            stroke: "#8e9ba7",
            strokeWidth: "1.2"
          }),
          /* @__PURE__ */ jsx8("path", {
            d: "M7 4V7.5L9 9",
            stroke: "#8e9ba7",
            strokeWidth: "1.2",
            strokeLinecap: "round",
            strokeLinejoin: "round"
          })
        ]
      });
    } else if (sendStatus === "sent") {
      statusIcon = /* @__PURE__ */ jsx8("svg", {
        width: "14",
        height: "10",
        viewBox: "0 0 14 10",
        fill: "none",
        className: "inline-block",
        children: /* @__PURE__ */ jsx8("path", {
          d: "M2 5L5.5 8.5L12 2",
          stroke: "#8e9ba7",
          strokeWidth: "1.5",
          strokeLinecap: "round",
          strokeLinejoin: "round"
        })
      });
    } else if (sendStatus === "failed") {
      statusIcon = /* @__PURE__ */ jsxs6("svg", {
        width: "14",
        height: "14",
        viewBox: "0 0 14 14",
        fill: "none",
        className: "inline-block",
        children: [
          /* @__PURE__ */ jsx8("circle", {
            cx: "7",
            cy: "7",
            r: "5.5",
            stroke: "#E53935",
            strokeWidth: "1.2"
          }),
          /* @__PURE__ */ jsx8("path", {
            d: "M7 4.5V7.5",
            stroke: "#E53935",
            strokeWidth: "1.3",
            strokeLinecap: "round"
          }),
          /* @__PURE__ */ jsx8("circle", {
            cx: "7",
            cy: "9.5",
            r: "0.7",
            fill: "#E53935"
          })
        ]
      });
    } else {
      statusIcon = /* @__PURE__ */ jsxs6("svg", {
        width: "16",
        height: "10",
        viewBox: "0 0 16 10",
        fill: "none",
        className: "inline-block",
        children: [
          /* @__PURE__ */ jsx8("path", {
            d: "M1.5 5.5L4.5 8.5L11 2",
            stroke: "#5DB97E",
            strokeWidth: "1.5",
            strokeLinecap: "round",
            strokeLinejoin: "round"
          }),
          /* @__PURE__ */ jsx8("path", {
            d: "M5.5 5.5L8.5 8.5L15 2",
            stroke: "#5DB97E",
            strokeWidth: "1.5",
            strokeLinecap: "round",
            strokeLinejoin: "round"
          })
        ]
      });
    }
    return /* @__PURE__ */ jsxs6("span", {
      className: "text-white/40 text-[11px] whitespace-nowrap inline-flex items-center gap-1 float-right relative ml-2 mt-[4px] mb-[-2px]",
      children: [
        time,
        statusIcon
      ]
    });
  }
  return /* @__PURE__ */ jsx8("span", {
    className: "float-right relative ml-2 mt-[4px] mb-[-2px] whitespace-nowrap text-[11px] text-tg-text-muted",
    children: time
  });
}
function DateChip({ label }) {
  return /* @__PURE__ */ jsx8("div", {
    className: "flex justify-center w-full py-2 sticky top-0 z-10",
    children: /* @__PURE__ */ jsx8("div", {
      className: "rounded-xl bg-tg-bg-date px-3 py-[3px] backdrop-blur-sm",
      children: /* @__PURE__ */ jsx8("span", {
        className: "text-[12px] font-medium text-tg-text-date",
        children: label
      })
    })
  });
}
function MediaContent({
  message,
  outgoing
}) {
  if (!message.mediaUrl)
    return null;
  const type = message.mediaType ?? "";
  if (type === "photo" || type === "animation") {
    return /* @__PURE__ */ jsx8("img", {
      src: message.mediaUrl,
      alt: "",
      loading: "lazy",
      className: "max-w-[300px] max-h-[400px] rounded-lg object-cover mb-1",
      onError: (e) => {
        e.target.style.display = "none";
      }
    });
  }
  if (type === "sticker") {
    return /* @__PURE__ */ jsx8("img", {
      src: message.mediaUrl,
      alt: "Sticker",
      loading: "lazy",
      className: "w-[180px] h-[180px] object-contain mb-1",
      onError: (e) => {
        e.target.style.display = "none";
      }
    });
  }
  if (type === "video" || type === "video_note") {
    return /* @__PURE__ */ jsx8("video", {
      src: message.mediaUrl,
      controls: true,
      preload: "metadata",
      className: "max-w-[300px] max-h-[300px] rounded-lg mb-1"
    });
  }
  if (type === "voice" || type === "audio") {
    return /* @__PURE__ */ jsxs6("div", {
      children: [
        /* @__PURE__ */ jsx8("audio", {
          src: message.mediaUrl,
          controls: true,
          preload: "metadata",
          className: "max-w-[260px] mb-1"
        }),
        type === "voice" && message.text && /* @__PURE__ */ jsx8("p", {
          className: `text-xs mt-1 italic ${outgoing ? "text-white/70" : "text-content-secondary"}`,
          children: message.text
        })
      ]
    });
  }
  if (type === "document") {
    const filename = message.mediaUrl.split("/").pop() ?? "Document";
    return /* @__PURE__ */ jsxs6("a", {
      href: message.mediaUrl,
      target: "_blank",
      rel: "noopener noreferrer",
      className: `mb-1 flex items-center gap-2 text-[13px] hover:underline ${outgoing ? "text-white/80" : "text-tg-accent"}`,
      children: [
        /* @__PURE__ */ jsx8(Icon3, {
          name: "file",
          size: 16,
          className: "shrink-0"
        }),
        /* @__PURE__ */ jsx8("span", {
          className: "truncate",
          children: filename
        })
      ]
    });
  }
  return /* @__PURE__ */ jsx8("a", {
    href: message.mediaUrl,
    target: "_blank",
    rel: "noopener noreferrer",
    className: `mb-1 text-[13px] italic hover:underline ${outgoing ? "text-white/80" : "text-tg-accent"}`,
    children: type || "Media"
  });
}
function IncomingBubble({
  message,
  showSender,
  showAvatar,
  position,
  replyTo,
  isGroup
}) {
  const gap = position === "first" || position === "single" ? "mt-1" : "mt-[2px]";
  return /* @__PURE__ */ jsxs6("div", {
    className: `flex items-end gap-[6px] max-w-[75%] ${gap}`,
    children: [
      isGroup && /* @__PURE__ */ jsx8(SenderAvatar, {
        name: message.senderName ?? "?",
        visible: showAvatar,
        avatarUrl: message.senderAvatarUrl
      }),
      /* @__PURE__ */ jsxs6("div", {
        className: `flex min-w-0 flex-col overflow-hidden bg-tg-bg-msg-in px-[10px] pt-[6px] pb-[5px] ${incomingCorners(position)}`,
        children: [
          showSender && message.senderName && /* @__PURE__ */ jsx8("span", {
            className: "text-[13px] font-semibold mb-[2px] leading-tight",
            style: { color: senderColor(message.senderName) },
            children: message.senderName
          }),
          replyTo && /* @__PURE__ */ jsx8(ReplyQuote, {
            replyTo
          }),
          message.mediaUrl && /* @__PURE__ */ jsx8(MediaContent, {
            message
          }),
          message.text ? /* @__PURE__ */ jsxs6("div", {
            className: "text-tg-text text-[14px] leading-[1.4] whitespace-pre-wrap break-words",
            children: [
              renderMessageText(message.text),
              /* @__PURE__ */ jsx8(InlineTime, {
                time: message.time
              })
            ]
          }) : /* @__PURE__ */ jsx8(InlineTime, {
            time: message.time
          })
        ]
      })
    ]
  });
}
function OutgoingBubble({
  message,
  position,
  replyTo
}) {
  const gap = position === "first" || position === "single" ? "mt-1" : "mt-[2px]";
  return /* @__PURE__ */ jsx8("div", {
    className: `flex justify-end w-full ${gap}`,
    children: /* @__PURE__ */ jsxs6("div", {
      className: `flex max-w-[75%] min-w-0 flex-col overflow-hidden bg-tg-bg-msg-out px-[10px] pt-[6px] pb-[5px] ${outgoingCorners(position)}`,
      children: [
        replyTo && /* @__PURE__ */ jsx8(ReplyQuote, {
          replyTo,
          outgoing: true
        }),
        message.mediaUrl && /* @__PURE__ */ jsx8(MediaContent, {
          message,
          outgoing: true
        }),
        message.text ? /* @__PURE__ */ jsxs6("div", {
          className: "text-white text-[14px] leading-[1.4] whitespace-pre-wrap break-words",
          children: [
            renderMessageText(message.text),
            /* @__PURE__ */ jsx8(InlineTime, {
              time: message.time,
              outgoing: true,
              sendStatus: message.sendStatus
            })
          ]
        }) : /* @__PURE__ */ jsx8(InlineTime, {
          time: message.time,
          outgoing: true,
          sendStatus: message.sendStatus
        })
      ]
    })
  });
}
function TelegramChatView({
  conversation,
  inputPlaceholder,
  loading,
  hasMore,
  onLoadMore,
  backfilling,
  hasMoreOnServer,
  onBackfill,
  onSendMessage,
  onReplyByAgent,
  isIndexed,
  onToggleIndexing
}) {
  const scrollRef = useRef2(null);
  const virtuosoRef = useRef2(null);
  const scrollToBottomRef = useRef2(true);
  const prependScrollHeight = useRef2(null);
  const isAtBottomRef = useRef2(true);
  const contextMenu = useContextMenu();
  const headerMenu = useContextMenu();
  const pendingMessageId = useTelegramStore((s) => s.pendingMessageId);
  const headerBtnRef = useRef2(null);
  const headerMenuItems = useMemo2(() => [
    {
      id: "toggle_indexing",
      label: isIndexed === false ? "Enable indexing" : "Disable indexing",
      icon: isIndexed === false ? "circle-check" : "circle-alert"
    }
  ], [isIndexed]);
  const handleOpenHeaderMenu = useCallback3(() => {
    const rect = headerBtnRef.current?.getBoundingClientRect();
    if (!rect)
      return;
    headerMenu.open({ clientX: rect.right, clientY: rect.bottom, preventDefault: () => {} }, null);
  }, [headerMenu]);
  const handleHeaderMenuSelect = useCallback3((itemId) => {
    headerMenu.close();
    if (itemId === "toggle_indexing") {
      onToggleIndexing?.();
    }
  }, [headerMenu, onToggleIndexing]);
  const handleMenuSelect = useCallback3((itemId) => {
    const msg = contextMenu.state.data;
    contextMenu.close();
    if (!msg)
      return;
    switch (itemId) {
      case "reply-agent":
        onReplyByAgent?.(msg);
        break;
      case "copy":
        if (msg.text)
          navigator.clipboard.writeText(msg.text);
        break;
    }
  }, [contextMenu, onReplyByAgent]);
  useEffect3(() => {
    scrollToBottomRef.current = true;
    isAtBottomRef.current = true;
    prependScrollHeight.current = null;
  }, [conversation?.chatId]);
  const prevMsgCountRef = useRef2(0);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el)
      return;
    const count = grouped.length;
    const hasPending = !!pendingMessageId;
    if (scrollToBottomRef.current && !hasPending) {
      el.scrollTop = el.scrollHeight;
      scrollToBottomRef.current = false;
      prependScrollHeight.current = null;
    } else if (scrollToBottomRef.current && hasPending) {
      scrollToBottomRef.current = false;
      prependScrollHeight.current = null;
    } else if (prependScrollHeight.current !== null) {
      const diff = el.scrollHeight - prependScrollHeight.current;
      if (diff > 0) {
        el.scrollTop += diff;
        prependScrollHeight.current = null;
      }
    } else if (count > prevMsgCountRef.current && isAtBottomRef.current && !hasPending) {
      el.scrollTop = el.scrollHeight;
    }
    prevMsgCountRef.current = count;
  });
  useEffect3(() => {
    if (loading || backfilling)
      return;
    if (scrollToBottomRef.current)
      return;
    const el = scrollRef.current;
    if (!el || el.scrollTop >= 200)
      return;
    if (hasMore && onLoadMore) {
      prependScrollHeight.current = el.scrollHeight;
      onLoadMore();
    } else if (!hasMore && hasMoreOnServer && onBackfill) {
      onBackfill();
    }
  }, [loading, backfilling]);
  const clearPendingMessage = useTelegramStore((s) => s.actions.setPendingMessageId);
  const pendingTelegramMsgId = useTelegramStore((s) => s.pendingTelegramMsgId);
  const messageCount = conversation?.messages.length ?? 0;
  useEffect3(() => {
    if (!pendingMessageId)
      return;
    let el = document.getElementById(`tg-msg-${pendingMessageId}`);
    if (!el && pendingTelegramMsgId !== undefined && conversation?.messages) {
      const match = conversation.messages.find((m) => m.telegramMsgId === pendingTelegramMsgId);
      if (match) {
        el = document.getElementById(`tg-msg-${match.id}`);
      }
    }
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("bg-white/5");
      setTimeout(() => {
        el.classList.remove("bg-white/5");
      }, 2000);
      clearPendingMessage(undefined);
      return;
    }
    if (!loading && !backfilling) {
      if (hasMore && onLoadMore) {
        onLoadMore();
      } else if (!hasMore && hasMoreOnServer && onBackfill) {
        onBackfill();
      } else {
        clearPendingMessage(undefined);
      }
    }
  }, [pendingMessageId, pendingTelegramMsgId, clearPendingMessage, messageCount, loading, backfilling, hasMore, onLoadMore, hasMoreOnServer, onBackfill, conversation?.messages]);
  const dedupedMessages = useMemo2(() => {
    if (!conversation)
      return [];
    const seen = new Set;
    return conversation.messages.filter((m) => {
      if (seen.has(m.id))
        return false;
      seen.add(m.id);
      return true;
    });
  }, [conversation?.messages]);
  const isGroup = useMemo2(() => detectIsGroup(dedupedMessages), [dedupedMessages]);
  const grouped = useMemo2(() => groupMessages(dedupedMessages, isGroup), [dedupedMessages, isGroup]);
  const msgLookup = useMemo2(() => {
    const map = new Map;
    for (const m of dedupedMessages) {
      if (m.telegramMsgId !== undefined) {
        map.set(m.telegramMsgId, m);
      }
    }
    return map;
  }, [dedupedMessages]);
  const chatTitle = normalizeTelegramChatTitle(conversation?.contactName);
  if (!conversation) {
    return /* @__PURE__ */ jsx8(DetailPane, {
      children: /* @__PURE__ */ jsx8("div", {
        className: "flex items-center justify-center h-full text-content-tertiary text-base",
        children: "Select an item to view details"
      })
    });
  }
  return /* @__PURE__ */ jsxs6(DetailPane, {
    scrollY: false,
    contentClassName: "p-0",
    headerNode: /* @__PURE__ */ jsx8(TopBarHeader, {
      leading: null,
      title: chatTitle,
      subtitle: `${String(conversation.messageTotal)} messages`,
      actions: /* @__PURE__ */ jsx8("div", {
        ref: headerBtnRef,
        children: /* @__PURE__ */ jsx8(IconButton, {
          variant: "ghost",
          onClick: handleOpenHeaderMenu,
          children: /* @__PURE__ */ jsx8(Icon3, {
            name: "ellipsis-vertical",
            size: 18
          })
        })
      })
    }),
    footer: /* @__PURE__ */ jsx8(PaneFooterBar, {
      tone: "surface-tertiary",
      inset: "md",
      withTopBorder: false,
      className: "!pt-4 !pb-6",
      children: /* @__PURE__ */ jsx8("div", {
        className: "flex-1 flex justify-center",
        children: /* @__PURE__ */ jsx8("div", {
          className: "w-[92%]",
          children: /* @__PURE__ */ jsx8(TelegramReplyComposer, {
            chatId: conversation.chatId,
            onSendMessage,
            placeholder: inputPlaceholder,
            disabled: !onSendMessage
          })
        })
      })
    }),
    children: [
      headerMenu.state.isOpen && /* @__PURE__ */ jsx8(ContextMenu, {
        items: headerMenuItems,
        position: headerMenu.state.position,
        onSelect: handleHeaderMenuSelect,
        onClose: headerMenu.close
      }),
      /* @__PURE__ */ jsxs6("div", {
        className: "flex h-full flex-1 flex-col",
        children: [
          (loading === true || backfilling === true) && /* @__PURE__ */ jsx8("div", {
            className: "flex justify-center py-2",
            children: /* @__PURE__ */ jsx8("span", {
              className: "text-content-tertiary text-xs animate-pulse",
              children: backfilling ? "Loading from Telegram..." : "Loading..."
            })
          }),
          /* @__PURE__ */ jsx8(Virtuoso, {
            ref: virtuosoRef,
            data: grouped,
            initialTopMostItemIndex: grouped.length > 0 ? grouped.length - 1 : 0,
            followOutput: "smooth",
            className: "flex-1 py-2 overflow-x-hidden",
            increaseViewportBy: { top: 400, bottom: 200 },
            atTopStateChange: (atTop) => {
              if (!atTop)
                return;
              if (hasMore && onLoadMore)
                onLoadMore();
              else if (hasMoreOnServer && onBackfill)
                onBackfill();
            },
            itemContent: (_index, { msg, position, showDate, showSender, showAvatar }) => {
              if (msg.senderName === "__date__") {
                return /* @__PURE__ */ jsx8(DateChip, {
                  label: msg.time
                });
              }
              const replyTo = msg.replyToMsgId !== undefined ? msgLookup.get(msg.replyToMsgId) : undefined;
              return /* @__PURE__ */ jsxs6("div", {
                id: `tg-msg-${msg.id}`,
                className: "px-4",
                onContextMenu: (e) => {
                  contextMenu.open(e, msg);
                },
                children: [
                  showDate && msg.date && /* @__PURE__ */ jsx8(DateChip, {
                    label: formatDateSeparator(msg.date)
                  }),
                  msg.direction === "out" ? /* @__PURE__ */ jsx8(OutgoingBubble, {
                    message: msg,
                    position,
                    replyTo
                  }) : /* @__PURE__ */ jsx8(IncomingBubble, {
                    message: msg,
                    showSender,
                    showAvatar,
                    position,
                    replyTo,
                    isGroup
                  })
                ]
              });
            }
          })
        ]
      }),
      contextMenu.state.isOpen && /* @__PURE__ */ jsx8(ContextMenu, {
        items: MESSAGE_MENU_ITEMS,
        position: contextMenu.state.position,
        onSelect: handleMenuSelect,
        onClose: contextMenu.close
      })
    ]
  });
}

// plugins/modules/telegram/ui/hooks/useTelegramMessages.ts
import { useCallback as useCallback4, useEffect as useEffect4, useMemo as useMemo3, useRef as useRef3, useState as useState4 } from "/api/plugins/__host-shim.js?m=react";
import { useAppRuntime as useAppRuntime5 } from "/api/plugins/__host-shim.js?m=runtime";

// plugins/modules/telegram/ui/queries.ts
import { useQuery } from "/api/plugins/__host-shim.js?m=react-query";
import { useAppRuntime as useAppRuntime4 } from "/api/plugins/__host-shim.js?m=runtime";
var telegramKeys = {
  all: ["telegram"],
  chats: (params) => [...telegramKeys.all, "chats", params],
  messages: (chatId, params) => [...telegramKeys.all, "messages", chatId, params],
  chatDetail: (chatId) => [...telegramKeys.all, "chat", chatId]
};
function useTelegramMessagesQuery(chatId, limit, offset) {
  const runtime = useAppRuntime4();
  return useQuery({
    queryKey: telegramKeys.messages(chatId ?? "", { limit, offset }),
    queryFn: () => runtime.transport.rpc("telegram.messages.list", { entity_id: chatId, limit, offset }),
    enabled: !!chatId,
    staleTime: 15000
  });
}

// plugins/modules/telegram/ui/hooks/useTelegramMessages.ts
function mapMessages(items, baseUrl) {
  return items.map((m) => {
    const mMediaUrl = m.metadata?.media_url;
    const mMediaType = m.metadata?.media_type;
    const prefixedMediaUrl = mMediaUrl?.startsWith("/") ? `${baseUrl}${mMediaUrl}` : mMediaUrl;
    const mSenderAvatarUrl = m.metadata?.sender_avatar_url;
    const prefixedSenderAvatarUrl = mSenderAvatarUrl?.startsWith("/") ? `${baseUrl}${mSenderAvatarUrl}` : mSenderAvatarUrl;
    return {
      id: m.id,
      direction: m.metadata?.is_outgoing === true || m.metadata?.is_outgoing === 1 ? "out" : "in",
      senderName: m.metadata?.sender_name ?? m.sender ?? undefined,
      senderAvatarUrl: prefixedSenderAvatarUrl,
      text: m.preview ?? m.metadata?.text ?? mediaLabel(mMediaType),
      time: formatMessageTime(m.timestamp),
      date: m.timestamp.slice(0, 10),
      mediaType: mMediaType,
      mediaUrl: prefixedMediaUrl,
      telegramMsgId: m.metadata?.message_id,
      replyToMsgId: m.metadata?.reply_to_msg_id
    };
  }).filter((m) => m.text !== "" || m.mediaUrl);
}
function useTelegramMessages(selectedChatId, chats) {
  const runtime = useAppRuntime5();
  const baseUrl = runtime.transport.baseUrl;
  const nativeChatId = useMemo3(() => {
    if (!selectedChatId)
      return;
    const chat = chats.find((c) => c.id === selectedChatId);
    return chat?.chatId;
  }, [selectedChatId, chats]);
  const { data: queryData, isLoading: queryLoading } = useTelegramMessagesQuery(selectedChatId, PAGE_SIZE, 0);
  const [loading, setLoading] = useState4(false);
  const [hasMore, setHasMore] = useState4(false);
  const [backfilling, setBackfilling] = useState4(false);
  const [hasMoreOnServer, setHasMoreOnServer] = useState4(true);
  const [extraMessages, setExtraMessages] = useState4([]);
  const [optimisticMessages, setOptimisticMessages] = useState4([]);
  const [fetchedTotal, setFetchedTotal] = useState4(null);
  const offsetRef = useRef3(0);
  const initialMessages = useMemo3(() => {
    if (!queryData)
      return null;
    const mapped = mapMessages(queryData.items, baseUrl);
    mapped.reverse();
    return mapped;
  }, [queryData, baseUrl]);
  const allMessages = useMemo3(() => {
    const base = initialMessages ?? [];
    return [...extraMessages, ...base, ...optimisticMessages];
  }, [extraMessages, initialMessages, optimisticMessages]);
  const conversation = useMemo3(() => {
    if (!selectedChatId)
      return;
    if (!queryData)
      return;
    const chatData = chats.find((c) => c.id === selectedChatId);
    const chatName = normalizeTelegramChatTitle(queryData.items[0]?.metadata?.chat_title ?? chatData?.name ?? queryData.items[0]?.sender);
    const grownTotal = fetchedTotal !== null && fetchedTotal.chatId === selectedChatId ? fetchedTotal.total : 0;
    return {
      chatId: selectedChatId,
      contactName: chatName,
      contactInitials: initialsFromName(chatName),
      contactAvatarColor: pickAvatarColor(chatName),
      contactAvatarUrl: chatData?.avatarUrl,
      messageTotal: Math.max(queryData.total, grownTotal),
      messages: allMessages
    };
  }, [selectedChatId, queryData, chats, allMessages, fetchedTotal]);
  useEffect4(() => {
    if (queryData) {
      setHasMore(queryData.items.length < queryData.total);
    }
  }, [queryData]);
  useEffect4(() => {
    if (!selectedChatId)
      return;
    offsetRef.current = 0;
    setExtraMessages([]);
    setOptimisticMessages([]);
    setHasMore(false);
    setHasMoreOnServer(true);
    setFetchedTotal(null);
  }, [selectedChatId]);
  useEffect4(() => {
    if (!selectedChatId)
      return;
    const chatId = selectedChatId;
    return runtime.transport.onEventType(["sync.progress"], (event) => {
      const raw = event.payload ?? {};
      if (raw.module_id !== "telegram" && raw.source_id !== "telegram")
        return;
      if (raw.phase !== "live")
        return;
      runtime.queryClient.invalidateQueries({
        queryKey: telegramKeys.messages(chatId)
      });
    });
  }, [selectedChatId, runtime]);
  const fetchMessages = useCallback4(async (chatId, offset, append) => {
    if (offset === 0 && !append) {
      setExtraMessages([]);
      setOptimisticMessages([]);
      offsetRef.current = 0;
      runtime.queryClient.invalidateQueries({
        queryKey: telegramKeys.messages(chatId)
      });
      return;
    }
    setLoading(true);
    try {
      const result = await runtime.transport.rpc("telegram.messages.list", { entity_id: chatId, limit: PAGE_SIZE, offset });
      const newMessages = mapMessages(result.items, baseUrl);
      newMessages.reverse();
      if (append) {
        setExtraMessages((prev) => [...newMessages, ...prev]);
      } else {
        setExtraMessages(newMessages);
      }
      setHasMore(offset + result.items.length < result.total);
      setFetchedTotal({ chatId, total: result.total });
    } catch {} finally {
      setLoading(false);
    }
  }, [baseUrl, runtime.transport]);
  const handleLoadMore = useCallback4(() => {
    if (!selectedChatId || loading || queryLoading || !hasMore)
      return;
    const newOffset = offsetRef.current + PAGE_SIZE;
    offsetRef.current = newOffset;
    fetchMessages(selectedChatId, newOffset, true);
  }, [selectedChatId, loading, queryLoading, hasMore, fetchMessages]);
  const backfillTimerRef = useRef3(null);
  const awaitingBackfillRef = useRef3(false);
  const clearBackfillWait = useCallback4(() => {
    awaitingBackfillRef.current = false;
    setBackfilling(false);
    if (backfillTimerRef.current) {
      clearTimeout(backfillTimerRef.current);
      backfillTimerRef.current = null;
    }
  }, []);
  const handleBackfill = useCallback4(() => {
    if (!selectedChatId || backfilling || !hasMoreOnServer)
      return;
    let oldestMsgId;
    for (const m of allMessages) {
      if (m.telegramMsgId !== undefined && (oldestMsgId === undefined || m.telegramMsgId < oldestMsgId)) {
        oldestMsgId = m.telegramMsgId;
      }
    }
    if (!oldestMsgId)
      return;
    awaitingBackfillRef.current = true;
    setBackfilling(true);
    if (backfillTimerRef.current)
      clearTimeout(backfillTimerRef.current);
    backfillTimerRef.current = setTimeout(clearBackfillWait, 60000);
    runtime.transport.rpc("telegram.messages.backfill", {
      chat_id: Number(nativeChatId),
      before_message_id: oldestMsgId,
      limit: PAGE_SIZE
    }).catch((err) => {
      console.error("Backfill request failed:", err);
      clearBackfillWait();
    });
  }, [selectedChatId, backfilling, hasMoreOnServer, allMessages, runtime, nativeChatId, clearBackfillWait]);
  useEffect4(() => {
    const off = runtime.transport.onEventType(["sync.backfill"], (event) => {
      if (!awaitingBackfillRef.current)
        return;
      const raw = event.payload ?? {};
      if (nativeChatId === undefined || String(raw.chat_id) !== nativeChatId)
        return;
      const ingested = typeof raw.ingested === "number" ? raw.ingested : 0;
      clearBackfillWait();
      if (ingested === 0) {
        setHasMoreOnServer(false);
      } else if (selectedChatId) {
        const newOffset = offsetRef.current + PAGE_SIZE;
        offsetRef.current = newOffset;
        fetchMessages(selectedChatId, newOffset, true);
      }
    });
    return off;
  }, [runtime, nativeChatId, selectedChatId, fetchMessages, clearBackfillWait]);
  const OP_SYNC_PAGES = 4;
  const opSyncChatRef = useRef3(undefined);
  const opSyncPagesRef = useRef3(0);
  useEffect4(() => {
    if (opSyncChatRef.current !== selectedChatId) {
      opSyncChatRef.current = selectedChatId;
      opSyncPagesRef.current = 0;
    }
    if (!selectedChatId || backfilling || !hasMoreOnServer)
      return;
    if (allMessages.length === 0)
      return;
    if (opSyncPagesRef.current >= OP_SYNC_PAGES)
      return;
    opSyncPagesRef.current += 1;
    handleBackfill();
  }, [selectedChatId, backfilling, hasMoreOnServer, allMessages, handleBackfill]);
  const handleSendMessage = useCallback4((text) => {
    if (!selectedChatId)
      return;
    const chatId = selectedChatId;
    const pendingId = `_pending_${String(Date.now())}`;
    const now = new Date;
    const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const dateStr = now.toISOString().slice(0, 10);
    const optimistic = {
      id: pendingId,
      direction: "out",
      text,
      time: timeStr,
      date: dateStr,
      sendStatus: "sending"
    };
    setOptimisticMessages((prev) => [...prev, optimistic]);
    (async () => {
      try {
        await runtime.transport.rpc("telegram.messages.send", {
          chat_id: Number(nativeChatId),
          text,
          reply_to_message_id: null
        });
        setOptimisticMessages((prev) => prev.map((m) => m.id === pendingId ? { ...m, sendStatus: "sent" } : m));
        setTimeout(() => {
          offsetRef.current = 0;
          setExtraMessages([]);
          setOptimisticMessages([]);
          runtime.queryClient.invalidateQueries({
            queryKey: telegramKeys.messages(chatId)
          });
        }, 1500);
      } catch (err) {
        console.error("Failed to send message:", err);
        setOptimisticMessages((prev) => prev.map((m) => m.id === pendingId ? { ...m, sendStatus: "failed" } : m));
      }
    })();
  }, [selectedChatId, runtime]);
  const handleReplyByAgent = useCallback4((message) => {
    if (!selectedChatId)
      return;
    runtime.agent.setReplyTo({
      entityId: message.id,
      schemaId: "telegram.message",
      name: message.senderName ?? "Message",
      data: {
        sender: message.senderName ?? "Unknown",
        preview: message.text.slice(0, 100),
        timestamp: message.time,
        metadata: {
          message_id: message.telegramMsgId,
          chat_id: nativeChatId,
          sender_name: message.senderName
        }
      }
    });
  }, [runtime, selectedChatId]);
  return {
    conversation,
    loading: loading || queryLoading,
    hasMore,
    backfilling,
    hasMoreOnServer,
    fetchMessages,
    handleLoadMore,
    handleBackfill,
    handleSendMessage,
    handleReplyByAgent
  };
}

// plugins/modules/telegram/ui/hooks/useTelegramSync.ts
import { useEffect as useEffect5, useRef as useRef4 } from "/api/plugins/__host-shim.js?m=react";
import { useAppRuntime as useAppRuntime6 } from "/api/plugins/__host-shim.js?m=runtime";
function useTelegramSync(onRefreshChats) {
  const runtime = useAppRuntime6();
  const onRefreshChatsRef = useRef4(onRefreshChats);
  onRefreshChatsRef.current = onRefreshChats;
  useEffect5(() => {
    let refreshTimer = null;
    const debouncedRefresh = () => {
      if (refreshTimer)
        clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        onRefreshChatsRef.current();
      }, 1000);
    };
    const offSyncProgress = runtime.transport.onEventType(["sync.progress"], (event) => {
      const raw = event.payload ?? {};
      if (raw.module_id !== "telegram" && raw.source_id !== "telegram")
        return;
      debouncedRefresh();
    });
    return () => {
      offSyncProgress();
      if (refreshTimer)
        clearTimeout(refreshTimer);
    };
  }, []);
}

// plugins/modules/telegram/ui/TelegramDetailWrapper.tsx
import { useAppRuntime as useAppRuntime7 } from "/api/plugins/__host-shim.js?m=runtime";
import { jsx as jsx9 } from "/api/plugins/__host-shim.js?m=react-jsx-runtime";
function useTelegramChatFromFacets(entityId) {
  const runtime = useAppRuntime7();
  const baseUrl = runtime.transport.baseUrl;
  const { data: response } = useQuery2({
    queryKey: telegramKeys.chatDetail(entityId),
    queryFn: () => runtime.transport.rpc("graph.facet.list", {
      entity_id: entityId,
      schema_id: "telegram.chat.details"
    }),
    enabled: !!entityId,
    staleTime: 60000
  });
  return useMemo4(() => {
    if (!response || response.items.length === 0)
      return;
    const d = response.items.at(0)?.data;
    if (!d)
      return;
    const chatId = typeof d.chat_id === "string" || typeof d.chat_id === "number" ? String(d.chat_id) : undefined;
    if (!chatId)
      return;
    const rawTitle = d.chat_title ?? d.title;
    const name = normalizeTelegramChatTitle(rawTitle);
    const avatarUrl = d.avatar_url;
    const isIndexed = d.is_indexed;
    return {
      id: entityId,
      chatId,
      name,
      initials: initialsFromName(name),
      avatarColor: pickAvatarColor(name),
      avatarUrl: resolveAvatarUrl(baseUrl, avatarUrl ?? null),
      lastMessage: "",
      time: "",
      pinned: d.is_pinned ?? false,
      isIndexed: isIndexed ?? undefined
    };
  }, [response, entityId, baseUrl]);
}
function TelegramDetailWrapper({
  entityId
}) {
  const runtime = useAppRuntime7();
  const queryClient = useQueryClient();
  const selectedChat = useTelegramChatFromFacets(entityId);
  const chats = useMemo4(() => selectedChat ? [selectedChat] : [], [selectedChat]);
  const messages = useTelegramMessages(entityId, chats);
  const refreshChats = useCallback5(() => {
    queryClient.invalidateQueries({ queryKey: telegramKeys.chats() });
  }, [queryClient]);
  useTelegramSync(refreshChats);
  const handleToggleIndexing = useCallback5(async () => {
    if (!entityId)
      return;
    const newValue = !(selectedChat?.isIndexed ?? true);
    await runtime.transport.rpc("telegram.chats.set_indexed", {
      chat_id: selectedChat?.chatId ?? entityId,
      is_indexed: newValue
    });
    queryClient.invalidateQueries({ queryKey: telegramKeys.chats() });
    queryClient.invalidateQueries({ queryKey: telegramKeys.chatDetail(entityId) });
  }, [entityId, selectedChat?.isIndexed, selectedChat?.chatId, runtime, queryClient]);
  return /* @__PURE__ */ jsx9(TelegramChatView, {
    conversation: messages.conversation,
    inputPlaceholder: INPUT_PLACEHOLDER,
    loading: messages.loading,
    hasMore: messages.hasMore,
    onLoadMore: messages.handleLoadMore,
    backfilling: messages.backfilling,
    hasMoreOnServer: messages.hasMoreOnServer,
    onBackfill: messages.handleBackfill,
    onSendMessage: messages.handleSendMessage,
    onReplyByAgent: messages.handleReplyByAgent,
    isIndexed: selectedChat?.isIndexed,
    onToggleIndexing: () => {
      handleToggleIndexing();
    }
  });
}

// plugins/modules/telegram/ui/index.tsx
import { setupEventInvalidation } from "/api/plugins/__host-shim.js?m=runtime";
import { writeDraftDirect } from "/api/plugins/__host-shim.js?m=composer";
import { jsx as jsx10 } from "/api/plugins/__host-shim.js?m=react-jsx-runtime";
var SEARCH_PLACEHOLDER = "Search chats...";
var INPUT_PLACEHOLDER = "Type a message...";
var NEW_CHAT_TITLE = "New chat";
var PAGE_SIZE = 50;
var CHATS_PAGE_SIZE = 40;
var CHAT_CACHE_KEY = "tg:chat-list";
var CHAT_CACHE_TTL = 86400000;
var TELEGRAM_AUTH_POLL_INTERVAL = 1500;
var MEDIA_LABELS = {
  photo: "Photo",
  video: "Video",
  sticker: "Sticker",
  document: "Document",
  voice: "Voice message",
  audio: "Audio",
  poll: "Poll",
  location: "Location",
  contact: "Contact",
  gif: "GIF",
  webpage: "Link"
};
var TELEGRAM_AVATAR_COLORS = [
  "#FF6B35",
  "#4A90D9",
  "#43A047",
  "#E53935",
  "#8E24AA",
  "#D81B60"
];
var TELEGRAM_SENDER_COLORS = [
  "#FF6B6B",
  "#4FC3F7",
  "#81C784",
  "#FFB74D",
  "#BA68C8",
  "#4DD0E1",
  "#F06292",
  "#AED581"
];
var MESSAGE_MENU_ITEMS = [
  { id: "reply-agent", label: "Reply by Agent", icon: "bot" },
  { type: "separator" },
  { id: "reply", label: "Reply", icon: "corner-down-left" },
  { id: "copy", label: "Copy Text", icon: "copy" },
  { id: "pin", label: "Pin", icon: "pin" },
  { id: "forward", label: "Forward", icon: "arrow-right" },
  { id: "select", label: "Select", icon: "check-square" },
  { type: "separator" },
  { id: "delete", label: "Delete", icon: "trash", variant: "danger" }
];
var CHAT_CONTEXT_ITEMS = [
  { id: "mark_read", label: "Mark as read", icon: "check" },
  { id: "mute", label: "Mute notifications", icon: "bell-off" },
  { id: "pin", label: "Pin chat", icon: "pin" },
  { type: "separator" },
  { id: "delete", label: "Delete chat", icon: "trash", variant: "danger" }
];
function mapTelegramChatToListItem(raw) {
  const c = raw;
  const name = normalizeTelegramChatTitle(c.chat_title);
  const time = c.last_message_time ? formatChatListTime(c.last_message_time) : "";
  return {
    id: c.entity_id,
    name,
    schema_id: "telegram.chat",
    preview: c.last_message ?? null,
    timestamp: time,
    avatar_url: c.avatar_url ?? null,
    is_pinned: c.is_pinned === true,
    unread_count: undefined,
    metadata: {
      chatId: c.chat_id,
      initials: initialsFromName(name),
      avatarColor: pickAvatarColor(name),
      muted: false,
      isIndexed: c.is_indexed ?? undefined
    }
  };
}
var telegramAgentContribution = {
  systemPrompt: "You are a helpful personal assistant integrated into a relational agent system. " + "You help users manage their contacts, tasks, emails, and communications. " + `Be concise and proactive.

` + `ABSOLUTE RULES (violating these is a critical failure):
` + `1. NEVER list options, choices, or alternatives as numbered/bold text. ALWAYS use the ask_user tool instead.
` + "2. When asked to compose a reply or suggest message variants, use ask_user with each variant as a select_one option. " + "Put the short label (2-5 words) as the option label. Put the FULL message text as the option id. " + `After the user picks one, send it via telegram.messages.send.
` + `3. On your FIRST turn, you MUST call episodes.set_title.
` + `4. ask_user MUST be the very last tool call — call set_title BEFORE it, never after.
` + `5. After calling ask_user, produce NO text output — stop completely.

` + `LANGUAGE RULES (CRITICAL — follow strictly):
` + `1. YOUR responses to the user: Always in the user's language. User writes Russian → you reply Russian.
` + "2. OUTGOING MESSAGES (telegram.messages.send text): Always in the RECIPIENT's language. " + "Before composing, check chat history via telegram.messages.list to detect what language the recipient uses. " + `The 'text' argument you pass to telegram.messages.send MUST match the recipient's language.
` + `If no chat history is available, default to the user's language.

` + "CRITICAL: You receive a CURRENT UI CONTEXT block with every request. " + "This tells you exactly what the user is looking at right now. " + "When the user says 'this chat', 'read the messages', 'this person', etc., " + `ALWAYS use the IDs from the context block — do NOT search or guess.

` + `Tool usage rules:
` + `- If context includes a chat_id, use telegram.messages.list with that exact chat_id.
` + `- If context includes an entity ID, use contacts.get with that exact ID.
` + `- Only use contacts.list or telegram.chats.list when the user asks about something NOT in their current context.
` + `- When asked to send a message, use the send tool directly without asking for confirmation — the system has a built-in approval UI.
` + `- To message MANY contacts at once (outreach/follow-ups), use telegram.batch_send with ALL recipients in ONE call so it is ONE approval to review — do NOT fan out N telegram.messages.send calls, and do NOT set one trigger per contact, unless the user explicitly asks for per-contact handling.

` + `IMPORTANT — Pending approval responses:
` + "When telegram.messages.send returns 'pending_approval: true', " + "this means the message is queued for user approval, NOT an error. " + `Say you have drafted the message and it is ready for review.

` + `EPISODE TITLE (MANDATORY):
` + "On your FIRST response, you MUST call episodes.set_title with the episode_id from context. " + "Call it BEFORE ask_user if both are needed in the same turn. " + `Title should be in the user's language and describe the topic.

` + `ASKING QUESTIONS (MANDATORY):
` + "NEVER ask questions or present choices as plain text. " + "When you need user input — clarification, choosing between alternatives, " + "confirming an approach, or suggesting options — you MUST use the ask_user tool. " + "ask_user MUST be the very last tool call in a turn — nothing after it. " + `After calling ask_user, STOP immediately and output nothing else.
` + "When the user responds with '[User selected from ask_user options]', " + "this is their answer to your ask_user question. Proceed immediately with the selected option " + "(e.g. send the message with the chosen tone). NEVER re-ask or re-present the options.",
  historyRenderers: [
    {
      id: "telegram-send",
      moduleId: "telegram",
      match: (block) => block.toolName === "send_telegram_message" || block.toolName === "telegram_messages_send" || block.toolName === "telegram.messages.send",
      Render: TelegramToolCallRenderer,
      priority: 10
    }
  ],
  extractAllowlistTarget: (tc) => {
    if (tc.name !== "send_telegram_message" && tc.name !== "telegram_messages_send" && tc.name !== "telegram.messages.send")
      return null;
    const args = tc.args;
    const chatId = typeof args.chat_id === "string" || typeof args.chat_id === "number" ? String(args.chat_id) : null;
    if (!chatId)
      return null;
    return {
      action: "send_telegram_message",
      targetType: "telegram_chat",
      targetId: chatId,
      targetLabel: args.chat_name
    };
  },
  onDraftRequest: (payload, _runtime) => {
    const p = payload;
    const chatId = p.chatId ?? p.chat_id;
    const text = p.text ?? p.message;
    if (chatId !== undefined && text !== undefined) {
      writeDraftDirect("telegram", String(chatId), { text });
    }
    if (chatId !== undefined) {
      window.location.hash = `#/telegram/chat/${String(chatId)}`;
    } else {
      window.location.hash = `#/telegram`;
    }
  }
};
var TelegramModule = defineModule({
  id: "telegram",
  title: "Telegram",
  icon: /* @__PURE__ */ jsx10(TelegramIcon, {
    size: 26
  }),
  iconName: "send",
  themeColor: "blue",
  entityTypes: ["chat", "message"],
  primaryEntityType: "chat",
  rpc: { list: "telegram.chats.list" },
  ListItemContent: TelegramChatItemContent,
  headerActionIcon: "pencil",
  detailType: "custom",
  DetailPanel: TelegramDetailWrapper,
  mapListItem: mapTelegramChatToListItem,
  contextMenuItems: () => CHAT_CONTEXT_ITEMS,
  extendStore: (set) => ({
    selectedChatId: undefined,
    syncProgress: null,
    pendingMessageId: undefined,
    pendingTelegramMsgId: undefined,
    actions: {
      setSelectedChatId: (chatId) => {
        set({ selectedChatId: chatId });
      },
      setSearchQuery: (query) => {
        set({ searchQuery: query });
      },
      setSyncProgress: (progress) => {
        set({ syncProgress: progress });
      },
      setPendingMessageId: (id, telegramMsgId) => {
        set({ pendingMessageId: id, pendingTelegramMsgId: telegramMsgId });
      }
    }
  }),
  systemPrompt: telegramAgentContribution.systemPrompt,
  navigateToEntity: async (entityId, schemaId, data, runtime, navigate) => {
    const store = runtime.stores.get("telegram");
    if (!store)
      return;
    const { actions } = store.getState();
    if (schemaId === "telegram.message") {
      let telegramMsgId = data.metadata?.message_id;
      let chatEntityId;
      try {
        const links = await runtime.transport.rpc("graph.entity.get", { id: entityId });
        const chatLink = links.linked_entities?.find((e) => e.schema_id === "telegram.chat");
        chatEntityId = chatLink?.id;
        if (!telegramMsgId) {
          const detail = await runtime.transport.rpc("telegram.messages.get", { id: entityId });
          telegramMsgId = detail.metadata?.message_id;
        }
      } catch {}
      if (chatEntityId)
        actions.setSelectedChatId(chatEntityId);
      actions.setPendingMessageId(entityId, telegramMsgId);
      navigate("telegram", "chat", chatEntityId);
      return;
    } else if (schemaId === "telegram.chat") {
      actions.setSelectedChatId(entityId);
    }
    navigate("telegram", "chat", entityId);
  },
  extractAllowlistTarget: telegramAgentContribution.extractAllowlistTarget,
  onDraftRequest: telegramAgentContribution.onDraftRequest,
  entityLabels: {
    message: {
      icon: "send",
      label: "Message",
      tabLabel: "Messages",
      EntityCard: TelegramMessageCard,
      hasMore: telegramMessageHasMore
    },
    chat: {
      icon: "send",
      label: "Chat",
      tabLabel: "Chats",
      EntityCard: TelegramChatCard,
      hasMore: telegramChatHasMore
    }
  },
  toolCallRenderers: [
    {
      actions: ["messages.send"],
      Render: TelegramToolCallRenderer
    },
    {
      actions: ["batch_send"],
      Render: TelegramBatchSendRenderer
    },
    {
      actions: ["set_trigger"],
      Render: TelegramSetTriggerRenderer
    }
  ],
  extraSetup: (runtime) => {
    const unsub2 = setupEventInvalidation(runtime.transport, runtime.queryClient, ["sync.progress"], [telegramKeys.all]);
    return () => {
      unsub2();
    };
  }
});
export {
  telegramAgentContribution,
  TelegramModule,
  TELEGRAM_SENDER_COLORS,
  TELEGRAM_AVATAR_COLORS,
  TELEGRAM_AUTH_POLL_INTERVAL,
  SEARCH_PLACEHOLDER,
  PAGE_SIZE,
  NEW_CHAT_TITLE,
  MESSAGE_MENU_ITEMS,
  MEDIA_LABELS,
  INPUT_PLACEHOLDER,
  CHAT_CACHE_TTL,
  CHAT_CACHE_KEY,
  CHATS_PAGE_SIZE
};
