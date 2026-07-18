#!/usr/bin/env bun
// plugin-new — scaffold a Magnis module-plugin skeleton (Stage 10, optional).
//
//   bun scripts/plugin-new.ts <id>
//
// Generates plugins/modules/<id>/ with the canonical layout (docs/plugins/authoring.md):
// manifest.toml (folder == manifest.id, INV-11; tier community; owns <id>.*),
// module/ (decorated service + definePlugin entry + a unit test satisfying the
// per-kind test bar, DEC-14/INV-5), ui/ (defineModule), types/, package.json,
// tsconfig (experimentalDecorators — the isolate/build contract).
//
// It does NOT install anything: presence-seed picks the folder up on next boot
// (DEC-10), and the printed next-steps cover the catalog entry + integration test.

import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { stringify as tomlStringify } from "smol-toml";

const ID_RE = /^[a-z][a-z0-9_]*$/;

function manifestToml(id: string): string {
  const header =
    `# ${id} — scaffolded Magnis domain module (V8 plugin). Flesh out the schemas,\n` +
    `# capabilities, and surfaces below, then bundle with build-plugins.ts.\n\n`;
  return `${header}${tomlStringify({
    id,
    version: "0.1.0",
    magnis_api_version: "0.1.0",
    tier: "community",
    owns: [`${id}.*`],
    schemas: {
      entities: [
        {
          id: `${id}.item`,
          name: "Item",
          description: `An item owned by the ${id} plugin.`,
        },
      ],
      facets: [
        {
          id: `${id}.item.details`,
          entity_schema: `${id}.item`,
          version: 1,
          json_schema: {
            type: "object",
            properties: {
              title: { type: "string" },
            },
            required: ["title"],
            additionalProperties: false,
          },
          mappings: [],
        },
      ],
      links: [],
    },
    capabilities: {
      facet_write_prefixes: [`${id}.`],
      link_kinds_writable: [],
      rpc_calls: [],
      reads_schemas: [`${id}.`],
      events_emitted: [],
      can_merge_schemas: [],
    },
    surfaces: {
      rpc_handlers: [`${id}.list`],
      tools: [`${id}.list`],
      sync_handlers: [],
    },
  })}\n`;
}

function serviceTs(id: string, cls: string): string {
  return `// ${id} plugin — backend module (V8 isolate). See docs/plugins/authoring.md.
import { tool, type GraphService, type PluginDeps } from "@magnis/plugin-sdk";
import type { ItemListParams, ItemListResponse } from "../types/index.ts";

const ENTITY = "${id}.item";

export class ${cls} {
  private readonly graph: GraphService;
  constructor(deps: PluginDeps) {
    this.graph = deps.graph;
  }

  @tool("list", {
    description: "List ${id} items with pagination.",
    params: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1 },
        offset: { type: "integer", minimum: 0 },
      },
      additionalProperties: false,
    },
  })
  async list(params: ItemListParams): Promise<ItemListResponse> {
    const page = await this.graph.list_entities({
      schema_id: ENTITY,
      limit: params.limit ?? 50,
      offset: params.offset ?? 0,
    });
    return {
      items: page.items.map((e) => ({ id: e.id, name: e.name ?? null })),
      total: page.total,
    };
  }
}
`;
}

function moduleTestTs(id: string, cls: string): string {
  return `// Unit test (mocked GraphService) — the module-kind minimum test bar
// (DEC-14/INV-5): tool shape + no per-row N+1.
import { describe, expect, it, vi } from "vitest";
import type { GraphService, PluginDeps } from "@magnis/plugin-sdk";
import { ${cls} } from "../service.ts";

function makeGraph() {
  return {
    list_entities: vi.fn().mockResolvedValue({
      items: [{ id: "e1", schema_id: "${id}.item", name: "First" }],
      total: 1,
    }),
  } as unknown as GraphService & Record<string, ReturnType<typeof vi.fn>>;
}

function makeModule(graph: GraphService): ${cls} {
  const deps = {
    graph,
    ctx: { extension_id: "${id}", user_id: "u1" },
    util: {},
    rpc: { execute: vi.fn() },
  } as unknown as PluginDeps;
  return new ${cls}(deps);
}

describe("${id} read", () => {
  it("list returns mapped items in one graph call (no N+1)", async () => {
    const graph = makeGraph();
    const mod = makeModule(graph);
    const page = await mod.list({});
    expect(page.total).toBe(1);
    expect(page.items[0]).toEqual({ id: "e1", name: "First" });
    expect(
      (graph as unknown as { list_entities: ReturnType<typeof vi.fn> }).list_entities,
    ).toHaveBeenCalledTimes(1);
  });
});
`;
}

function uiTsx(id: string, title: string): string {
  return `import { Icon } from "@magnis/host/ui";
import { defineModule } from "@magnis/host/base";

export const ${title}Module = defineModule({
  id: "${id}",
  title: "${title}",
  icon: <Icon name="puzzle" size={26} />,
  iconName: "puzzle",
  themeColor: "blue",
  entityTypes: ["${id}.item"],
  primaryEntityType: "${id}.item",
});
`;
}

function typesTs(): string {
  return `export interface ItemListParams {
  readonly limit?: number;
  readonly offset?: number;
}

export interface ItemListItem {
  readonly id: string;
  readonly name: string | null;
}

export interface ItemListResponse {
  readonly items: readonly ItemListItem[];
  readonly total: number;
}
`;
}

function packageJson(id: string): string {
  return `${JSON.stringify(
    {
      name: `@magnis/plugin-${id}`,
      version: "0.1.0",
      private: true,
      type: "module",
      description: `Magnis ${id} plugin — backend module + UI surface served via the V8 plugin runtime.`,
      scripts: { typecheck: "cd ../../frontend && bun run typecheck" },
    },
    null,
    2,
  )}\n`;
}

const TSCONFIG = `${JSON.stringify(
  {
    extends: "../../frontend/tsconfig.json",
    compilerOptions: {
      noEmit: true,
      composite: false,
      experimentalDecorators: true,
    },
    include: ["module/**/*.ts", "types/**/*.ts", "ui/**/*.ts", "ui/**/*.tsx"],
  },
  null,
  2,
)}\n`;

/** Scaffold plugins-root/<id>; returns the created directory. Throws on an
 * invalid id or an existing directory (no overwrite). */
export function scaffoldPlugin(id: string, pluginsRoot: string): string {
  if (!ID_RE.test(id)) {
    throw new Error(
      `invalid plugin id ${JSON.stringify(id)}: must match ${String(ID_RE)} (folder == manifest.id, INV-11)`,
    );
  }
  const dir = join(pluginsRoot, "modules", id);
  if (existsSync(dir)) {
    throw new Error(`plugin dir already exists: ${dir}`);
  }
  const cls = `${id
    .split("_")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join("")}Module`;
  const title = id
    .split("_")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join("");

  mkdirSync(join(dir, "module", "__tests__"), { recursive: true });
  mkdirSync(join(dir, "ui"), { recursive: true });
  mkdirSync(join(dir, "types"), { recursive: true });

  writeFileSync(join(dir, "manifest.toml"), manifestToml(id));
  writeFileSync(
    join(dir, "module", "index.ts"),
    `import { definePlugin } from "@magnis/plugin-sdk";\nimport { ${cls} } from "./service.ts";\n\ndefinePlugin(${cls});\n`,
  );
  writeFileSync(join(dir, "module", "service.ts"), serviceTs(id, cls));
  writeFileSync(
    join(dir, "module", "__tests__", `${id}Read.test.ts`),
    moduleTestTs(id, cls),
  );
  writeFileSync(join(dir, "ui", "index.tsx"), uiTsx(id, title));
  writeFileSync(join(dir, "types", "index.ts"), typesTs());
  writeFileSync(join(dir, "package.json"), packageJson(id));
  writeFileSync(join(dir, "tsconfig.json"), TSCONFIG);
  return dir;
}

// ── CLI ───────────────────────────────────────────────────────────────────
if (import.meta.main) {
  const id = process.argv.at(2);
  if (id === undefined || id.length === 0) {
    console.error("usage: bun scripts/plugin-new.ts <id>");
    process.exit(1);
  }
  const root = join(import.meta.dir, "..", "plugins");
  const dir = scaffoldPlugin(id, root);
  console.log(`scaffolded ${dir}

next steps (docs/plugins/authoring.md):
  1. flesh out manifest.toml (schemas, capabilities, surfaces)
  2. implement module/service.ts + extend the unit test
  3. add a catalog entry to backend/data/extensions.toml (module:magnis.${id})
  4. add backend/tests/plugin_runtime_${id}.rs (integration bar)
  5. bun scripts/build-plugins.ts ${id}   # bundle ui + module
  (presence-seed installs it on next boot — DEC-10)`);
}
