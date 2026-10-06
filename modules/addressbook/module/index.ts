// Address book plugin — entry. Wires the decorated module via the SDK.
import { definePlugin } from "@magnis/plugin-sdk";
import { AddressbookModule } from "./service.ts";

definePlugin(AddressbookModule);
