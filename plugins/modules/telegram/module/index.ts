// Telegram plugin — entry. Wires the decorated module via the SDK.
import { definePlugin } from "@magnis/plugin-sdk";
import { TelegramModule } from "./service.ts";

definePlugin(TelegramModule);
