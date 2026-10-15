// Web plugin — entry. Wires the decorated module via the SDK.
import { definePlugin } from "@magnis/plugin-sdk";
import { WebModule } from "./service.ts";

definePlugin(WebModule);
