# Magnis

A system for turning communication into context, memory, and action.

→ Live demo: https://magnis.ai (early prototype)

---

## About

I’m building Gearbox Protocol — onchain credit infrastructure for DeFi.

Over time, I ran into a different kind of problem.

Not in code — but in how systems are coordinated.

Most of the work doesn’t live in logic.  
It lives in communication.

Messages, emails, discussions — that’s where decisions happen.

But this layer is not structured, not persistent, and not executable.

Magnis started as an attempt to fix that.

---

## The shift

Most systems today assume:
- data is structured
- decisions are explicit
- execution is well-defined

In reality:
- context lives in chats
- decisions are buried in threads
- knowledge is lost over time

There is no system — only communication.

---

## Why this matters

Most work is communication.

Magnis makes it:
- faster
- more precise
- context-aware

It builds a graph of:
people, messages, relationships, history.

Agents operate on this context.

Everything stays local.

---

## What Magnis is

Magnis treats communication as a system primitive.

It turns:
- messages → data
- data → context
- context → memory
- memory → actions

Not as logs — but as a working system.

---

## Architecture

Magnis is built around:
- a Rust backend as the source of truth
- graph-based local storage
- provider/source integrations
- agent workflows with controlled execution

See [docs/architecture.md](docs/architecture.md)

---

## Status

Early-stage research.

Building in public.

---

## Links

- Live demo: https://magnis.ai
- Repository: https://github.com/0xmikko/magnis