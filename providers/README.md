# Model provider data

These TOML files declare provider identities, configuration and optional models.
They contain no adapter code, credentials or personal account configuration.
`adapterId` and `catalogSourceIds` name implementations explicitly registered in
the application build. Several providers may use the same adapter.

The existing catalog build writes a canonical, metadata-only `providers.json`.
Both `plugins_dist/providers.json` and `catalog/providers.json` carry that same
validated data; the normal channel publishes it beside the package indexes.
Changing a file under `providers/` runs canonical validation through the existing
commit adapter, and the complete catalog build validates it again.

Its validators are generated from the host SDK by `scripts/gen-host-stubs.sh`
with explicit `--sdk-contract` selectors for `core/ai-model` and
`core/extension-configuration`; the release also refreshes the related billing
and Episode usage contracts from the same host checkout.
The backend uses its own SDK at runtime. The provider document is not an
installable Source/Module package and cannot load executable code.

TOML omits nullable metadata because it has no null literal. Omitted endpoints,
optional limits or prices remain unknown/null in the normalized document; this
never invents an endpoint, capability or free price. Required identities,
adapter/reader declarations, configuration fields and model evidence are
validated by the canonical SDK schema. An omitted optional models list is empty.

Environment names belong to provider IDs: `MP_OPENROUTER_API_KEY` configures
OpenRouter, even though its adapter is `openai-compatible`. API keys come from
the service and are entered through the application's existing Settings or
seeded from the owner's environment. Files here declare field names only.

The explicit decision and embedding models preserve the existing curated
metadata and rates checked on 2026-10-08. The `models-dev` reader continues to
supply supported language-model metadata. Catalog presence does not prove
account entitlement; admission and execution still validate the exact saved
provider connection.
