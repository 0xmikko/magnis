// SDK lifecycle hooks.
// defineLifecycle runs the install hook immediately and publishes the
// declaration on the well-known global the host reads back.

import { afterEach, describe, expect, it } from "vitest";

import { defineLifecycle } from "../index";

const GLOBAL_KEY = "__magnis_lifecycle_install";

afterEach(() => {
  delete (globalThis as Record<string, unknown>)[GLOBAL_KEY];
});

describe("defineLifecycle", () => {
  it("tst_plugin_sdk_lifecycle_001 default install declares exactly the manifest schemas", () => {
    defineLifecycle({
      install(ctx) {
        ctx.registerManifestSchemas();
      },
    });
    expect((globalThis as Record<string, unknown>)[GLOBAL_KEY]).toBe("manifest");
  });

  it("tst_plugin_sdk_lifecycle_002 explicit registration is published verbatim", () => {
    defineLifecycle({
      install(ctx) {
        ctx.register({ entities: ["notes.note"], facets: [] });
      },
    });
    expect((globalThis as Record<string, unknown>)[GLOBAL_KEY]).toEqual({
      entities: ["notes.note"],
      facets: [],
    });
  });

  it("tst_plugin_sdk_lifecycle_003 a throwing hook publishes NOTHING (host sees no declaration)", () => {
    expect(() => {
      defineLifecycle({
        install() {
          throw new Error("boom");
        },
      });
    }).toThrow("boom");
    expect((globalThis as Record<string, unknown>)[GLOBAL_KEY]).toBeUndefined();
  });
});
