# Engines and sessions

How the agent runtime drives models. Architecture context: [architecture.md → Agents](architecture.md#agents).

## Interchangeable engines

The runtime treats the model layer as swappable engines behind one contract:

- **Built-in tool-calling engine** — driven through an in-app model catalog: enable any model with per-token (USD per million) pricing — OpenRouter, any OpenAI-compatible endpoint, or local servers (vLLM, llama.cpp/Ollama-style). API keys are stored write-only in the encrypted vault.
- **Subscription engines** — the user's existing **Claude Code** or **Codex** subscription drives the agent directly: the engine process is held over a long-lived bidirectional channel (not re-spawned per message), authenticates via the user's own subscription login, and needs **no API keys to manage**.

Engines are resolved by capability flags, not by name, and every engine emits **one streaming event union** — the rest of the system cannot tell them apart.

## Persistent sessions

Every conversation (episode) maps to a stable engine session: after the first turn, subsequent turns **resume the live session** instead of replaying the transcript. Sessions survive engine restarts (database rows are the source of truth), switch cleanly between engines, and are evicted LRU when idle. While working, the agent maintains a live session to-do list and reports its context usage.

## Metering

Usage is metered **per user**: a credit ledger, per-episode usage scoping, and a limit check that runs *before* each turn starts — an exhausted budget produces a structured refusal instead of a silent overrun. Embedding calls are metered through the same accounting.
