// Meetings plugin — entry. Wires the decorated module via the SDK.
import { definePlugin } from "@magnis/plugin-sdk";
import { MeetingsModule } from "./service.ts";

definePlugin(MeetingsModule);
