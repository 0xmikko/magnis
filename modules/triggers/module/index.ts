// Triggers plugin — entry. Wires the decorated module via the SDK.
import { definePlugin } from "@magnis/plugin-sdk";
import { TriggersModule } from "./service.ts";

definePlugin(TriggersModule);
