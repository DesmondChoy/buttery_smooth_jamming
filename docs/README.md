# Buttery Smooth Jamming Documentation

## Current Focus: V2 Autonomous Jam Session

The project is an **autonomous AI jam session** where 4 band member agents
(drums, bass, melody, FX) play together in real-time via Strudel, react to each
other, and respond to a human "boss" directing the session.

V2 uses **per-agent persistent Codex-backed sessions** for low-latency directives,
replacing the v1 orchestrator architecture (22-29s).

| Document | Purpose |
|----------|---------|
| [V2 Overview](./v2-jam-session/README.md) | Quick start, band members, design decisions |
| [V2 Architecture](./v2-jam-session/architecture.md) | System design, diagrams, file structure |
| [V2 Technical Notes](./v2-jam-session/technical-notes.md) | Critical debugging gotchas |
| [V2 Implementation Plan](./v2-jam-session/implementation-plan.md) | Historical: phases 1-6, v1-to-v2 evolution story |
| [V3 Migration Plan](./v3/codex-cli-migration-implementation-plan.md) | Provider migration workstreams and acceptance criteria |
| [V3 Codex Runtime Setup](./v3/codex-runtime-setup.md) | Codex profiles, config locations, startup checks (Workstream E) |

## V1: MVP (Complete)

The single-agent MVP is complete: a web app connecting Claude Code to Strudel.cc for
AI-assisted live coding music. V1 docs are preserved as a historical record.

| Document | Purpose |
|----------|---------|
| [V1 Overview](./v1-mvp/README.md) | MVP summary, quick start, verification |
| [V1 Architecture](./v1-mvp/architecture.md) | Original system design, single-agent diagrams |
| [V1 Technical Notes](./v1-mvp/technical-notes.md) | Debugging gotchas (still relevant) |
| [V1 Implementation](./v1-mvp/implementation/) | Historical record of phases 1-3 |
| [V1 Roadmap](./v1-mvp/roadmap.md) | Optional features backlog |
