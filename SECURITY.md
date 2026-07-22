# Security

## Reporting

Report vulnerabilities privately to **mikael.lazarev@gmail.com** (or via GitHub's private vulnerability reporting on this repo). Please don't open public issues for security reports. You'll get an acknowledgment within 48 hours.

## Model

- **Source connectors own their credentials.** Each source runs as a separate process; provider tokens live with the connector, not the core, and are injected per call — nothing in this catalog stores long-lived secrets.
- **Modules are sandboxed.** Domain modules run in V8 isolates inside the core under capability manifests: they see only the namespaces and operations their manifest grants.
- **Agent writes are gated.** Every write action an agent proposes stops at a one-click approval before execution.
- **Self-hosted by design.** The graph, the models, and the plugins can all run inside the user's perimeter; no third-party API is mandatory.

## Scope

This repo contains the public plugin catalog and SDKs. Issues in the closed core (desktop/server app) can be reported to the same address.
