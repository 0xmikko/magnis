import { agentContracts } from "./native/agent.js";
import { aiModelsContracts } from "./native/ai-models.js";
import { allowlistContracts } from "./native/allowlist.js";
import { billingContracts } from "./native/billing.js";
import { creditsContracts } from "./native/credits.js";
import { episodesContracts } from "./native/episodes.js";
import { evalContracts } from "./native/eval.js";
import { extensionsContracts } from "./native/extensions.js";
import { fileContracts } from "./native/file.js";
import { graphContracts } from "./native/graph.js";
import { groupsContracts } from "./native/groups.js";
import { hooksContracts } from "./native/hooks.js";
import { identityContracts } from "./native/identity.js";
import { memoryContracts } from "./native/memory.js";
import { moduleSettingsContracts } from "./native/module-settings.js";
import { runtimeContracts } from "./native/runtime.js";
import { searchContracts } from "./native/search.js";
import { setupContracts } from "./native/setup.js";
import { skillsContracts } from "./native/skills.js";
import { sourceContracts } from "./native/source.js";
import { subagentsContracts } from "./native/subagents.js";
import { triggersContracts } from "./native/triggers.js";
import { userEventsContracts } from "./native/user-events.js";
import { webContracts } from "./native/web.js";
/**
 * The checked-in native method surface. Each method and its schemas are
 * declared in exactly one `native/<domain>.ts`; this map composes the domains
 * so a method cannot be silently absent from the public package.
 */
export const rpcContracts = {
    ...agentContracts,
    ...aiModelsContracts,
    ...allowlistContracts,
    ...billingContracts,
    ...creditsContracts,
    ...episodesContracts,
    ...evalContracts,
    ...extensionsContracts,
    ...fileContracts,
    ...graphContracts,
    ...groupsContracts,
    ...hooksContracts,
    ...identityContracts,
    ...memoryContracts,
    ...moduleSettingsContracts,
    ...runtimeContracts,
    ...searchContracts,
    ...setupContracts,
    ...skillsContracts,
    ...sourceContracts,
    ...subagentsContracts,
    ...triggersContracts,
    ...userEventsContracts,
    ...webContracts,
};
