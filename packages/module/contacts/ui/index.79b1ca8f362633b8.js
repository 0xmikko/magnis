// plugins/modules/contacts/ui/index.tsx
import { Icon as Icon5 } from "/api/plugins/__host-shim.js?m=ui";
import { defineModule } from "/api/plugins/__host-shim.js?m=base";

// plugins/modules/contacts/ui/EntityCards.tsx
import { useContext } from "/api/plugins/__host-shim.js?m=react";
import { BaseEntityCard } from "/api/plugins/__host-shim.js?m=base";
import { ActionPrefix } from "/api/plugins/__host-shim.js?m=base";
import { ExpansionContext } from "/api/plugins/__host-shim.js?m=agent";
import { jsx, jsxs } from "/api/plugins/__host-shim.js?m=react-jsx-runtime";
function toStringList(value) {
  if (!Array.isArray(value))
    return [];
  return value.filter((v) => typeof v === "string" && v.length > 0);
}
function contactDisplayName(data) {
  if (typeof data.name === "string" && data.name.length > 0)
    return data.name;
  const email = typeof data.email === "string" ? data.email : undefined;
  if (email) {
    const at = email.indexOf("@");
    const local = at > 0 ? email.slice(0, at) : email;
    if (local.length > 0)
      return local.charAt(0).toUpperCase() + local.slice(1);
  }
  return "Unknown";
}
function emailList(data) {
  const single = typeof data.email === "string" && data.email.length > 0 ? [data.email] : [];
  return Array.from(new Set([...single, ...toStringList(data.emails)]));
}
function phoneList(data) {
  const single = typeof data.phone === "string" && data.phone.length > 0 ? [data.phone] : [];
  return Array.from(new Set([...single, ...toStringList(data.phones)]));
}
function contactHasMore(data) {
  const bio = typeof data.bio === "string" && data.bio.length > 0;
  const location = typeof data.location === "string" && data.location.length > 0;
  const telegram = typeof data.telegram === "string" && data.telegram.length > 0;
  const aliases = toStringList(data.aliases).length > 0;
  const links = toStringList(data.links).length > 0;
  const emails = emailList(data).length;
  const phones = phoneList(data).length;
  return bio || location || telegram || aliases || links || emails > 1 || phones > 1 || emails > 0 && phones > 0;
}
function Row({ label, value }) {
  return /* @__PURE__ */ jsxs("div", {
    className: "flex gap-2 text-[11px]",
    children: [
      /* @__PURE__ */ jsx("span", {
        className: "w-16 shrink-0 text-content-tertiary",
        children: label
      }),
      /* @__PURE__ */ jsx("span", {
        className: "min-w-0 flex-1 break-words text-content",
        children: value
      })
    ]
  });
}
function ContactCard(props) {
  const { data, action } = props;
  const name = contactDisplayName(data);
  const email = data.email;
  const phone = data.phone;
  const role = data.role;
  const company = data.company;
  const subtitle = [role, company].filter(Boolean).join(" · ") || email || phone || "";
  const { expanded } = useContext(ExpansionContext);
  const bio = typeof data.bio === "string" && data.bio.length > 0 ? data.bio : undefined;
  const location = typeof data.location === "string" && data.location.length > 0 ? data.location : undefined;
  const telegram = typeof data.telegram === "string" && data.telegram.length > 0 ? data.telegram : undefined;
  const aliases = toStringList(data.aliases);
  const links = toStringList(data.links);
  const emails = emailList(data);
  const phones = phoneList(data);
  const rows = [];
  if (bio)
    rows.push({ label: "Bio", value: bio });
  if (location)
    rows.push({ label: "Location", value: location });
  if (telegram)
    rows.push({ label: "Telegram", value: telegram });
  if (emails.length > 0)
    rows.push({ label: "Emails", value: emails.join(", ") });
  if (phones.length > 0)
    rows.push({ label: "Phones", value: phones.join(", ") });
  if (aliases.length > 0)
    rows.push({ label: "Aliases", value: aliases.join(", ") });
  if (links.length > 0)
    rows.push({ label: "Links", value: links.join(", ") });
  return /* @__PURE__ */ jsx(BaseEntityCard, {
    ...props,
    children: /* @__PURE__ */ jsxs("div", {
      className: "min-w-0 flex-1",
      children: [
        /* @__PURE__ */ jsxs("span", {
          className: "block truncate text-[12px] font-medium text-content",
          children: [
            /* @__PURE__ */ jsx(ActionPrefix, {
              action
            }),
            name
          ]
        }),
        !expanded && subtitle && /* @__PURE__ */ jsx("span", {
          className: "block truncate text-[11px] text-content-tertiary",
          children: subtitle
        }),
        expanded && rows.length > 0 && /* @__PURE__ */ jsx("div", {
          className: "mt-1 flex flex-col gap-1",
          children: rows.map((r) => /* @__PURE__ */ jsx(Row, {
            label: r.label,
            value: r.value
          }, r.label))
        })
      ]
    })
  });
}

// plugins/modules/contacts/ui/ContactBatchCreateRenderer.tsx
import { useCallback, useMemo, useState } from "/api/plugins/__host-shim.js?m=react";
import { Icon } from "/api/plugins/__host-shim.js?m=ui";
import { BaseToolCallCard } from "/api/plugins/__host-shim.js?m=base";
import { AllowlistDropdown } from "/api/plugins/__host-shim.js?m=agent";
import { jsx as jsx2, jsxs as jsxs2 } from "/api/plugins/__host-shim.js?m=react-jsx-runtime";
function ContactBatchCreateRenderer({
  payload
}) {
  const { toolCall: tc, toolResult, isAllowlisted, superseded, onApprove, onDeny, onAllowlistToggle } = payload;
  const args = tc.args;
  const contacts = useMemo(() => args.contacts ?? [], [args.contacts]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [excluded, setExcluded] = useState(() => new Set);
  const [savedEdits, setSavedEdits] = useState(() => new Map);
  const [editingIndex, setEditingIndex] = useState(null);
  const [editDraft, setEditDraft] = useState({ name: "", email: "", phone: "", company: "", role: "" });
  const total = contacts.length;
  const activeCount = total - excluded.size;
  const current = contacts.at(currentIndex);
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
    const existing = savedEdits.get(currentIndex);
    setEditDraft({
      name: existing?.name ?? current.name,
      email: existing?.email ?? current.email ?? "",
      phone: existing?.phone ?? current.phone ?? "",
      company: existing?.company ?? current.company ?? "",
      role: existing?.role ?? current.role ?? ""
    });
    setEditingIndex(currentIndex);
  }, [current, currentIndex, savedEdits]);
  const saveEdit = useCallback(() => {
    if (editingIndex === null)
      return;
    setSavedEdits((prev) => {
      const next = new Map(prev);
      next.set(editingIndex, { ...editDraft });
      return next;
    });
    setEditingIndex(null);
  }, [editingIndex, editDraft]);
  const revertEdit = useCallback(() => {
    setEditingIndex(null);
  }, []);
  const buildOverrideArgs = useCallback(() => {
    const updatedContacts = contacts.map((c, i) => {
      const edits = savedEdits.get(i);
      if (!edits)
        return c;
      const result = { name: edits.name };
      if (edits.email)
        result.email = edits.email;
      if (edits.phone)
        result.phone = edits.phone;
      if (edits.company)
        result.company = edits.company;
      if (edits.role)
        result.role = edits.role;
      return result;
    });
    return { contacts: updatedContacts, excluded_indices: Array.from(excluded) };
  }, [contacts, savedEdits, excluded]);
  const handleApprove = useCallback(async () => {
    await onApprove(buildOverrideArgs());
  }, [onApprove, buildOverrideArgs]);
  if (!current) {
    return /* @__PURE__ */ jsx2("div", {
      className: "text-agent-text-muted text-[12px]",
      children: "No contacts in batch"
    });
  }
  const saved = savedEdits.get(currentIndex);
  const d = {
    name: isEditing ? editDraft.name : saved?.name ?? current.name,
    email: isEditing ? editDraft.email : saved?.email ?? current.email ?? "",
    phone: isEditing ? editDraft.phone : saved?.phone ?? current.phone ?? "",
    company: isEditing ? editDraft.company : saved?.company ?? current.company ?? "",
    role: isEditing ? editDraft.role : saved?.role ?? current.role ?? ""
  };
  const hasEdits = saved !== undefined;
  const headerNav = /* @__PURE__ */ jsxs2("div", {
    className: "flex items-center gap-1",
    children: [
      /* @__PURE__ */ jsx2("button", {
        type: "button",
        className: "rounded p-0.5 text-agent-text-muted hover:text-agent-text disabled:opacity-30",
        disabled: currentIndex === 0 || isEditing,
        onClick: goLeft,
        children: /* @__PURE__ */ jsx2(Icon, {
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
      /* @__PURE__ */ jsx2("button", {
        type: "button",
        className: "rounded p-0.5 text-agent-text-muted hover:text-agent-text disabled:opacity-30",
        disabled: currentIndex === total - 1 || isEditing,
        onClick: goRight,
        children: /* @__PURE__ */ jsx2(Icon, {
          name: "chevron-right",
          size: 14
        })
      })
    ]
  });
  const field = (label, value, key) => /* @__PURE__ */ jsxs2("div", {
    className: "mb-1 flex items-baseline gap-1 text-[11px]",
    children: [
      /* @__PURE__ */ jsxs2("span", {
        className: "shrink-0 w-16 text-[var(--color-agent-tool-purple-text)]",
        children: [
          label,
          ":"
        ]
      }),
      isEditing ? /* @__PURE__ */ jsx2("input", {
        type: "text",
        className: "min-w-0 flex-1 rounded border border-agent-border bg-transparent px-1 py-0.5 text-[11px] text-agent-text outline-none focus:border-[var(--color-agent-tool-purple-primary)]",
        value,
        onChange: (e) => {
          setEditDraft((prev) => ({ ...prev, [key]: e.target.value }));
        }
      }) : /* @__PURE__ */ jsx2("span", {
        className: "inline-block rounded border border-transparent px-1 py-0.5 text-agent-text",
        children: value || /* @__PURE__ */ jsx2("span", {
          className: "text-agent-text-muted italic",
          children: "—"
        })
      })
    ]
  });
  const customActionBar = isDraft ? isEditing ? /* @__PURE__ */ jsxs2("div", {
    className: "flex items-center justify-end gap-2",
    children: [
      /* @__PURE__ */ jsx2("button", {
        type: "button",
        className: "rounded-md border border-agent-border px-3 py-1.5 text-[12px] text-agent-text-muted hover:text-agent-text",
        onClick: revertEdit,
        children: "Revert"
      }),
      /* @__PURE__ */ jsx2("button", {
        type: "button",
        className: "rounded-md bg-[var(--color-agent-tool-purple-primary)] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[var(--color-agent-tool-purple-primary-hover)]",
        onClick: saveEdit,
        children: "Save"
      })
    ]
  }) : /* @__PURE__ */ jsxs2("div", {
    className: "flex items-center gap-2",
    children: [
      /* @__PURE__ */ jsx2(AllowlistDropdown, {
        isAllowlisted,
        onToggle: onAllowlistToggle
      }),
      /* @__PURE__ */ jsxs2("label", {
        className: "flex cursor-pointer items-center gap-1.5 text-[11px] text-agent-text-muted",
        children: [
          /* @__PURE__ */ jsx2("input", {
            type: "checkbox",
            className: "accent-[var(--color-agent-tool-purple-primary)]",
            checked: isExcluded,
            onChange: () => {
              toggleExclude(currentIndex);
            }
          }),
          "Exclude"
        ]
      }),
      /* @__PURE__ */ jsx2("div", {
        className: "flex-1"
      }),
      !isExcluded && /* @__PURE__ */ jsxs2("button", {
        type: "button",
        className: "flex items-center gap-1 rounded-md border border-agent-border px-2.5 py-1.5 text-[12px] text-agent-text-muted hover:text-agent-text",
        onClick: startEdit,
        children: [
          /* @__PURE__ */ jsx2(Icon, {
            name: "edit",
            size: 12
          }),
          "Edit"
        ]
      }),
      /* @__PURE__ */ jsx2("button", {
        type: "button",
        className: "rounded-md border border-agent-border px-2.5 py-1.5 text-[12px] text-agent-text-muted hover:text-agent-text",
        onClick: () => {
          onDeny();
        },
        children: "Deny"
      }),
      /* @__PURE__ */ jsxs2("button", {
        type: "button",
        className: "flex items-center gap-1 rounded-md bg-[var(--color-agent-tool-purple-primary)] hover:bg-[var(--color-agent-tool-purple-primary-hover)] px-3 py-1.5 text-[12px] font-medium text-white",
        onClick: () => {
          handleApprove();
        },
        children: [
          /* @__PURE__ */ jsx2(Icon, {
            name: "users",
            size: 12
          }),
          `Create ${String(activeCount)} contact${activeCount !== 1 ? "s" : ""}`
        ]
      })
    ]
  }) : undefined;
  return /* @__PURE__ */ jsx2(BaseToolCallCard, {
    icon: "users",
    title: `Batch create (${String(activeCount)} of ${String(total)})`,
    variant: "purple",
    status: tc.status,
    toolResult,
    superseded,
    isAllowlisted,
    headerExtra: headerNav,
    primaryLabel: `Create ${String(activeCount)} contact${activeCount !== 1 ? "s" : ""}`,
    primaryIcon: "users",
    doneLabel: `${String(activeCount)} created`,
    onApprove: handleApprove,
    onDeny,
    onAllowlistToggle,
    customActions: customActionBar,
    children: /* @__PURE__ */ jsxs2("div", {
      className: isExcluded && !isEditing ? "opacity-40" : "",
      children: [
        hasEdits && !isEditing && /* @__PURE__ */ jsx2("span", {
          className: "mb-1 inline-block text-[10px] text-[var(--color-agent-tool-amber-text)]",
          children: "(edited)"
        }),
        field("Name", d.name, "name"),
        field("Email", d.email, "email"),
        field("Phone", d.phone, "phone"),
        field("Company", d.company, "company"),
        field("Role", d.role, "role")
      ]
    })
  });
}

// plugins/modules/contacts/ui/ContactCreateRenderer.tsx
import { BaseToolCallCard as BaseToolCallCard2 } from "/api/plugins/__host-shim.js?m=base";
import { jsx as jsx3, jsxs as jsxs3 } from "/api/plugins/__host-shim.js?m=react-jsx-runtime";
function ContactCreateRenderer({
  payload
}) {
  const { toolCall: tc, toolResult, isAllowlisted, superseded, onApprove, onDeny, onAllowlistToggle } = payload;
  const args = tc.args;
  const name = args.name ?? "";
  const email = args.email ?? "";
  const phone = args.phone ?? "";
  const company = args.company ?? "";
  const role = args.role ?? "";
  const field = (label, value) => {
    if (!value)
      return null;
    return /* @__PURE__ */ jsxs3("div", {
      className: "mb-1 flex items-baseline gap-1 text-[11px]",
      children: [
        /* @__PURE__ */ jsxs3("span", {
          className: "shrink-0 w-16 text-[var(--color-agent-tool-purple-text)]",
          children: [
            label,
            ":"
          ]
        }),
        /* @__PURE__ */ jsx3("span", {
          className: "rounded border border-transparent px-1 py-0.5 text-agent-text",
          children: value
        })
      ]
    });
  };
  return /* @__PURE__ */ jsxs3(BaseToolCallCard2, {
    icon: "user",
    title: `Create contact: ${name}`,
    variant: "purple",
    status: tc.status,
    toolResult,
    superseded,
    isAllowlisted,
    primaryLabel: "Create",
    primaryIcon: "check",
    doneLabel: "Created",
    onApprove,
    onDeny,
    onAllowlistToggle,
    children: [
      field("Name", name),
      field("Email", email),
      field("Phone", phone),
      field("Company", company),
      field("Role", role)
    ]
  });
}

// plugins/modules/contacts/ui/ContactMergeRenderer.tsx
import { useCallback as useCallback2, useEffect, useState as useState2 } from "/api/plugins/__host-shim.js?m=react";
import { Icon as Icon2 } from "/api/plugins/__host-shim.js?m=ui";
import { BaseToolCallCard as BaseToolCallCard3 } from "/api/plugins/__host-shim.js?m=base";
import { jsx as jsx4, jsxs as jsxs4 } from "/api/plugins/__host-shim.js?m=react-jsx-runtime";
function fmtVal(value) {
  if (value === null || value === undefined)
    return "—";
  if (typeof value === "string")
    return value;
  if (Array.isArray(value))
    return value.map(fmtVal).join(", ");
  return JSON.stringify(value);
}
function fieldLabel(key) {
  const parts = key.split(".");
  const last = parts[parts.length - 1] ?? key;
  return last.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
function extractPreview(raw) {
  if (!raw || typeof raw !== "object")
    return null;
  const obj = raw;
  const candidate = obj.preview ?? obj;
  if ("survivor" in candidate && "retired" in candidate && "fields" in candidate) {
    return candidate;
  }
  return null;
}
function extractMergeResult(raw) {
  if (!raw || typeof raw !== "object")
    return null;
  const obj = raw;
  const candidate = obj.result ?? obj;
  if ("survivor_id" in candidate && "facets_moved" in candidate) {
    return candidate;
  }
  return null;
}
function MergeTable({ preview }) {
  const fields = Object.entries(preview.fields);
  return /* @__PURE__ */ jsxs4("div", {
    className: "overflow-hidden rounded-md border border-agent-border/60",
    children: [
      /* @__PURE__ */ jsxs4("div", {
        className: "grid grid-cols-[100px_1fr_1fr_1fr] border-b border-agent-border/40",
        children: [
          /* @__PURE__ */ jsx4("div", {
            className: "px-2 py-1.5"
          }),
          /* @__PURE__ */ jsx4("div", {
            className: "border-l border-agent-border/30 px-2 py-1.5 text-center",
            children: /* @__PURE__ */ jsx4("span", {
              className: "text-[10px] font-semibold text-[var(--color-agent-tool-purple-text)]",
              children: "Contact 1"
            })
          }),
          /* @__PURE__ */ jsx4("div", {
            className: "border-l border-agent-border/30 px-2 py-1.5 text-center",
            children: /* @__PURE__ */ jsx4("span", {
              className: "text-[10px] font-semibold text-[var(--color-agent-tool-amber-text)]",
              children: "Contact 2"
            })
          }),
          /* @__PURE__ */ jsx4("div", {
            className: "border-l border-agent-border/30 px-2 py-1.5 text-center",
            children: /* @__PURE__ */ jsx4("span", {
              className: "text-[10px] font-semibold text-[var(--color-agent-tool-teal-text)]",
              children: "Merged Result"
            })
          })
        ]
      }),
      fields.map(([key, field], rowIdx) => {
        const sv = fmtVal(field.survivor_value);
        const rv = fmtVal(field.retired_value);
        const mr = fmtVal(field.auto_resolved);
        const borderClass = rowIdx < fields.length - 1 ? "border-b border-agent-border/20" : "";
        return /* @__PURE__ */ jsxs4("div", {
          className: `grid grid-cols-[100px_1fr_1fr_1fr] ${borderClass}`,
          children: [
            /* @__PURE__ */ jsx4("div", {
              className: "flex items-center px-2 py-1.5",
              children: /* @__PURE__ */ jsx4("span", {
                className: "text-[11px] text-agent-text-muted",
                children: fieldLabel(key)
              })
            }),
            /* @__PURE__ */ jsx4("div", {
              className: "flex items-center border-l border-agent-border/30 px-2 py-1.5",
              children: /* @__PURE__ */ jsx4("span", {
                className: "text-[11px] text-agent-text",
                children: sv
              })
            }),
            /* @__PURE__ */ jsx4("div", {
              className: "flex items-center border-l border-agent-border/30 px-2 py-1.5",
              children: /* @__PURE__ */ jsx4("span", {
                className: "text-[11px] text-agent-text",
                children: rv
              })
            }),
            /* @__PURE__ */ jsx4("div", {
              className: "flex items-center border-l border-agent-border/30 bg-[var(--color-agent-tool-teal-soft-bg)] px-2 py-1.5",
              children: /* @__PURE__ */ jsx4("span", {
                className: "text-[11px] font-medium text-[var(--color-agent-tool-teal-text)]",
                children: mr
              })
            })
          ]
        }, key);
      })
    ]
  });
}
function ContactMergeRenderer({
  payload,
  runtime
}) {
  const { toolCall: tc, toolResult, isAllowlisted, superseded, onApprove, onDeny, onAllowlistToggle } = payload;
  const args = tc.args;
  const survivorId = args.survivor_id;
  const retiredId = args.retired_id;
  const reason = args.reason;
  const [preview, setPreview] = useState2(null);
  const [loading, setLoading] = useState2(false);
  const [error, setError] = useState2(null);
  const isDone = tc.status === "approved" && toolResult !== undefined;
  useEffect(() => {
    if (!survivorId || !retiredId || preview || isDone)
      return;
    setLoading(true);
    runtime.transport.rpc("contacts.merge_preview", { survivor_id: survivorId, retired_id: retiredId }).then((result) => {
      setPreview(extractPreview(result));
    }).catch((err) => {
      setError(err instanceof Error ? err.message : String(err));
    }).finally(() => {
      setLoading(false);
    });
  }, [survivorId, retiredId, preview, isDone, runtime.transport]);
  const handleApprove = useCallback2(async () => {
    await onApprove();
  }, [onApprove]);
  const mergeResult = isDone ? (() => {
    const raw = toolResult.result;
    if (!raw)
      return null;
    const parsed = typeof raw === "string" ? (() => {
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    })() : raw;
    return extractMergeResult(parsed);
  })() : null;
  const fieldCount = preview ? Object.keys(preview.fields).length : 0;
  const doneLabel = mergeResult ? `Merged (${String(mergeResult.facets_moved)} facets, ${String(mergeResult.links_repointed)} links)` : "Merged";
  return /* @__PURE__ */ jsxs4(BaseToolCallCard3, {
    icon: "users",
    title: "Merge contacts",
    variant: "teal",
    status: tc.status,
    toolResult,
    superseded,
    isAllowlisted,
    primaryLabel: "Confirm Merge",
    primaryIcon: "users",
    doneLabel,
    onApprove: handleApprove,
    onDeny,
    onAllowlistToggle,
    children: [
      loading && /* @__PURE__ */ jsxs4("div", {
        className: "flex items-center gap-2 text-[11px] text-agent-text-muted",
        children: [
          /* @__PURE__ */ jsx4(Icon2, {
            name: "loader",
            size: 12,
            className: "animate-spin"
          }),
          "Loading preview…"
        ]
      }),
      error && /* @__PURE__ */ jsxs4("div", {
        className: "text-[11px] text-red-400",
        children: [
          "Preview error: ",
          error
        ]
      }),
      preview && !isDone && /* @__PURE__ */ jsxs4("div", {
        className: "space-y-2",
        children: [
          reason && /* @__PURE__ */ jsx4("div", {
            className: "text-[11px] text-agent-text-muted italic",
            children: reason
          }),
          /* @__PURE__ */ jsx4(MergeTable, {
            preview
          }),
          /* @__PURE__ */ jsxs4("div", {
            className: "flex gap-3 text-[10px] text-agent-text-muted",
            children: [
              /* @__PURE__ */ jsxs4("span", {
                children: [
                  String(fieldCount),
                  " fields resolved"
                ]
              }),
              /* @__PURE__ */ jsxs4("span", {
                children: [
                  String(preview.links_to_repoint),
                  " links to transfer"
                ]
              })
            ]
          })
        ]
      }),
      isDone && mergeResult && /* @__PURE__ */ jsxs4("div", {
        className: "space-y-1 text-[11px]",
        children: [
          /* @__PURE__ */ jsxs4("div", {
            className: "flex items-center gap-1.5 text-[var(--color-agent-tool-teal-text)]",
            children: [
              /* @__PURE__ */ jsx4(Icon2, {
                name: "circle-check",
                size: 14
              }),
              /* @__PURE__ */ jsx4("span", {
                children: "Contacts merged successfully"
              })
            ]
          }),
          /* @__PURE__ */ jsxs4("div", {
            className: "text-agent-text-muted",
            children: [
              String(mergeResult.facets_moved),
              " facets transferred, ",
              String(mergeResult.links_repointed),
              " links repointed",
              mergeResult.links_deduplicated > 0 && `, ${String(mergeResult.links_deduplicated)} deduplicated`
            ]
          })
        ]
      })
    ]
  });
}

// plugins/modules/contacts/ui/ContactOverview.tsx
import { useCallback as useCallback3, useRef, useState as useState3 } from "/api/plugins/__host-shim.js?m=react";
import { Icon as Icon4, IconButton, Stack as Stack2, Text as Text2 } from "/api/plugins/__host-shim.js?m=ui";
import { MarkdownEditor } from "/api/plugins/__host-shim.js?m=markdown";
import { useEditorMentionSuggestion } from "/api/plugins/__host-shim.js?m=markdown";
import { useEntityFacet } from "/api/plugins/__host-shim.js?m=base";

// plugins/modules/contacts/ui/ContactInfoColumn.tsx
import { Icon as Icon3, Stack, Text } from "/api/plugins/__host-shim.js?m=ui";
import { jsx as jsx5, jsxs as jsxs5 } from "/api/plugins/__host-shim.js?m=react-jsx-runtime";
function ContactInfoColumn({ facets }) {
  const rows = buildRows(facets);
  if (rows.length === 0)
    return null;
  return /* @__PURE__ */ jsxs5(Stack, {
    gap: 3,
    className: "rounded-2xl bg-surface-secondary/50 px-5 py-4",
    children: [
      /* @__PURE__ */ jsx5(Text, {
        variant: "title",
        className: "text-sm font-semibold",
        children: "Contact details"
      }),
      /* @__PURE__ */ jsx5(Stack, {
        gap: 2,
        children: rows.map((r, i) => /* @__PURE__ */ jsx5(InfoRowView, {
          row: r
        }, `${r.iconName}-${r.value}-${String(i)}`))
      })
    ]
  });
}
function InfoRowView({ row }) {
  return /* @__PURE__ */ jsxs5("div", {
    className: "flex items-start gap-3",
    children: [
      /* @__PURE__ */ jsx5("div", {
        className: "mt-0.5 shrink-0 text-content-tertiary",
        children: /* @__PURE__ */ jsx5(Icon3, {
          name: row.iconName,
          size: 16
        })
      }),
      /* @__PURE__ */ jsxs5("div", {
        className: "flex min-w-0 flex-1 items-baseline gap-2",
        children: [
          row.href ? /* @__PURE__ */ jsx5("a", {
            href: row.href,
            className: "truncate text-sm text-accent-primary hover:underline",
            children: row.value
          }) : /* @__PURE__ */ jsx5("span", {
            className: "truncate text-sm text-content-primary",
            children: row.value
          }),
          row.label ? /* @__PURE__ */ jsxs5("span", {
            className: "shrink-0 text-xs text-content-tertiary",
            children: [
              "· ",
              row.label
            ]
          }) : null
        ]
      })
    ]
  });
}
function buildRows(facets) {
  const rows = [];
  for (const f of facets) {
    if (f.schema_id === "contacts.person.email") {
      const email = stringField(f, "email");
      if (email) {
        rows.push({
          iconName: "mail",
          value: email,
          label: emailLabel(f),
          href: `mailto:${email}`
        });
      }
    }
  }
  for (const f of facets) {
    if (f.schema_id === "contacts.person.phone") {
      const phone = stringField(f, "phone");
      if (phone) {
        rows.push({
          iconName: "phone",
          value: phone,
          label: phoneLabel(f),
          href: `tel:${phone}`
        });
      }
    }
  }
  for (const f of facets) {
    if (f.schema_id === "contacts.person.external_link") {
      const url = stringField(f, "external_url");
      const name = stringField(f, "external_name") ?? stringField(f, "external_id");
      const sourceType = stringField(f, "source_type");
      if (name) {
        rows.push({
          iconName: sourceType === "slack" ? "slack" : "link",
          value: name,
          label: sourceType ? capitalize(sourceType) : undefined,
          href: url ?? undefined
        });
      }
    }
  }
  for (const f of facets) {
    if (f.schema_id === "contacts.person.profile") {
      const birthday = stringField(f, "birthday");
      if (birthday) {
        rows.push({
          iconName: "gift",
          value: formatBirthday(birthday),
          label: "Birthday"
        });
        break;
      }
    }
  }
  return dedupe(rows);
}
function stringField(facet, key) {
  const v = facet.data[key];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}
function emailLabel(facet) {
  const type = stringField(facet, "type");
  if (type)
    return capitalize(type);
  return stringField(facet, "is_primary") === "true" ? "Primary" : undefined;
}
function phoneLabel(facet) {
  const type = stringField(facet, "type");
  if (type)
    return capitalize(type);
  return;
}
function capitalize(s) {
  return s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1);
}
function formatBirthday(raw) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (!m)
    return raw;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December"
  ];
  const name = months[month - 1] ?? raw;
  return `${String(day)} ${name} ${String(year)}`;
}
function dedupe(rows) {
  const seen = new Set;
  const out = [];
  for (const r of rows) {
    const key = `${r.iconName}:${r.value}`;
    if (seen.has(key))
      continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

// plugins/modules/contacts/ui/ContactOverview.tsx
import { jsx as jsx6, jsxs as jsxs6 } from "/api/plugins/__host-shim.js?m=react-jsx-runtime";
var DESCRIPTION_SCHEMA_ID = "contacts.description";
function ContactOverview({
  entityId,
  facets
}) {
  return /* @__PURE__ */ jsxs6("div", {
    className: "grid grid-cols-1 gap-6 md:grid-cols-[2fr_3fr] md:gap-6",
    children: [
      /* @__PURE__ */ jsx6("div", {
        children: /* @__PURE__ */ jsx6(ContactInfoColumn, {
          facets
        })
      }),
      /* @__PURE__ */ jsx6("div", {
        children: /* @__PURE__ */ jsx6(DescriptionPanel, {
          entityId
        })
      })
    ]
  });
}
function DescriptionPanel({ entityId }) {
  const description = useEntityFacet(entityId, DESCRIPTION_SCHEMA_ID);
  const body = description.data?.body ?? "";
  const mentionSuggestion = useEditorMentionSuggestion();
  const [editing, setEditing] = useState3(false);
  const [editorKey, setEditorKey] = useState3(0);
  const localRef = useRef(body);
  localRef.current = body;
  const handleToggle = useCallback3(() => {
    setEditing((m) => {
      setEditorKey((k) => k + 1);
      return !m;
    });
  }, []);
  const handleChange = useCallback3((markdown) => {
    description.save({ body: markdown });
  }, [description.save]);
  if (description.isLoading) {
    return /* @__PURE__ */ jsx6(Stack2, {
      gap: 3,
      align: "center",
      className: "py-12",
      children: /* @__PURE__ */ jsx6(Text2, {
        variant: "body",
        color: "tertiary",
        children: "Loading…"
      })
    });
  }
  const isEmpty = !body.trim();
  const editorClass = "[&_.ProseMirror]:!p-0 [&_.milkdown-editor-wrapper]:!p-0";
  return /* @__PURE__ */ jsxs6("div", {
    className: "rounded-2xl bg-surface-secondary/50 px-5 py-3",
    children: [
      /* @__PURE__ */ jsxs6("div", {
        className: "mb-2 flex items-center justify-between",
        children: [
          /* @__PURE__ */ jsx6(Text2, {
            variant: "title",
            className: "text-sm font-semibold",
            children: "Description"
          }),
          /* @__PURE__ */ jsx6(IconButton, {
            variant: "ghost",
            onClick: handleToggle,
            label: editing ? "Done" : "Edit",
            children: /* @__PURE__ */ jsx6(Icon4, {
              name: editing ? "check" : "edit",
              size: 14
            })
          })
        ]
      }),
      isEmpty && !editing ? /* @__PURE__ */ jsx6(Text2, {
        variant: "body",
        color: "tertiary",
        children: "No description yet."
      }) : /* @__PURE__ */ jsx6(MarkdownEditor, {
        initialValue: body,
        onChange: editing ? handleChange : () => {},
        placeholder: "Add a description…",
        readOnly: !editing,
        autoFocus: editing,
        mentionSuggestion: editing ? mentionSuggestion : undefined,
        className: editorClass
      }, `${editing ? "edit" : "view"}-${String(editorKey)}`)
    ]
  });
}

// plugins/modules/contacts/ui/index.tsx
import { jsx as jsx7 } from "/api/plugins/__host-shim.js?m=react-jsx-runtime";
var MOCK_TAGS = [
  "Friend",
  "Partner",
  "Crypto",
  "Berlin Tech"
];
var ContactsModule = defineModule({
  id: "contacts",
  title: "Contacts",
  icon: /* @__PURE__ */ jsx7(Icon5, {
    name: "user",
    size: 26
  }),
  iconName: "user",
  themeColor: "purple",
  entityTypes: ["person"],
  primaryEntityType: "person",
  entityLabels: { person: { icon: "user", label: "Contact" } },
  rpc: { update: "contacts.update" },
  enableListRename: true,
  EntityCard: ContactCard,
  hasMore: contactHasMore,
  DetailsTabContent: ContactOverview,
  toolCallRenderers: [
    {
      actions: ["create"],
      Render: ContactCreateRenderer
    },
    {
      actions: ["batch_create"],
      Render: ContactBatchCreateRenderer
    },
    {
      actions: ["merge"],
      Render: ContactMergeRenderer
    }
  ],
  groupBy: "letter",
  getGroupLetter: (item) => item.name?.[0]?.toUpperCase() ?? "#",
  mapListItem: (raw) => ({
    id: raw.id,
    name: raw.name ?? null,
    schema_id: raw.schema_id ?? "",
    preview: raw.email ?? raw.phone ?? null,
    timestamp: null,
    avatar_url: raw.avatar_url ?? null,
    is_pinned: raw.is_pinned ?? undefined,
    is_archived: raw.is_archived ?? undefined
  })
});
export {
  MOCK_TAGS,
  ContactsModule
};
