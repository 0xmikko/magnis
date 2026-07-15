// X plugin — entry. Wires the decorated module via the SDK.
import { definePlugin } from "@magnis/plugin-sdk";
import { XModule } from "./service.ts";

definePlugin(XModule);
