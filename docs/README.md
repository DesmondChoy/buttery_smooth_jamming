# Buttery Smooth Jamming Documentation

## Current Focus: V3 Codex Runtime Architecture

The project is an **autonomous AI jam session** where 4 band member agents
(drums, bass, melody, FX) play together in real-time via Strudel, react to each
other, and respond to a human "boss" directing the session.

The active architecture path is v3: Codex-first runtime and jam orchestration
with deterministic routing and manager-owned jam-state continuity.

| Document | Purpose |
|----------|---------|
| [V3 Migration Plan](./v3/codex-cli-migration-implementation-plan.md) | Provider migration workstreams and acceptance criteria |
| [V3 Codex Runtime Setup](./v3/codex-runtime-setup.md) | Codex profiles, config locations, startup checks (Workstream E) |
| [V3 Workstream G Checkpoint](./v3/bsj-6ud.1-validation-rollout-2026-02-25.md) | Regression gate status, benchmark harness, staged rollout controls |
| [V3 Model Policy Boundary](./v3/model-policy-boundary.md) | Source of truth for model-owned musical decisions vs code-owned guarantees |
| [V3 Model-Policy Playbook](./v3/model-policy-playbook.md) | Operator playbook: tuning knobs, failure triage, policy extension guidance |
| [V3 Jam Boss Prompting Guide](./v3/jam-boss-prompting-guide.md) | User-facing phrase guide: trigger cues, routing, and expected jam reactions |

Post-migration musical enhancements (bsj-bx1 epic) are documented in the
[model policy boundary](./v3/model-policy-boundary.md) and
[v2 technical notes](./v2-jam-session/technical-notes.md).

## V2 Baseline (Reference)

V2 docs remain available as a stable baseline and historical implementation
record for jam semantics and architecture evolution.

| Document | Purpose |
|----------|---------|
| [V2 Overview](./v2-jam-session/README.md) | Quick start, band members, design decisions |
| [V2 Architecture](./v2-jam-session/architecture.md) | System design, diagrams, file structure |
| [V2 Technical Notes](./v2-jam-session/technical-notes.md) | Critical debugging gotchas |
| [V2 Implementation Plan](./v2-jam-session/implementation-plan.md) | Historical: phases 1-6, v1-to-v2 evolution story |

## V1: MVP (Complete)

The single-agent MVP is complete: a web app connecting Codex CLI to Strudel.cc for
AI-assisted live coding music. V1 docs are preserved as a historical record.

| Document | Purpose |
|----------|---------|
| [V1 Overview](./v1-mvp/README.md) | MVP summary, quick start, verification |
| [V1 Architecture](./v1-mvp/architecture.md) | Original system design, single-agent diagrams |
| [V1 Technical Notes](./v1-mvp/technical-notes.md) | Debugging gotchas (still relevant) |
| [V1 Implementation](./v1-mvp/implementation/) | Historical record of phases 1-3 |
| [V1 Roadmap](./v1-mvp/roadmap.md) | Optional features backlog |
