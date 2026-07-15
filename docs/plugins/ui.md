# Writing the Plugin UI

The UI half lives in `plugins/modules/<id>/ui/`. It is **not** bundled by Vite — the
backend serves it at `/api/plugins/modules/<id>/ui/<file>` and the frontend
**dynamic-imports** it at startup. It imports the host app only through the
`@magnis/host/*` aliases, never deep `frontend/src` paths. Reference:
`plugins/modules/contacts/ui/` and `plugins/modules/companies/ui/`.

## Entry point

```tsx
// ui/index.tsx
import { Icon } from "@magnis/host/ui";
import { defineModule } from "@magnis/host/base";
import { ContactCard, contactHasMore } from "./EntityCards";
import { ContactOverview } from "./ContactOverview";

export const ContactsModule = defineModule({
  id: "contacts",
  title: "Contacts",
  icon: <Icon name="user" size={26} />,
  themeColor: "purple",
  entityTypes: ["person"],
  primaryEntityType: "person",
  rpc: { update: "contacts.update" },   // enables inline rename (header EditableTitle)
  enableListRename: true,
  EntityCard: ContactCard,               // agent card
  DetailsTabContent: ContactOverview,    // the "Overview" tab body
  toolCallRenderers: [ { actions: ["create"], Render: ContactCreateRenderer }, ... ],
  mapListItem: (raw) => ({ id, name, schema_id, preview, ... }),
});
```

The shared host renders the detail shell (avatar + name + `OVERVIEW / MEMORY /
FILES …` tabs); your `DetailsTabContent` fills the Overview tab. Tabs like
MEETINGS/PROJECTS are contributed by *those* modules, not yours.

## Agent tool-call renderers (`toolCallRenderers`)

When the agent calls one of your tools, the chat shows an approval/result card.
Provide a renderer per action via `toolCallRenderers: [{ actions: ["create"],
Render: ContactCreateRenderer }]`. A renderer takes
`AgentRendererProps<ToolCallRendererPayload>` and wraps `BaseToolCallCard`
(reference: `plugins/modules/contacts/ui/ContactCreateRenderer.tsx`):

```tsx
import type { AgentRendererProps, ToolCallRendererPayload } from "@magnis/host/runtime";
import { BaseToolCallCard } from "@magnis/host/base";

export function ContactCreateRenderer({
  payload,
}: AgentRendererProps<ToolCallRendererPayload>): JSX.Element {
  const { toolCall, toolResult, isAllowlisted, superseded,
          onApprove, onDeny, onAllowlistToggle } = payload;
  const args = toolCall.args as Record<string, unknown>;   // the tool's params
  return (
    <BaseToolCallCard /* title, status, approve/deny wiring from payload */ >
      {/* render args / toolResult */}
    </BaseToolCallCard>
  );
}
```

`BaseToolCallCard` (host) owns the approve/deny/allowlist chrome; you only render
the tool's args + result. Match a write tool's `@writeTool` action name to the
renderer's `actions`.

## The `@magnis/host/*` surface

Plugin UIs import host code through curated aliases — never `../../components/…`:

| Alias | Provides |
|-------|----------|
| `@magnis/host/ui` | design system: `Icon`, `Stack`, `Row`, `Text`, `Card`, `IconButton`, … |
| `@magnis/host/base` | module base: `defineModule`, `BaseEntityCard`, `BaseToolCallCard`, `ActionPrefix`, `useEntityFacet`, `EntityDetailTabs`, shared types |
| `@magnis/host/runtime` | `useAppRuntime`, `AppRuntime`, renderer/contract types |
| `@magnis/host/agent` | `ExpansionContext`, `ExpandableEntityCard`, `AllowlistDropdown` |
| `@magnis/host/markdown` | `MarkdownEditor`, `useEditorMentionSuggestion` |
| `@magnis/host/utils` | `toAvatarColor`, … |
| `@magnis/plugin-sdk` | shared types (`PaginatedResponse`, …) |

Data fetching: use `useAppRuntime().transport.rpc<T>(method, params)` (see
`ui/queries.ts`), not a bespoke client.

## The host surface is THREE synced layers (critical)

A symbol you import from `@magnis/host/<area>` must exist in all three, or you
get a **loud runtime crash** (`window.__magnis_host[...] not installed` /
`undefined` at the import site):

1. `frontend/src/runtime/plugins/hostShims/<area>.ts` — typecheck/test facade
   (re-exports the real frontend symbol). **Types-only symbols stop here**
   (they're erased at runtime).
2. `frontend/src/runtime/plugins/hostModules.ts` — the runtime registry that
   installs `window.__magnis_host[<area>]` (import + add to the group). **Value
   symbols** (components/hooks/functions) need this.
3. `backend/src/services/plugin_ui/host_shim.rs` — the allowlist of export
   names the served shim re-exports. **Value symbols** need this too.

The header comment in `host_shim.rs` documents the exact 3-step recipe. When you
need a host symbol that isn't exposed yet, add it to all three (types: only #1).

## Tailwind: plugin UIs need `@source`

Tailwind v4 auto-detects content under `frontend/` only. Plugin UIs live in
`plugins/modules/<id>/ui` and load at runtime, so Vite/Tailwind never see them during
the build → any **raw utility class** used directly in a plugin `.tsx`
(`grid grid-cols-[2fr_3fr]`, `rounded-2xl bg-surface-secondary/50`, …) would be
**purged** → unstyled, broken layout.

`frontend/src/app.css` therefore has:

```css
@source "../../plugins/**/ui/**/*.{ts,tsx}";
```

This makes Tailwind scan plugin UIs and generate their classes. If a brand-new
plugin lays out fine in dev but renders flat, suspect a missing/incorrect
`@source` (or restart the dev server so it rescans).

## How the frontend loads it

`frontend/src/modules/index.ts` registers built-in modules statically and plugin
modules via `loadPluginModule`:

```ts
const [companies, contacts] = await Promise.all([
  loadPluginModule<CompaniesPluginUi>("companies", "index.tsx"),
  loadPluginModule<ContactsPluginUi>("contacts", "index.tsx"),
]);
cachedModules = [ ..., contacts.ContactsModule, companies.CompaniesModule, ... ];
```

`main.tsx` awaits `loadAppModules()` before rendering, so the registry is
populated before React mounts. To add a new UI plugin: drop it in
`plugins/modules/<id>/ui`, then `loadPluginModule("<id>", "index.tsx")` here and add its
`Module` to `cachedModules` (do NOT add it to `BUILTIN_MODULES`).

## Verify

`cd frontend && bun run typecheck && bun run lint && bun run test` covers plugin
UIs — the frontend tsconfig `include`s `../plugins/**/ui/**` and vitest resolves
the `@magnis/host/*` aliases via `vite.config.ts`. Visually confirm in the demo
(`scripts/run-plugin-companies-demo.sh`) — and remember that script runs the
**pre-built** `magnis-server`, so rebuild it after backend (e.g. `host_shim.rs`)
changes.
