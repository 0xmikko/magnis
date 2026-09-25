// Notes plugin — entry. Wires the decorated module via the SDK.
import { definePlugin } from "@magnis/plugin-sdk";
import { NotesModule } from "./service.ts";

definePlugin(NotesModule);
