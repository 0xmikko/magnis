// Companies plugin — entry. Wires the decorated module via the SDK.
import { definePlugin } from "@magnis/plugin-sdk";
import { CompaniesModule } from "./service.ts";

definePlugin(CompaniesModule);
