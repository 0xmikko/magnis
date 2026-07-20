// Lifecycle install: the SDK default —
// register exactly the schemas the manifest declares.
import { defineLifecycle } from "@magnis/plugin-sdk";

defineLifecycle({
  install(ctx) {
    ctx.registerManifestSchemas();
  },
});
