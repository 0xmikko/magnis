# Security

## Reporting

Report vulnerabilities privately to **mikael.lazarev@gmail.com** (or via GitHub's private vulnerability reporting on this repo). Please don't open public issues for security reports. You'll get an acknowledgment within 48 hours.

## Model

- **Credentials are vaulted and injected per call.** Provider credentials live in a user-scoped encrypted vault (AES-256-GCM); the host injects only what a given source call needs, and the connector process holds no long-lived secret state — nothing in this catalog stores secrets.
- **Modules are sandboxed.** Domain modules run in V8 isolates inside the core under capability manifests: they see only the namespaces and operations their manifest grants.
- **Agent writes are gated.** Every write action an agent proposes stops at a one-click approval before execution.
- **Self-hosted by design.** The graph, the models, and the plugins can all run inside the user's perimeter; no third-party API is mandatory.

## Scope

This repo contains the public plugin catalog and SDKs. Issues in the closed core (desktop/server app) can be reported to the same address.
