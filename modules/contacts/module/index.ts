// Contacts plugin — entry. Wires the decorated module via the SDK.
import { definePlugin } from "@magnis/plugin-sdk";
import { ContactsModule } from "./service.ts";

definePlugin(ContactsModule);
