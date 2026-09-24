// File plugin — entry. Wires the decorated module via the SDK.
import { definePlugin } from "@magnis/plugin-sdk";
import { FileModule } from "./service.ts";

definePlugin(FileModule);
