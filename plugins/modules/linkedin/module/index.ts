// Linkedin plugin — entry. Wires the decorated module via the SDK.
import { definePlugin } from "@magnis/plugin-sdk";
import { LinkedinModule } from "./service.ts";

definePlugin(LinkedinModule);
