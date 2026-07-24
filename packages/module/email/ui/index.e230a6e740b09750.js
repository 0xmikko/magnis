// plugins/modules/email/ui/index.tsx
import { Icon as Icon6 } from "/api/plugins/__host-shim.js?m=ui";
import { defineModule } from "/api/plugins/__host-shim.js?m=base";

// plugins/modules/email/ui/EntityCards.tsx
import { useContext, useEffect, useState } from "/api/plugins/__host-shim.js?m=react";
import { formatMessageTime } from "/api/plugins/__host-shim.js?m=utils";
import { BaseEntityCard } from "/api/plugins/__host-shim.js?m=base";
import { ActionPrefix } from "/api/plugins/__host-shim.js?m=base";
import { ExpansionContext } from "/api/plugins/__host-shim.js?m=agent";
import { jsx, jsxs } from "/api/plugins/__host-shim.js?m=react-jsx-runtime";
function toStringList(value) {
  if (typeof value === "string") {
    return value.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
  }
  if (!Array.isArray(value))
    return [];
  return value.filter((v) => typeof v === "string" && v.length > 0);
}
function bodyText(data) {
  if (typeof data.body_text === "string" && data.body_text.length > 0)
    return data.body_text;
  if (typeof data.body === "string" && data.body.length > 0)
    return data.body;
  return;
}
function senderOf(data) {
  if (typeof data.sender === "string" && data.sender.length > 0)
    return data.sender;
  if (typeof data.from_address === "string" && data.from_address.length > 0)
    return data.from_address;
  if (typeof data.from === "string" && data.from.length > 0)
    return data.from;
  return;
}
function recipients(data) {
  const single = typeof data.to === "string" && data.to.length > 0 ? [data.to] : [];
  return Array.from(new Set([
    ...single,
    ...toStringList(data.to_addresses),
    ...toStringList(data.recipients)
  ]));
}
function attachments(data) {
  const raw = data.attachments;
  if (!Array.isArray(raw))
    return [];
  const out = [];
  for (const item of raw) {
    if (typeof item === "string" && item.length > 0)
      out.push(item);
    else if (item && typeof item === "object") {
      const rec = item;
      if (typeof rec.filename === "string" && rec.filename.length > 0)
        out.push(rec.filename);
      else if (typeof rec.name === "string" && rec.name.length > 0)
        out.push(rec.name);
    }
  }
  return out;
}
function timestampOf(data) {
  if (typeof data.timestamp === "string" && data.timestamp.length > 0)
    return data.timestamp;
  if (typeof data.sent_at === "string" && data.sent_at.length > 0)
    return data.sent_at;
  if (typeof data.received_at === "string" && data.received_at.length > 0)
    return data.received_at;
  return;
}
function flatten(row) {
  const flat = { ...row };
  const meta = row.metadata;
  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    Object.assign(flat, meta);
  }
  const facets = row.facets;
  if (Array.isArray(facets)) {
    for (const f of facets) {
      if (f && typeof f === "object") {
        const facet = f;
        if (facet.schema_id === "email.message.details" || facet.schema_id === "email.message") {
          const fd = facet.data;
          if (fd && typeof fd === "object" && !Array.isArray(fd)) {
            Object.assign(flat, fd);
          }
        }
      }
    }
  }
  const linked = row.linked_entities;
  if ((flat.to === null || flat.to === undefined) && (flat.to_addresses === null || flat.to_addresses === undefined) && Array.isArray(linked)) {
    const recipient = linked.find((e) => e.link_kind === "sent_to" && e.schema_id === "email.address");
    if (recipient && typeof recipient.name === "string") {
      flat.to = recipient.name;
    }
  }
  return flat;
}
function emailHasMore(data) {
  const flat = flatten(data);
  if (bodyText(flat) !== undefined)
    return true;
  if (recipients(flat).length > 0)
    return true;
  if (attachments(flat).length > 0)
    return true;
  return typeof flat.id === "string" && flat.id.length > 0;
}
function Row({ label, value }) {
  return /* @__PURE__ */ jsxs("div", {
    className: "flex gap-2 text-[11px]",
    children: [
      /* @__PURE__ */ jsx("span", {
        className: "w-12 shrink-0 text-content-tertiary",
        children: label
      }),
      /* @__PURE__ */ jsx("span", {
        className: "min-w-0 flex-1 whitespace-pre-wrap break-words text-content",
        children: value
      })
    ]
  });
}
function EmailCard(props) {
  const { data: raw, runtime, action } = props;
  const { expanded } = useContext(ExpansionContext);
  const initial = flatten(raw);
  const [enriched, setEnriched] = useState(null);
  const data = enriched ? { ...enriched, ...initial } : initial;
  useEffect(() => {
    if (!expanded)
      return;
    if (bodyText(initial) !== undefined && recipients(initial).length > 0)
      return;
    const id = typeof initial.id === "string" ? initial.id : null;
    if (!id)
      return;
    let cancelled = false;
    runtime.transport.rpc("email.get", { id }).then((row) => {
      if (!cancelled)
        setEnriched(flatten(row));
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [expanded, raw, runtime]);
  const subject = (typeof data.subject === "string" && data.subject.length > 0 ? data.subject : undefined) ?? (typeof data.name === "string" && data.name.length > 0 ? data.name : undefined);
  const sender = senderOf(data);
  const to = recipients(data);
  const time = timestampOf(data);
  const timeStr = time ? formatMessageTime(time) : "";
  const preview = typeof data.preview === "string" ? data.preview : undefined;
  const text = bodyText(data);
  const files = attachments(data);
  return /* @__PURE__ */ jsx(BaseEntityCard, {
    ...props,
    children: /* @__PURE__ */ jsxs("div", {
      className: "min-w-0 flex-1",
      children: [
        /* @__PURE__ */ jsxs("div", {
          className: "flex items-baseline justify-between gap-2",
          children: [
            /* @__PURE__ */ jsxs("span", {
              className: "truncate text-[12px] font-medium text-content",
              children: [
                /* @__PURE__ */ jsx(ActionPrefix, {
                  action
                }),
                subject ?? "(no subject)"
              ]
            }),
            timeStr && /* @__PURE__ */ jsx("span", {
              className: "shrink-0 text-[11px] text-content-tertiary",
              children: timeStr
            })
          ]
        }),
        /* @__PURE__ */ jsxs("div", {
          className: "mt-0.5 flex items-baseline gap-1.5",
          children: [
            sender && /* @__PURE__ */ jsx("span", {
              className: "shrink-0 text-[11px] text-content-tertiary",
              children: sender
            }),
            !expanded && preview && /* @__PURE__ */ jsxs("span", {
              className: "line-clamp-1 text-[11px] text-content-tertiary",
              children: [
                "— ",
                preview
              ]
            })
          ]
        }),
        expanded && /* @__PURE__ */ jsxs("div", {
          className: "mt-2 flex flex-col gap-1.5",
          children: [
            /* @__PURE__ */ jsxs("div", {
              className: "flex flex-col gap-0.5",
              children: [
                to.length > 0 && /* @__PURE__ */ jsx(Row, {
                  label: "To",
                  value: to.join(", ")
                }),
                files.length > 0 && /* @__PURE__ */ jsx(Row, {
                  label: "Attached",
                  value: files.join(", ")
                })
              ]
            }),
            text && /* @__PURE__ */ jsx("div", {
              className: "whitespace-pre-wrap break-words text-[11px] text-content",
              children: text
            })
          ]
        })
      ]
    })
  });
}

// plugins/modules/email/ui/EmailDetailPanel.tsx
import {
  Avatar,
  Icon as Icon2,
  IconButton,
  Row as Row3,
  Stack as Stack2,
  Text as Text2,
  TOPBAR_AVATAR_SIZE,
  TopBarHeader
} from "/api/plugins/__host-shim.js?m=ui";
import { DetailPane } from "/api/plugins/__host-shim.js?m=layout";
import { PaneFooterBar } from "/api/plugins/__host-shim.js?m=layout";

// plugins/modules/email/ui/EmailReplyComposer.tsx
import { useCallback, useEffect as useEffect2, useRef, useState as useState2 } from "/api/plugins/__host-shim.js?m=react";
import { MessageComposer } from "/api/plugins/__host-shim.js?m=composer";
import { useComposerDraft } from "/api/plugins/__host-shim.js?m=composer";
import { useComposerMountRegistry } from "/api/plugins/__host-shim.js?m=composer";
import { applyComposerEvent } from "/api/plugins/__host-shim.js?m=composer";
import { useAppRuntime } from "/api/plugins/__host-shim.js?m=runtime";
import { uploadBrowserFile } from "/api/plugins/__host-shim.js?m=runtime";
import { jsx as jsx2, jsxs as jsxs2, Fragment } from "/api/plugins/__host-shim.js?m=react-jsx-runtime";
function EmailReplyComposer({
  emailId,
  threadId,
  senderName,
  disabled
}) {
  const runtime = useAppRuntime();
  const registry = useComposerMountRegistry();
  const { draft, setText, setAttachments, clear, applyRemote } = useComposerDraft("email", threadId);
  useEffect2(() => {
    const unregister = registry.register({
      mode: "email",
      threadKey: threadId,
      applyOp: applyRemote
    });
    runtime.composer.setPresence({ mode: "email", thread_key: threadId });
    return () => {
      runtime.composer.setPresence(null);
      unregister();
    };
  }, [registry, runtime, threadId, applyRemote]);
  const draftTextRef = useRef(draft.text);
  useEffect2(() => {
    draftTextRef.current = draft.text;
  }, [draft.text]);
  const attachmentMetaRef = useRef(draft.attachmentMeta);
  useEffect2(() => {
    attachmentMetaRef.current = draft.attachmentMeta;
  }, [draft.attachmentMeta]);
  useEffect2(() => {
    const unsubscribe = runtime.composer.onApply((event) => {
      if (event.mode !== "email")
        return;
      if (event.thread_key !== threadId)
        return;
      const typed = event;
      applyComposerEvent(typed, { mode: "email", threadKey: threadId, applyOp: applyRemote }, draftTextRef.current, attachmentMetaRef.current);
    });
    return () => {
      unsubscribe();
    };
  }, [runtime, threadId, applyRemote]);
  const [sending, setSending] = useState2(false);
  const sendingRef = useRef(false);
  const [uploadError, setUploadError] = useState2(null);
  const fileInputRef = useRef(null);
  const handleSend = useCallback(() => {
    if (sendingRef.current)
      return;
    const text = draft.text.trim();
    if (!text)
      return;
    sendingRef.current = true;
    setSending(true);
    const finish = (ok) => {
      sendingRef.current = false;
      setSending(false);
      if (ok)
        clear();
    };
    runtime.transport.rpc("email.reply", {
      email_id: emailId,
      body_text: text,
      attachment_ids: [...draft.attachments]
    }).then(() => {
      finish(true);
    }).catch(() => {
      finish(false);
    });
  }, [draft.text, draft.attachments, emailId, runtime, clear]);
  const handleAttachClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);
  const handleFileChange = useCallback((e) => {
    const files = e.target.files;
    if (!files || files.length === 0)
      return;
    const selected = Array.from(files);
    e.target.value = "";
    setUploadError(null);
    (async () => {
      const uploaded = [];
      for (const file of selected) {
        try {
          const result = await uploadBrowserFile(runtime.transport, file);
          uploaded.push({ id: result.id, name: result.name, mimeType: result.mimeType });
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Upload failed";
          setUploadError(msg);
          break;
        }
      }
      if (uploaded.length > 0) {
        const nextIds = [...draft.attachments, ...uploaded.map((u) => u.id)];
        const nextMeta = [...draft.attachmentMeta, ...uploaded];
        setAttachments(nextIds, nextMeta);
      }
    })();
  }, [runtime, draft.attachments, draft.attachmentMeta, setAttachments]);
  const handleRemoveAttachment = useCallback((id) => {
    const nextIds = draft.attachments.filter((a) => a !== id);
    const nextMeta = draft.attachmentMeta.filter((m) => m.id !== id);
    setAttachments(nextIds, nextMeta);
  }, [draft.attachments, draft.attachmentMeta, setAttachments]);
  const placeholder = senderName ? `Reply to ${senderName}...` : undefined;
  const chips = draft.attachmentMeta.map((m) => ({
    id: m.id,
    name: m.name,
    mimeType: m.mimeType
  }));
  return /* @__PURE__ */ jsxs2(Fragment, {
    children: [
      /* @__PURE__ */ jsx2("input", {
        ref: fileInputRef,
        type: "file",
        multiple: true,
        style: { display: "none" },
        onChange: handleFileChange,
        "data-testid": "email-attachment-input"
      }),
      /* @__PURE__ */ jsx2(MessageComposer, {
        layout: "stacked",
        rows: 6,
        sendOnEnter: false,
        value: draft.text,
        onChange: setText,
        onSend: handleSend,
        placeholder,
        disabled: disabled === true || sending,
        onAttachClick: handleAttachClick,
        attachments: chips,
        onRemoveAttachment: handleRemoveAttachment,
        errorText: uploadError ?? undefined,
        textareaTestId: "email-composer-textarea"
      })
    ]
  });
}

// plugins/modules/email/ui/EmailDetailContent.tsx
import { useRef as useRef2, useCallback as useCallback2, useState as useState3, useEffect as useEffect3 } from "/api/plugins/__host-shim.js?m=react";
import {
  ActionButton,
  Icon,
  Stack,
  Row as Row2,
  Text
} from "/api/plugins/__host-shim.js?m=ui";
import { formatFileSize } from "/api/plugins/__host-shim.js?m=utils";
import { jsx as jsx3, jsxs as jsxs3 } from "/api/plugins/__host-shim.js?m=react-jsx-runtime";
function isRichHtml(raw) {
  if (/<table\b/i.test(raw))
    return true;
  if (/style\s*=/i.test(raw))
    return true;
  const divCount = (raw.match(/<div[\s>]/gi) ?? []).length;
  return divCount > 1;
}
function prepareEmailHtml(raw, dark) {
  const bg = dark ? "#0E0E0E" : "#ffffff";
  const color = dark ? "#E0E0E0" : "#000000";
  const linkColor = dark ? "#93C5FD" : "#1a0dab";
  const padding = dark ? "20px 24px" : "0";
  const baseStyle = `<style>
html{overflow:hidden!important;background:${bg};}
body{margin:0;padding:${padding};color:${color};font-family:Inter,system-ui,sans-serif;font-size:14px;line-height:1.6;}
a{color:${linkColor};}
</style>`;
  if (/<head[\s>]/i.test(raw)) {
    return raw.replace(/(<head[^>]*>)/i, `$1${baseStyle}`);
  }
  if (/<html[\s>]/i.test(raw)) {
    return raw.replace(/(<html[^>]*>)/i, `$1<head>${baseStyle}</head>`);
  }
  return `<!DOCTYPE html><html><head>${baseStyle}</head><body>${raw}</body></html>`;
}
function HtmlEmailFrame({ html, dark }) {
  const iframeRef = useRef2(null);
  const containerRef = useRef2(null);
  const [contentHeight, setContentHeight] = useState3(0);
  const observerRef = useRef2(null);
  const measureHeight = useCallback2(() => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc?.body)
      return;
    const h = doc.body.getBoundingClientRect().height;
    if (h > 0)
      setContentHeight(Math.ceil(h));
  }, []);
  const handleLoad = useCallback2(() => {
    measureHeight();
    const doc = iframeRef.current?.contentDocument;
    if (!doc?.body)
      return;
    observerRef.current?.disconnect();
    const observer = new ResizeObserver(measureHeight);
    observer.observe(doc.body);
    observerRef.current = observer;
  }, [measureHeight]);
  useEffect3(() => {
    return () => {
      observerRef.current?.disconnect();
    };
  }, []);
  const [minHeight, setMinHeight] = useState3(400);
  useEffect3(() => {
    const el = containerRef.current;
    if (!el)
      return;
    const updateMinHeight = () => {
      const rect = el.getBoundingClientRect();
      setMinHeight(Math.max(200, window.innerHeight - rect.top - 32));
    };
    updateMinHeight();
    window.addEventListener("resize", updateMinHeight);
    return () => {
      window.removeEventListener("resize", updateMinHeight);
    };
  }, []);
  const frameHeight = contentHeight > 0 ? Math.max(contentHeight, minHeight) : minHeight;
  return /* @__PURE__ */ jsx3("div", {
    ref: containerRef,
    children: /* @__PURE__ */ jsx3("iframe", {
      ref: iframeRef,
      srcDoc: prepareEmailHtml(html, dark),
      sandbox: "allow-same-origin",
      className: "border-0 block",
      style: { height: frameHeight, width: "100%" },
      onLoad: handleLoad,
      title: "Email body"
    })
  });
}
function EmailDetailContent({ detail, linkedEntities }) {
  const hasHtml = !!detail?.bodyHtml;
  const rich = hasHtml && detail.bodyHtml ? isRichHtml(detail.bodyHtml) : false;
  return /* @__PURE__ */ jsxs3(Stack, {
    gap: 0,
    children: [
      hasHtml && detail.bodyHtml ? /* @__PURE__ */ jsx3(HtmlEmailFrame, {
        html: detail.bodyHtml,
        dark: !rich
      }) : /* @__PURE__ */ jsx3(Stack, {
        gap: 4,
        px: 5,
        py: 4,
        children: detail?.bodyParagraphs.map((paragraph, i) => /* @__PURE__ */ jsx3(Text, {
          variant: "body",
          leading: "relaxed",
          children: paragraph
        }, i))
      }),
      (detail?.attachments?.length ?? 0) > 0 || (detail?.actions.length ?? 0) > 0 ? /* @__PURE__ */ jsxs3(Stack, {
        gap: 4,
        px: 5,
        py: 4,
        children: [
          detail?.attachments?.length ? /* @__PURE__ */ jsxs3(Stack, {
            gap: 2,
            className: "pt-3 border-t border-white/5",
            children: [
              /* @__PURE__ */ jsxs3(Text, {
                variant: "caption",
                weight: "semibold",
                children: [
                  "Attachments (",
                  detail.attachments.length,
                  ")"
                ]
              }),
              detail.attachments.map((att) => {
                const linkedFile = linkedEntities?.find((le) => le.link_kind === "attachment" && le.name === att.filename);
                const href = linkedFile ? `/#/file/object/${linkedFile.id}` : att.path;
                return /* @__PURE__ */ jsxs3("a", {
                  href,
                  ...linkedFile ? {} : { target: "_blank", rel: "noopener noreferrer" },
                  className: "flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors no-underline cursor-pointer",
                  "data-testid": `attachment-link-${att.filename}`,
                  children: [
                    /* @__PURE__ */ jsx3(Icon, {
                      name: "file",
                      size: 14
                    }),
                    /* @__PURE__ */ jsx3(Text, {
                      variant: "body",
                      truncate: true,
                      className: "flex-1",
                      children: att.filename
                    }),
                    /* @__PURE__ */ jsx3(Text, {
                      variant: "caption",
                      noShrink: true,
                      children: formatFileSize(att.size)
                    })
                  ]
                }, att.path || att.filename);
              })
            ]
          }) : null,
          detail?.actions.length ? /* @__PURE__ */ jsx3(Row2, {
            gap: 2,
            children: detail.actions.map((action) => /* @__PURE__ */ jsx3(ActionButton, {
              label: action.label,
              variant: action.variant === "primary" ? "primary" : "default"
            }, action.label))
          }) : null
        ]
      }) : null
    ]
  });
}

// plugins/modules/email/ui/helpers.ts
import { decodeHtmlEntities, initialsFromName } from "/api/plugins/__host-shim.js?m=utils";
import { formatEmailDate, formatTimeAgo } from "/api/plugins/__host-shim.js?m=utils";
import { pickAvatarColor } from "/api/plugins/__host-shim.js?m=utils";
function getMetadataString(metadata, key) {
  const value = metadata?.[key];
  return typeof value === "string" ? value : undefined;
}
function mapEmailDetailFromDetailView(view) {
  const fromName = getMetadataString(view.metadata, "from_name") ?? null;
  const fromAddress = getMetadataString(view.metadata, "from_address") ?? view.sender ?? null;
  const senderName = fromName || fromAddress || "Unknown";
  const fromEmail = fromAddress ?? "Unknown";
  const sentAt = getMetadataString(view.metadata, "sent_at") ?? view.timestamp;
  const toAddresses = getMetadataString(view.metadata, "to_addresses") ?? undefined;
  const replyTo = getMetadataString(view.metadata, "reply_to") ?? undefined;
  const bodyHtmlRaw = getMetadataString(view.metadata, "body_html") ?? undefined;
  const bodyText2 = view.body?.trim();
  const bodyParagraphs = bodyText2 ? bodyText2.split(/\n{2,}/).map((p) => decodeHtmlEntities(p.trim())).filter(Boolean) : ["No message body available yet."];
  const rawAttachments = view.metadata?.attachments;
  const attachments2 = Array.isArray(rawAttachments) ? rawAttachments.map((att) => ({
    filename: typeof att.filename === "string" ? att.filename : "attachment",
    mime_type: typeof att.mime_type === "string" ? att.mime_type : "application/octet-stream",
    size: typeof att.size === "number" ? att.size : 0,
    path: typeof att.path === "string" ? att.path : ""
  })) : [];
  return {
    fromEmail,
    senderName,
    sentAt: formatEmailDate(sentAt),
    toAddresses,
    replyTo,
    bodyParagraphs,
    bodyHtml: bodyHtmlRaw,
    actions: [],
    ...attachments2.length > 0 ? { attachments: attachments2 } : {}
  };
}

// plugins/modules/email/ui/queries.ts
import { useQuery } from "/api/plugins/__host-shim.js?m=react-query";
import { useAppRuntime as useAppRuntime2 } from "/api/plugins/__host-shim.js?m=runtime";
var emailKeys = {
  all: ["email"],
  list: (params) => [...emailKeys.all, "list", params],
  detail: (id) => [...emailKeys.all, "detail", id],
  integrations: ["email", "integrations"]
};
function useEmailDetailQuery(id) {
  const runtime = useAppRuntime2();
  return useQuery({
    queryKey: emailKeys.detail(id),
    queryFn: () => runtime.transport.rpc("email.get", { id }),
    enabled: !!id
  });
}

// plugins/modules/email/ui/EmailDetailPanel.tsx
import { jsx as jsx4, jsxs as jsxs4, Fragment as Fragment2 } from "/api/plugins/__host-shim.js?m=react-jsx-runtime";
function EmailHeaderExtra({ toAddresses, replyTo }) {
  if (!toAddresses && !replyTo)
    return null;
  return /* @__PURE__ */ jsxs4(Stack2, {
    gap: 0.5,
    className: "mt-0.5",
    children: [
      toAddresses && /* @__PURE__ */ jsxs4(Row3, {
        gap: 1,
        align: "baseline",
        children: [
          /* @__PURE__ */ jsx4(Text2, {
            variant: "caption",
            className: "text-content-tertiary shrink-0",
            children: "To:"
          }),
          /* @__PURE__ */ jsx4(Text2, {
            variant: "caption",
            truncate: true,
            children: toAddresses
          })
        ]
      }),
      replyTo && /* @__PURE__ */ jsxs4(Row3, {
        gap: 1,
        align: "baseline",
        children: [
          /* @__PURE__ */ jsx4(Text2, {
            variant: "caption",
            className: "text-content-tertiary shrink-0",
            children: "Reply-To:"
          }),
          /* @__PURE__ */ jsx4(Text2, {
            variant: "caption",
            truncate: true,
            children: replyTo
          })
        ]
      })
    ]
  });
}
function EmailDetailPanel({ entityId }) {
  const { data: detailView, isLoading } = useEmailDetailQuery(entityId);
  const detail = detailView ? mapEmailDetailFromDetailView(detailView) : undefined;
  if (isLoading || !detail || !detailView) {
    return /* @__PURE__ */ jsx4(DetailPane, {
      children: /* @__PURE__ */ jsx4("div", {
        className: "flex items-center justify-center h-full text-content-tertiary text-sm",
        children: isLoading ? "Loading..." : "No email data"
      })
    });
  }
  const threadIdRaw = detailView.metadata?.thread_id;
  const threadId = typeof threadIdRaw === "string" && threadIdRaw.length > 0 ? threadIdRaw : null;
  return /* @__PURE__ */ jsx4(DetailPane, {
    contentClassName: detail.bodyHtml && isRichHtml(detail.bodyHtml) ? "bg-white" : undefined,
    headerNode: /* @__PURE__ */ jsx4(TopBarHeader, {
      leading: /* @__PURE__ */ jsx4(Avatar, {
        label: detail.senderName.charAt(0).toUpperCase(),
        color: "pink",
        size: TOPBAR_AVATAR_SIZE
      }),
      title: detail.senderName,
      subtitle: detail.fromEmail !== detail.senderName ? detail.fromEmail : undefined,
      extra: /* @__PURE__ */ jsx4(EmailHeaderExtra, {
        toAddresses: detail.toAddresses,
        replyTo: detail.replyTo
      }),
      actions: /* @__PURE__ */ jsxs4(Fragment2, {
        children: [
          /* @__PURE__ */ jsx4(Text2, {
            variant: "caption",
            className: "text-content-tertiary",
            children: detail.sentAt
          }),
          /* @__PURE__ */ jsx4(IconButton, {
            variant: "ghost",
            children: /* @__PURE__ */ jsx4(Icon2, {
              name: "ellipsis-vertical",
              size: 15
            })
          })
        ]
      })
    }),
    footer: threadId === null ? null : /* @__PURE__ */ jsx4(PaneFooterBar, {
      tone: "surface-tertiary",
      inset: "md",
      withTopBorder: false,
      className: "!pt-4 !pb-6 !bg-transparent",
      children: /* @__PURE__ */ jsx4(EmailReplyComposer, {
        emailId: detailView.id,
        threadId,
        senderName: detail.senderName
      })
    }),
    children: /* @__PURE__ */ jsx4(EmailDetailContent, {
      detail,
      linkedEntities: detailView.linked_entities
    })
  });
}

// plugins/modules/email/ui/EmailToolCallRenderer.tsx
import { useEffect as useEffect4, useState as useState4 } from "/api/plugins/__host-shim.js?m=react";
import { Icon as Icon3 } from "/api/plugins/__host-shim.js?m=ui";
import { BaseToolCallCard } from "/api/plugins/__host-shim.js?m=base";
import { ExpandableEntityCard } from "/api/plugins/__host-shim.js?m=agent";
import { extractEntities } from "/api/plugins/__host-shim.js?m=agent";
import { jsx as jsx5, jsxs as jsxs5, Fragment as Fragment3 } from "/api/plugins/__host-shim.js?m=react-jsx-runtime";
function useAttachmentNames(attachmentIds, runtime) {
  const [names, setNames] = useState4([]);
  useEffect4(() => {
    if (!attachmentIds || attachmentIds.length === 0) {
      setNames([]);
      return;
    }
    let cancelled = false;
    Promise.all(attachmentIds.map((id) => runtime.transport.rpc("file.get", { id }).then((r) => r.name ?? "attachment").catch(() => "attachment"))).then((resolved) => {
      if (!cancelled)
        setNames(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, [attachmentIds, runtime.transport]);
  return names;
}
function useEmailContext(emailId, runtime) {
  const [ctx, setCtx] = useState4(null);
  useEffect4(() => {
    if (!emailId)
      return;
    let cancelled = false;
    runtime.transport.rpc("email.get", { id: emailId }).then((result) => {
      if (cancelled)
        return;
      const r = result;
      const metadata = r.metadata;
      const sender = metadata?.from_address ?? r.sender ?? "";
      const senderName = r.sender;
      const myAddress = metadata?.to_addresses ?? "";
      setCtx({
        from: myAddress,
        to: sender,
        toName: senderName,
        subject: r.subject ?? "",
        previousText: r.body,
        previousSender: senderName,
        previousDate: r.timestamp ? new Date(r.timestamp).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit"
        }) : undefined
      });
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [emailId, runtime.transport]);
  return ctx;
}
function EmailPreviewContent({
  subject,
  body,
  attachmentNames
}) {
  return /* @__PURE__ */ jsxs5(Fragment3, {
    children: [
      subject && /* @__PURE__ */ jsxs5("div", {
        className: "mb-1 text-[11px]",
        children: [
          /* @__PURE__ */ jsx5("span", {
            className: "text-rose-400/80",
            children: "Subject:"
          }),
          " ",
          /* @__PURE__ */ jsx5("span", {
            className: "text-agent-text",
            children: subject
          })
        ]
      }),
      /* @__PURE__ */ jsx5("p", {
        className: "mb-2 whitespace-pre-wrap text-[13px] leading-[1.5] text-agent-text",
        children: body
      }),
      attachmentNames.length > 0 && /* @__PURE__ */ jsx5("div", {
        className: "mb-2 flex flex-wrap gap-1.5",
        children: attachmentNames.map((name, i) => /* @__PURE__ */ jsxs5("span", {
          className: "flex items-center gap-1 rounded bg-surface-secondary px-2 py-0.5 text-[11px] text-agent-text-muted",
          children: [
            /* @__PURE__ */ jsx5(Icon3, {
              name: "paperclip",
              size: 10
            }),
            name
          ]
        }, i))
      })
    ]
  });
}
function EmailToolCallRenderer({
  payload,
  runtime
}) {
  const { toolCall: tc, toolResult, isAllowlisted, superseded, onApprove, onDeny, onEdit, onAllowlistToggle } = payload;
  const args = tc.args;
  const isReply = tc.name.includes("reply");
  const verb = isReply ? "Reply" : "Send";
  const emailId = args.email_id;
  const hasDirectFields = args.to !== undefined && args.to !== null || args.subject !== undefined && args.subject !== null;
  const emailCtx = useEmailContext(tc.status === "pending" && !hasDirectFields ? emailId : undefined, runtime);
  const to = args.to ?? emailCtx?.to;
  const toName = args.to_name ?? emailCtx?.toName;
  const subject = args.subject ?? (emailCtx?.subject ? `Re: ${emailCtx.subject.replace(/^Re:\s*/i, "")}` : undefined);
  const body = typeof args.body === "string" ? args.body : typeof args.body_text === "string" ? args.body_text : typeof args.text === "string" ? args.text : "";
  const attachmentNames = useAttachmentNames(args.attachment_ids, runtime);
  const recipientLabel = toName ?? to ?? "recipient";
  if (tc.status === "approved" && toolResult) {
    const entity = extractEntities(toolResult.result, { toolName: tc.name }).at(0);
    if (entity) {
      return /* @__PURE__ */ jsx5(ExpandableEntityCard, {
        schemaId: entity.schema_id,
        data: entity,
        runtime,
        action: verb
      });
    }
  }
  return /* @__PURE__ */ jsxs5(BaseToolCallCard, {
    icon: isReply ? "corner-up-left" : "mail",
    title: isReply ? `Reply to ${recipientLabel}` : `Email to ${recipientLabel}`,
    variant: "rose",
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
    children: [
      /* @__PURE__ */ jsx5(EmailPreviewContent, {
        subject,
        body,
        attachmentNames
      }),
      emailCtx?.previousText && /* @__PURE__ */ jsxs5("div", {
        className: "mt-2 border-l-2 border-rose-500/30 pl-2.5",
        children: [
          /* @__PURE__ */ jsxs5("div", {
            className: "text-[10px] text-agent-text-muted mb-0.5",
            children: [
              emailCtx.previousSender,
              emailCtx.previousDate ? ` · ${emailCtx.previousDate}` : ""
            ]
          }),
          /* @__PURE__ */ jsx5("div", {
            className: "text-[11px] text-agent-text-muted line-clamp-3",
            children: emailCtx.previousText
          })
        ]
      })
    ]
  });
}

// plugins/modules/email/ui/EmailBatchSendRenderer.tsx
import { useCallback as useCallback3, useMemo, useState as useState5 } from "/api/plugins/__host-shim.js?m=react";
import { Icon as Icon4 } from "/api/plugins/__host-shim.js?m=ui";
import { BaseToolCallCard as BaseToolCallCard2 } from "/api/plugins/__host-shim.js?m=base";
import { AllowlistDropdown } from "/api/plugins/__host-shim.js?m=agent";
import { jsx as jsx6, jsxs as jsxs6 } from "/api/plugins/__host-shim.js?m=react-jsx-runtime";
function EmailBatchSendRenderer({
  payload
}) {
  const { toolCall: tc, toolResult, isAllowlisted, superseded, onApprove, onDeny, onAllowlistToggle } = payload;
  const args = tc.args;
  const messages = useMemo(() => args.messages ?? [], [args.messages]);
  const [currentIndex, setCurrentIndex] = useState5(0);
  const [excluded, setExcluded] = useState5(() => new Set);
  const [savedEdits, setSavedEdits] = useState5(() => new Map);
  const [expanded, setExpanded] = useState5(false);
  const [editingIndex, setEditingIndex] = useState5(null);
  const [editDraft, setEditDraft] = useState5({ subject: "", body_text: "" });
  const total = messages.length;
  const activeCount = total - excluded.size;
  const current = messages.at(currentIndex);
  const isEditing = editingIndex === currentIndex;
  const isDraft = tc.status === "pending";
  const isExcluded = excluded.has(currentIndex);
  const goLeft = useCallback3(() => {
    setCurrentIndex((i) => Math.max(0, i - 1));
  }, []);
  const goRight = useCallback3(() => {
    setCurrentIndex((i) => Math.min(total - 1, i + 1));
  }, [total]);
  const toggleExclude = useCallback3((idx) => {
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
  const startEdit = useCallback3(() => {
    if (!current)
      return;
    const existing = savedEdits.get(currentIndex);
    setEditDraft({
      subject: existing?.subject ?? current.subject,
      body_text: existing?.body_text ?? current.body_text
    });
    setEditingIndex(currentIndex);
  }, [current, currentIndex, savedEdits]);
  const saveEdit = useCallback3(() => {
    if (editingIndex === null)
      return;
    setSavedEdits((prev) => {
      const next = new Map(prev);
      next.set(editingIndex, { ...editDraft });
      return next;
    });
    setEditingIndex(null);
  }, [editingIndex, editDraft]);
  const revertEdit = useCallback3(() => {
    setEditingIndex(null);
  }, []);
  const buildOverrideArgs = useCallback3(() => {
    const updatedMessages = messages.map((msg, i) => {
      const edits = savedEdits.get(i);
      return { ...msg, subject: edits?.subject ?? msg.subject, body_text: edits?.body_text ?? msg.body_text };
    });
    return { messages: updatedMessages, excluded_indices: Array.from(excluded) };
  }, [messages, savedEdits, excluded]);
  const handleApprove = useCallback3(async () => {
    await onApprove(buildOverrideArgs());
  }, [onApprove, buildOverrideArgs]);
  if (!current) {
    return /* @__PURE__ */ jsx6("div", {
      className: "text-agent-text-muted text-[12px]",
      children: "No messages in batch"
    });
  }
  const saved = savedEdits.get(currentIndex);
  const displaySubject = isEditing ? editDraft.subject : saved?.subject ?? current.subject;
  const displayBody = isEditing ? editDraft.body_text : saved?.body_text ?? current.body_text;
  const hasEdits = saved !== undefined;
  const headerNav = /* @__PURE__ */ jsxs6("div", {
    className: "flex items-center gap-1",
    children: [
      /* @__PURE__ */ jsx6("button", {
        type: "button",
        className: "rounded p-0.5 text-agent-text-muted hover:text-agent-text disabled:opacity-30",
        disabled: currentIndex === 0 || isEditing,
        onClick: goLeft,
        children: /* @__PURE__ */ jsx6(Icon4, {
          name: "chevron-left",
          size: 14
        })
      }),
      /* @__PURE__ */ jsxs6("span", {
        className: "text-[11px] tabular-nums text-agent-text-muted",
        children: [
          String(currentIndex + 1),
          "/",
          String(total)
        ]
      }),
      /* @__PURE__ */ jsx6("button", {
        type: "button",
        className: "rounded p-0.5 text-agent-text-muted hover:text-agent-text disabled:opacity-30",
        disabled: currentIndex === total - 1 || isEditing,
        onClick: goRight,
        children: /* @__PURE__ */ jsx6(Icon4, {
          name: "chevron-right",
          size: 14
        })
      }),
      /* @__PURE__ */ jsx6("button", {
        type: "button",
        className: "ml-1 rounded p-0.5 text-agent-text-muted hover:text-agent-text",
        onClick: () => {
          setExpanded((v) => !v);
        },
        title: expanded ? "Collapse" : "Expand",
        children: /* @__PURE__ */ jsx6(Icon4, {
          name: expanded ? "minimize-2" : "maximize-2",
          size: 13
        })
      })
    ]
  });
  const customActionBar = isDraft ? isEditing ? /* @__PURE__ */ jsxs6("div", {
    className: "flex items-center justify-end gap-2",
    children: [
      /* @__PURE__ */ jsx6("button", {
        type: "button",
        className: "rounded-md border border-agent-border px-3 py-1.5 text-[12px] text-agent-text-muted hover:text-agent-text",
        onClick: revertEdit,
        children: "Revert"
      }),
      /* @__PURE__ */ jsx6("button", {
        type: "button",
        className: "rounded-md bg-rose-500 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-rose-400",
        onClick: saveEdit,
        children: "Save"
      })
    ]
  }) : /* @__PURE__ */ jsxs6("div", {
    className: "flex items-center gap-2",
    children: [
      /* @__PURE__ */ jsx6(AllowlistDropdown, {
        isAllowlisted,
        onToggle: onAllowlistToggle
      }),
      /* @__PURE__ */ jsxs6("label", {
        className: "flex cursor-pointer items-center gap-1.5 text-[11px] text-agent-text-muted",
        children: [
          /* @__PURE__ */ jsx6("input", {
            type: "checkbox",
            className: "accent-rose-500",
            checked: isExcluded,
            onChange: () => {
              toggleExclude(currentIndex);
            }
          }),
          "Exclude"
        ]
      }),
      /* @__PURE__ */ jsx6("div", {
        className: "flex-1"
      }),
      !isExcluded && /* @__PURE__ */ jsxs6("button", {
        type: "button",
        className: "flex items-center gap-1 rounded-md border border-agent-border px-2.5 py-1.5 text-[12px] text-agent-text-muted hover:text-agent-text",
        onClick: startEdit,
        children: [
          /* @__PURE__ */ jsx6(Icon4, {
            name: "edit",
            size: 12
          }),
          "Edit"
        ]
      }),
      /* @__PURE__ */ jsx6("button", {
        type: "button",
        className: "rounded-md border border-agent-border px-2.5 py-1.5 text-[12px] text-agent-text-muted hover:text-agent-text",
        onClick: () => {
          onDeny();
        },
        children: "Deny"
      }),
      /* @__PURE__ */ jsxs6("button", {
        type: "button",
        className: "flex items-center gap-1 rounded-md bg-rose-500 hover:bg-rose-400 px-3 py-1.5 text-[12px] font-medium text-white",
        onClick: () => {
          handleApprove();
        },
        children: [
          /* @__PURE__ */ jsx6(Icon4, {
            name: "send",
            size: 12
          }),
          `Send ${String(activeCount)} email${activeCount !== 1 ? "s" : ""}`
        ]
      })
    ]
  }) : undefined;
  return /* @__PURE__ */ jsx6(BaseToolCallCard2, {
    icon: "mail",
    title: `Batch send (${String(activeCount)} of ${String(total)})`,
    variant: "rose",
    status: tc.status,
    toolResult,
    superseded,
    isAllowlisted,
    headerExtra: headerNav,
    primaryLabel: `Send ${String(activeCount)} email${activeCount !== 1 ? "s" : ""}`,
    primaryIcon: "send",
    doneLabel: `${String(activeCount)} sent`,
    onApprove: handleApprove,
    onDeny,
    onAllowlistToggle,
    customActions: customActionBar,
    children: /* @__PURE__ */ jsxs6("div", {
      className: isExcluded && !isEditing ? "opacity-40" : "",
      children: [
        /* @__PURE__ */ jsxs6("div", {
          className: "mb-1 text-[11px]",
          children: [
            /* @__PURE__ */ jsx6("span", {
              className: "text-rose-400/80",
              children: "To:"
            }),
            " ",
            /* @__PURE__ */ jsx6("span", {
              className: "text-agent-text",
              children: current.to
            }),
            hasEdits && !isEditing && /* @__PURE__ */ jsx6("span", {
              className: "ml-2 text-[10px] text-amber-400",
              children: "(edited)"
            })
          ]
        }),
        /* @__PURE__ */ jsxs6("div", {
          className: "mb-1 flex items-baseline gap-1 text-[11px]",
          children: [
            /* @__PURE__ */ jsx6("span", {
              className: "shrink-0 text-rose-400/80",
              children: "Subject:"
            }),
            isEditing ? /* @__PURE__ */ jsx6("input", {
              type: "text",
              className: "min-w-0 flex-1 rounded border border-agent-border bg-transparent px-1 py-0.5 text-[11px] text-agent-text outline-none focus:border-rose-400",
              value: editDraft.subject,
              onChange: (e) => {
                setEditDraft((d) => ({ ...d, subject: e.target.value }));
              }
            }) : /* @__PURE__ */ jsx6("span", {
              className: "inline-block rounded border border-transparent px-1 py-0.5 text-agent-text",
              children: displaySubject
            })
          ]
        }),
        isEditing ? /* @__PURE__ */ jsx6("textarea", {
          className: "mb-2 w-full resize-none rounded border border-agent-border bg-transparent px-2 py-1 text-[13px] leading-[1.5] text-agent-text outline-none focus:border-rose-400",
          style: { fieldSizing: "content" },
          rows: 1,
          value: editDraft.body_text,
          onChange: (e) => {
            setEditDraft((d) => ({ ...d, body_text: e.target.value }));
          }
        }) : /* @__PURE__ */ jsx6("p", {
          className: "mb-2 whitespace-pre-wrap rounded border border-transparent px-2 py-1 text-[13px] leading-[1.5] text-agent-text",
          children: displayBody
        }),
        current.attachment_ids && current.attachment_ids.length > 0 && /* @__PURE__ */ jsx6("div", {
          className: "mb-2 flex flex-wrap gap-1.5",
          children: current.attachment_ids.map((id, i) => /* @__PURE__ */ jsxs6("span", {
            className: "flex items-center gap-1 rounded bg-surface-secondary px-2 py-0.5 text-[11px] text-agent-text-muted",
            children: [
              /* @__PURE__ */ jsx6(Icon4, {
                name: "paperclip",
                size: 10
              }),
              id
            ]
          }, i))
        })
      ]
    })
  });
}

// plugins/modules/email/ui/TriggerToolCallRenderer.tsx
import { Icon as Icon5 } from "/api/plugins/__host-shim.js?m=ui";
import { BaseToolCallCard as BaseToolCallCard3 } from "/api/plugins/__host-shim.js?m=base";
import { jsx as jsx7, jsxs as jsxs7 } from "/api/plugins/__host-shim.js?m=react-jsx-runtime";
function TriggerToolCallRenderer({
  payload
}) {
  const { toolCall: tc, toolResult, isAllowlisted, superseded, onApprove, onDeny, onAllowlistToggle } = payload;
  const args = tc.args;
  const addresses = [];
  const fromAddresses = args.from_addresses;
  const fromAddress = args.from_address;
  if (fromAddresses)
    addresses.push(...fromAddresses);
  if (fromAddress && !addresses.includes(fromAddress))
    addresses.push(fromAddress);
  const gate = args.gate_prompt ?? "";
  const action = args.action_prompt ?? "";
  const debounce = args.debounce_seconds;
  return /* @__PURE__ */ jsxs7(BaseToolCallCard3, {
    icon: "zap",
    title: `Email trigger (${String(addresses.length)} address${addresses.length !== 1 ? "es" : ""})`,
    variant: "amber",
    status: tc.status,
    toolResult,
    superseded,
    isAllowlisted,
    primaryLabel: "Create trigger",
    primaryIcon: "zap",
    doneLabel: "Trigger created",
    onApprove,
    onDeny,
    onAllowlistToggle,
    children: [
      /* @__PURE__ */ jsxs7("div", {
        className: "mb-2",
        children: [
          /* @__PURE__ */ jsx7("div", {
            className: "mb-1 text-[10px] font-medium uppercase tracking-wider text-amber-400/70",
            children: "Watching"
          }),
          /* @__PURE__ */ jsx7("div", {
            className: "flex flex-wrap gap-1.5",
            children: addresses.map((addr, i) => /* @__PURE__ */ jsxs7("span", {
              className: "flex items-center gap-1 rounded bg-surface-secondary px-2 py-0.5 text-[11px] text-agent-text",
              children: [
                /* @__PURE__ */ jsx7(Icon5, {
                  name: "mail",
                  size: 10,
                  className: "text-amber-400/60"
                }),
                addr
              ]
            }, i))
          })
        ]
      }),
      /* @__PURE__ */ jsxs7("div", {
        className: "mb-2",
        children: [
          /* @__PURE__ */ jsx7("div", {
            className: "mb-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-400/70",
            children: "Condition"
          }),
          /* @__PURE__ */ jsx7("p", {
            className: "rounded border border-transparent px-2 py-1 text-[12px] leading-[1.4] text-agent-text-muted",
            children: gate
          })
        ]
      }),
      /* @__PURE__ */ jsxs7("div", {
        className: "mb-1",
        children: [
          /* @__PURE__ */ jsx7("div", {
            className: "mb-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-400/70",
            children: "Action"
          }),
          /* @__PURE__ */ jsx7("p", {
            className: "rounded border border-transparent px-2 py-1 text-[12px] leading-[1.4] text-agent-text",
            children: action
          })
        ]
      }),
      debounce !== undefined && debounce > 0 && /* @__PURE__ */ jsxs7("div", {
        className: "text-[10px] text-agent-text-muted",
        children: [
          "Debounce: ",
          String(debounce),
          "s"
        ]
      })
    ]
  });
}

// plugins/modules/email/ui/index.tsx
import { setupEventInvalidation } from "/api/plugins/__host-shim.js?m=runtime";
import { decodeHtmlEntities as decodeHtmlEntities2 } from "/api/plugins/__host-shim.js?m=utils";
import { jsx as jsx8 } from "/api/plugins/__host-shim.js?m=react-jsx-runtime";
var EMAIL_TOOL_NAMES = new Set([
  "email.reply",
  "email_reply",
  "email__reply",
  "reply_email",
  "email.send",
  "email_send",
  "email__send",
  "send_email",
  "emails.send",
  "emails.reply",
  "email.batch_send",
  "email_batch_send",
  "emails.batch_send",
  "email.set_trigger",
  "email_set_trigger",
  "emails.set_trigger"
]);
function isEmailTool(name) {
  return EMAIL_TOOL_NAMES.has(name);
}
function metaStr(meta, key) {
  const v = meta?.[key];
  return typeof v === "string" ? v : undefined;
}
function mapEmailListItem(raw) {
  const meta = raw.metadata;
  const fromName = metaStr(meta, "from_name");
  const fromAddr = metaStr(meta, "from_address");
  const subject = metaStr(meta, "subject") ?? raw.name ?? null;
  const sender = fromName ?? fromAddr ?? raw.sender ?? null;
  const sentAt = metaStr(meta, "sent_at") ?? raw.timestamp ?? raw.created_at ?? null;
  const preview = raw.preview ?? null;
  return {
    id: raw.id,
    name: sender,
    schema_id: raw.schema_id ?? "",
    preview: subject ? decodeHtmlEntities2(subject) : preview ? decodeHtmlEntities2(preview) : null,
    timestamp: sentAt ?? null,
    avatar_url: null,
    is_pinned: raw.is_pinned ?? undefined,
    is_archived: raw.is_archived ?? undefined
  };
}
var EmailsModule = defineModule({
  id: "email",
  title: "Emails",
  icon: /* @__PURE__ */ jsx8(Icon6, {
    name: "mail",
    size: 26
  }),
  iconName: "mail",
  themeColor: "pink",
  entityTypes: ["message", "address"],
  primaryEntityType: "message",
  entityLabels: {
    message: {
      icon: "mail",
      label: "Email",
      hasMore: emailHasMore
    },
    address: { icon: "mail", label: "Address", tabLabel: "Addresses" }
  },
  rpc: { list: "email.list", get: "email.get" },
  mapListItem: mapEmailListItem,
  DetailPanel: EmailDetailPanel,
  detailType: "custom",
  EntityCard: EmailCard,
  toolCallRenderers: [
    {
      actions: ["send", "reply"],
      Render: EmailToolCallRenderer
    },
    {
      actions: ["batch_send"],
      Render: EmailBatchSendRenderer
    },
    {
      actions: ["set_trigger"],
      Render: TriggerToolCallRenderer
    }
  ],
  extractAllowlistTarget: (tc) => {
    if (!isEmailTool(tc.name))
      return null;
    if (tc.name.includes("batch"))
      return null;
    const args = tc.args;
    const to = typeof args.to === "string" ? args.to : null;
    if (!to)
      return null;
    return { action: tc.name, targetType: "email_address", targetId: to, targetLabel: to };
  },
  extraSetup: (runtime) => {
    const unsub = setupEventInvalidation(runtime.transport, runtime.queryClient, ["sync.progress", "source.account.connected"], [["email"]]);
    return unsub;
  },
  linkedEntityDisplay: {
    message: { label: "Emails" },
    address: { hidden: true }
  }
});
export {
  EmailsModule
};
