// Email plugin — entry. Wires the decorated module via the SDK.
import { definePlugin } from "@magnis/plugin-sdk";
import { EmailModule } from "./service.ts";

definePlugin(EmailModule);
