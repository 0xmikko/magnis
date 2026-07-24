// plugins/modules/companies/ui/index.tsx
import { Icon as Icon3 } from "/api/plugins/__host-shim.js?m=ui";
import { defineModule } from "/api/plugins/__host-shim.js?m=base";

// plugins/modules/companies/ui/EntityCards.tsx
import { useContext } from "/api/plugins/__host-shim.js?m=react";
import { BaseEntityCard, ActionPrefix } from "/api/plugins/__host-shim.js?m=base";
import { ExpansionContext } from "/api/plugins/__host-shim.js?m=agent";
import { jsx, jsxs } from "/api/plugins/__host-shim.js?m=react-jsx-runtime";
function str(data, key) {
  const v = data[key];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}
function companyHasMore(data) {
  return str(data, "description") !== undefined || str(data, "location") !== undefined || str(data, "size") !== undefined || str(data, "founded") !== undefined || str(data, "industry") !== undefined && str(data, "domain") !== undefined;
}
function Row({ label, value }) {
  return /* @__PURE__ */ jsxs("div", {
    className: "flex gap-2 text-[11px]",
    children: [
      /* @__PURE__ */ jsx("span", {
        className: "w-20 shrink-0 text-content-tertiary",
        children: label
      }),
      /* @__PURE__ */ jsx("span", {
        className: "min-w-0 flex-1 whitespace-pre-wrap break-words text-content",
        children: value
      })
    ]
  });
}
function CompanyCard(props) {
  const { data, action } = props;
  const name = str(data, "name") ?? "Company";
  const subtitle = str(data, "industry") ?? str(data, "domain") ?? str(data, "website");
  const { expanded } = useContext(ExpansionContext);
  const description = str(data, "description");
  const industry = str(data, "industry");
  const domain = str(data, "domain") ?? str(data, "website");
  const location = str(data, "location");
  const size = str(data, "size");
  const founded = str(data, "founded");
  const rows = [];
  if (description)
    rows.push({ label: "About", value: description });
  if (industry)
    rows.push({ label: "Industry", value: industry });
  if (domain)
    rows.push({ label: "Domain", value: domain });
  if (location)
    rows.push({ label: "Location", value: location });
  if (size)
    rows.push({ label: "Size", value: size });
  if (founded)
    rows.push({ label: "Founded", value: founded });
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

// plugins/modules/companies/ui/CompanyOverview.tsx
import { useCallback, useRef, useState } from "/api/plugins/__host-shim.js?m=react";
import { Icon as Icon2, IconButton, Stack as Stack2, Text as Text2 } from "/api/plugins/__host-shim.js?m=ui";
import { MarkdownEditor, useEditorMentionSuggestion } from "/api/plugins/__host-shim.js?m=markdown";
import { useEntityFacet } from "/api/plugins/__host-shim.js?m=base";

// plugins/modules/companies/ui/CompanyInfoColumn.tsx
import { Icon, Stack, Text } from "/api/plugins/__host-shim.js?m=ui";
import { jsx as jsx2, jsxs as jsxs2 } from "/api/plugins/__host-shim.js?m=react-jsx-runtime";
function hasCompanyInfo(facets) {
  return buildRows(facets).length > 0;
}
function CompanyInfoColumn({ facets }) {
  const rows = buildRows(facets);
  if (rows.length === 0)
    return null;
  return /* @__PURE__ */ jsxs2(Stack, {
    gap: 3,
    className: "rounded-2xl bg-surface-secondary/50 px-5 py-4",
    children: [
      /* @__PURE__ */ jsx2(Text, {
        variant: "title",
        className: "text-sm font-semibold",
        children: "Company details"
      }),
      /* @__PURE__ */ jsx2(Stack, {
        gap: 2,
        children: rows.map((r, i) => /* @__PURE__ */ jsx2(InfoRowView, {
          row: r
        }, `${r.iconName}-${r.value}-${String(i)}`))
      })
    ]
  });
}
function InfoRowView({ row }) {
  return /* @__PURE__ */ jsxs2("div", {
    className: "flex items-start gap-3",
    children: [
      /* @__PURE__ */ jsx2("div", {
        className: "mt-0.5 shrink-0 text-content-tertiary",
        children: /* @__PURE__ */ jsx2(Icon, {
          name: row.iconName,
          size: 16
        })
      }),
      /* @__PURE__ */ jsxs2("div", {
        className: "flex min-w-0 flex-1 items-baseline gap-2",
        children: [
          row.href ? /* @__PURE__ */ jsx2("a", {
            href: row.href,
            target: "_blank",
            rel: "noreferrer",
            className: "truncate text-sm text-accent-primary hover:underline",
            children: row.value
          }) : /* @__PURE__ */ jsx2("span", {
            className: "truncate text-sm text-content-primary",
            children: row.value
          }),
          row.label ? /* @__PURE__ */ jsxs2("span", {
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
  const detailsList = facets.filter((f) => f.schema_id === "companies.company.details");
  const lastDetails = detailsList.at(-1);
  const details = lastDetails ? lastDetails.data : {};
  const website = stringField(details, "website") ?? domainAsUrl(details);
  if (website) {
    rows.push({
      iconName: "globe",
      value: stripScheme(website),
      label: "Website",
      href: website
    });
  }
  const industry = stringField(details, "industry");
  if (industry)
    rows.push({ iconName: "briefcase", value: industry, label: "Industry" });
  const location = stringField(details, "location");
  if (location)
    rows.push({ iconName: "map-pin", value: location, label: "HQ" });
  const size = stringField(details, "size");
  const headcount = numericField(details, "headcount");
  if (size) {
    rows.push({ iconName: "users", value: size, label: "Size" });
  } else if (headcount !== undefined) {
    rows.push({ iconName: "users", value: String(headcount), label: "Employees" });
  }
  const founded = stringField(details, "founded");
  if (founded)
    rows.push({ iconName: "calendar", value: founded, label: "Founded" });
  const stage = stringField(details, "stage");
  if (stage)
    rows.push({ iconName: "scale", value: stage, label: "Stage" });
  const funding = stringField(details, "funding_total");
  if (funding)
    rows.push({ iconName: "scale", value: funding, label: "Funding" });
  for (const f of facets) {
    if (f.schema_id === "companies.company.email") {
      const email = stringField(f.data, "email");
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
    if (f.schema_id === "companies.company.phone") {
      const phone = stringField(f.data, "phone");
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
    if (f.schema_id === "companies.company.external_link") {
      const url = stringField(f.data, "external_url");
      const name = stringField(f.data, "external_name") ?? stringField(f.data, "external_id");
      const sourceType = stringField(f.data, "source_type");
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
  return dedupe(rows);
}
function stringField(data, key) {
  if (!data || typeof data !== "object")
    return;
  const v = data[key];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}
function numericField(data, key) {
  if (!data || typeof data !== "object")
    return;
  const v = data[key];
  return typeof v === "number" ? v : undefined;
}
function domainAsUrl(data) {
  const d = stringField(data, "domain");
  return d ? `https://${d}` : undefined;
}
function stripScheme(url) {
  return url.replace(/^https?:\/\//, "");
}
function emailLabel(facet) {
  const type = stringField(facet.data, "type");
  if (type)
    return capitalize(type);
  return;
}
function phoneLabel(facet) {
  const type = stringField(facet.data, "type");
  if (type)
    return capitalize(type);
  return;
}
function capitalize(s) {
  return s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1);
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

// plugins/modules/companies/ui/CompanyOverview.tsx
import { jsx as jsx3, jsxs as jsxs3 } from "/api/plugins/__host-shim.js?m=react-jsx-runtime";
var DESCRIPTION_SCHEMA_ID = "companies.description";
function CompanyOverview({
  entityId,
  facets
}) {
  if (!hasCompanyInfo(facets)) {
    return /* @__PURE__ */ jsx3(DescriptionPanel, {
      entityId
    });
  }
  return /* @__PURE__ */ jsxs3("div", {
    className: "grid grid-cols-1 gap-6 md:grid-cols-[3fr_2fr] md:gap-6",
    children: [
      /* @__PURE__ */ jsx3("div", {
        children: /* @__PURE__ */ jsx3(DescriptionPanel, {
          entityId
        })
      }),
      /* @__PURE__ */ jsx3("div", {
        children: /* @__PURE__ */ jsx3(CompanyInfoColumn, {
          facets
        })
      })
    ]
  });
}
function DescriptionPanel({ entityId }) {
  const description = useEntityFacet(entityId, DESCRIPTION_SCHEMA_ID);
  const body = description.data?.body ?? "";
  const mentionSuggestion = useEditorMentionSuggestion();
  const [editing, setEditing] = useState(false);
  const [editorKey, setEditorKey] = useState(0);
  const localRef = useRef(body);
  localRef.current = body;
  const handleToggle = useCallback(() => {
    setEditing((m) => {
      setEditorKey((k) => k + 1);
      return !m;
    });
  }, []);
  const handleChange = useCallback((markdown) => {
    description.save({ body: markdown });
  }, [description.save]);
  if (description.isLoading) {
    return /* @__PURE__ */ jsx3(Stack2, {
      gap: 3,
      align: "center",
      className: "py-12",
      children: /* @__PURE__ */ jsx3(Text2, {
        variant: "body",
        color: "tertiary",
        children: "Loading…"
      })
    });
  }
  const isEmpty = !body.trim();
  const editorClass = "[&_.ProseMirror]:!p-0 [&_.milkdown-editor-wrapper]:!p-0";
  return /* @__PURE__ */ jsxs3("div", {
    className: "rounded-2xl bg-surface-secondary/50 px-5 py-3",
    children: [
      /* @__PURE__ */ jsxs3("div", {
        className: "mb-2 flex items-center justify-between",
        children: [
          /* @__PURE__ */ jsx3(Text2, {
            variant: "title",
            className: "text-sm font-semibold",
            children: "Description"
          }),
          /* @__PURE__ */ jsx3(IconButton, {
            variant: "ghost",
            onClick: handleToggle,
            label: editing ? "Done" : "Edit",
            children: /* @__PURE__ */ jsx3(Icon2, {
              name: editing ? "check" : "edit",
              size: 14
            })
          })
        ]
      }),
      isEmpty && !editing ? /* @__PURE__ */ jsx3(Text2, {
        variant: "body",
        color: "tertiary",
        children: "No description yet."
      }) : /* @__PURE__ */ jsx3(MarkdownEditor, {
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

// plugins/modules/companies/ui/CompanyCreateRenderer.tsx
import { BaseToolCallCard } from "/api/plugins/__host-shim.js?m=base";
import { jsx as jsx4, jsxs as jsxs4 } from "/api/plugins/__host-shim.js?m=react-jsx-runtime";
function CompanyCreateRenderer({
  payload
}) {
  const { toolCall: tc, toolResult, isAllowlisted, superseded, onApprove, onDeny, onAllowlistToggle } = payload;
  const args = tc.args;
  const name = args.name ?? "";
  const domain = args.domain ?? "";
  const website = args.website ?? "";
  const industry = args.industry ?? "";
  const summary = args.summary ?? "";
  const field = (label, value) => {
    if (!value)
      return null;
    return /* @__PURE__ */ jsxs4("div", {
      className: "mb-1 flex items-baseline gap-1 text-[11px]",
      children: [
        /* @__PURE__ */ jsxs4("span", {
          className: "shrink-0 w-16 text-[var(--color-agent-tool-purple-text)]",
          children: [
            label,
            ":"
          ]
        }),
        /* @__PURE__ */ jsx4("span", {
          className: "rounded border border-transparent px-1 py-0.5 text-agent-text",
          children: value
        })
      ]
    });
  };
  return /* @__PURE__ */ jsxs4(BaseToolCallCard, {
    icon: "building",
    title: `Create company: ${name}`,
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
      field("Domain", domain),
      field("Website", website),
      field("Industry", industry),
      field("About", summary)
    ]
  });
}

// plugins/modules/companies/ui/index.tsx
import { jsx as jsx5 } from "/api/plugins/__host-shim.js?m=react-jsx-runtime";
var CompaniesModule = defineModule({
  id: "companies",
  title: "Companies",
  icon: /* @__PURE__ */ jsx5(Icon3, {
    name: "building",
    size: 26
  }),
  iconName: "building",
  themeColor: "green",
  entityTypes: ["company"],
  primaryEntityType: "company",
  entityLabels: {
    company: {
      label: "Company",
      tabLabel: "Companies",
      EntityCard: CompanyCard,
      hasMore: companyHasMore
    }
  },
  DetailsTabContent: CompanyOverview,
  toolCallRenderers: [
    {
      actions: ["create"],
      Render: CompanyCreateRenderer
    }
  ]
});
export {
  CompaniesModule
};
